var path = require('path');
var stream = require('stream');
var util = require('util');

var root = require('root');
var send = require('send');
var marked = require('marked');
var reddit = require('redditor');

var match = require('../index');

var helpers = require('./helpers');
var markdown = require('./markdown');

var matches = require('./matches');

var config = {
	reddit: process.argv.indexOf('--no-reddit') === -1,
	port: process.env.PORT || 10101
};

if(!config.reddit) {
	var jsonResponse = function() {
		return { json: { data: {} } };
	};

	reddit = require('./reddit.mock')({
		'POST /api/new_captcha': jsonResponse(),
		'POST /api/submit': jsonResponse(),
		'POST /api/editusertext': jsonResponse(),
		'POST /api/login': jsonResponse(),
		'GET /r/*/comments/*/*': [{ data: { children: [{ data: {} }] } }]
	});
}

var app = root();

app.use(require('./middleware/session'));
app.use(require('./middleware/cookies'));
app.use(require('./middleware/render'), {
	basedir: path.join(__dirname, 'views'),
	helpers: helpers
});

var ThreadPreview = function(match, query) {
	this.match = match;
	this.query = query;

	this.events = match.events.filter(function(event) {
		return !query.exclude.hasOwnProperty(event.type);
	});

	this.locals = helpers({
		match: match,
		lineup: match.lineup,
		events: this.events,
		markdown: markdown(query.view)
	});
};

ThreadPreview.prototype.renderMarkdown = function(callback) {
	app.views.render('./match/markdown/index.md', this.locals, callback);
};

ThreadPreview.prototype.renderHtml = function(callback) {
	this.renderMarkdown(function(err, content) {
		if(err) return callback(err);
		callback(null, marked(content));
	});
};

var ThreadStream = function(match, thread, reddit) {
	stream.Writable.call(this, { objectMode: true, highWaterMark: 16 });

	this.match = match;
	this.thread = thread;
	this.reddit = reddit;

	this._latest = 0;
};

util.inherits(ThreadStream, stream.Writable);

ThreadStream.prototype._write = function(event, encoding, callback) {
	var self = this;
	var preview = new ThreadPreview(this.match, this.thread.events);

	if(this._latest === preview.events.length) return callback();

	preview.renderMarkdown(function(err, content) {
		if(err) return callback(err);

		self.match.updateThread(self.thread.id, self.reddit, content, function(err) {
			if(err) return callback(err);

			self._latest = preview.events.length;
			callback();
		});
	});
};

var parseQuery = function(params) {
	if(!params) return {};
	if(!Array.isArray(params)) params = [params];

	return params.reduce(function(acc, p) {
		var keys = p.split(/\s*,\s*/);
		keys.forEach(function(k) {
			if(k) acc[k] = true;
		});

		return acc;
	}, {});
};

app.use('request.match', function(fn) {
	var match = matches.get(this.params.id);

	if(!match) return this.response.error(404, new Error('Invalid id'));
	if(match.error) return this.response.render('./error', { error: match.error });

	var self = this;
	var ondata = function(data) {
		var preview = new ThreadPreview(match, {
			exclude: parseQuery(data.exclude),
			view: markdown.view(data.view)
		});

		fn(match, preview);
	};

	if(this.method === 'POST') {
		this.on('form', function(data) {
			self.body = data;
			ondata(data);
		});
	} else {
		ondata(this.query);
	}
});

app.get('/matches', function(request, response) {
	response.render('./matches', {
		matches: matches.all(),
		feeds: Object.keys(match.feeds),
		lineups: Object.keys(match.lineups)
	});
});

app.get('/matches/{id}.md', function(request, response) {
	request.match(function(match, preview) {
		preview.renderMarkdown(function(err, content) {
			if(err) return response.error(500, err);

			response.setHeader('Content-Type', 'text/plain; charset=utf-8');
			response.send(content);
		});
	});
});

app.get('/matches/{id}.html', function(request, response) {
	request.match(function(match, preview) {
		preview.renderHtml(function(err, content) {
			if(err) return response.error(500, err);

			preview.locals.content = content;
			response.render('./match/preview/base', preview.locals);
		});
	});
});

app.get('/matches/{id}', function(request, response) {
	request.match(function(match, preview) {
		response.render('./match/main', { match: match, lineup: match.lineup, events: preview.events });
	});
});

app.post('/matches', function(request, response) {
	request.on('form', function(body) {
		var options = {
			lineup: { provider: body.lineup_provider, url: body.lineup_url },
			feed: { provider: body.feed_provider, url: body.feed_url }
		};

		matches.create(options);
		response.redirect('/matches');
	});
});

app.get('/matches/preview/{id}.{extension}', function(request, response) {
	request.match(function(match, preview) {
		var search = request.url.split('?')[1];
		search = search ? ('?' + search) : '';

		response.render('./match/preview', {
			match: match,
			lineup: match.lineup,
			extension: request.params.extension,
			search: search,
			query: preview.query
		});
	});
});

app.get('/matches/reddit/{id}', function(request, response) {
	request.match(function(match, preview) {
		var session = request.session;

		var oncaptcha = function(id) {
			var captcha = { url: reddit.url('/captcha/' + id), id: id };
			var query = { view: 'reddit', exclude: { comment: true } };

			response.render('./match/reddit', {
				match: match,
				lineup: match.lineup,
				query: query,
				session: session,
				captcha: captcha
			});
		};

		reddit.post('/api/new_captcha', function(err, captcha) {
			if(err) return response.error(500, err);
			oncaptcha(captcha.json.data.iden);
		});
	});
});

app.post('/matches/reddit/{id}', function(request, response) {
	request.match(function(match, preview) {
		var session = request.session;
		var data = request.body;

		var onsession = function(reddit) {
			preview.renderMarkdown(function(err, content) {
				if(err) return response.error(500, err);

				var thread = {
					captcha: {
						id: data.thread_captcha_id,
						solution: data.thread_captcha_solution
					},
					url: data.thread_url,
					title: data.thread_title,
					subreddit: data.thread_subreddit,
					text: content,
					events: preview.query
				};

				var onfinish = function(err, createdThread) {
					if(err) return response.error(500, err);

					var threadStream = new ThreadStream(match, createdThread, reddit);
					createdThread.stream = threadStream;

					match.pipe(threadStream);
					threadStream.on('error', function() {
						match.unpipe(threadStream);
						delete threads[createdThread.id];
					});

					response.session = reddit.session;
					response.redirect('/matches/reddit/' + match.id);
				};

				if(thread.url) match.createThreadUsingUrl(reddit, thread, onfinish)
				else match.createThread(reddit, thread, onfinish);
			});
		};

		if(data.user_username && data.user_password) {
			reddit({ username: data.user_username, password: data.user_password }, function(err, reddit) {
				if(err) return response.error(400, err);
				onsession(reddit);
			});
		} else if(session) {
			onsession(reddit(session));
		} else {
			response.error(400, new Error('No reddit session'));
		}
	});
});

app.post('/matches/reddit/{id}/{thread}/update', function(request, response) {
	request.match(function(match, preview) {
		var session = request.session;
		if(!session) return response.error(400, new Error('No reddit session'));

		preview.renderMarkdown(function(err, content) {
			if(err) return response.error(500, err);

			match.updateThread(request.params.thread, reddit(session), content, function(err) {
				if(err) return response.error(500, err);
				response.redirect('/matches/reddit/' + match.id);
			});
		});
	});
});

app.post('/matches/reddit/{id}/login', function(request, response) {
	request.on('form', function(data) {
		reddit({ username: data.user_username, password: data.user_password }, function(err, reddit) {
			if(err) return response.error(400, err);

			response.session = reddit.session;
			response.redirect('/matches/reddit/' + request.params.id);
		});
	});
});

app.get('/public/{*}', function(request, response) {
	send(request, request.params.glob)
		.root(path.join(__dirname, 'public'))
		.pipe(response);
});

app.error(function(request, response, err) {
	response.setHeader('Content-Type', 'text/html; charset=utf-8');
	response.render('./error', { error: err });
});

app.listen(config.port, function() {
	console.log('Server listening on port ' + config.port);
});
