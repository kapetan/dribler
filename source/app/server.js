var path = require('path');

var root = require('root');
var send = require('send');
var marked = require('marked');

var match = require('../index');

var helpers = require('./helpers');
var markdown = require('./markdown');
var reddit = require('./reddit');

var matches = require('./matches');

var config = {
	captcha: process.argv.indexOf('--no-captcha') === -1,
	port: 10101
};

var app = root();

app.use(require('./middleware/session'));
app.use(require('./middleware/cookies'));
app.use(require('./middleware/render'), {
	basedir: path.join(__dirname, 'views'),
	helpers: helpers
});

var parseQuery = function(params) {
	if(!params) return { _length: 0 };
	if(!Array.isArray(params)) params = [params];

	return params.reduce(function(acc, p) {
		var keys = p.split(/\s*,\s*/);
		keys.forEach(function(k) {
			acc._length++;
			acc[k] = true;
		});

		return acc;
	}, { _length: 0 });
};

var eventQuery = function(query) {
	var exclude = parseQuery(query.exclude);
	var filter = function() { return true; };
	var view = {};

	view.reddit = query.view === 'reddit';
	view.simple = query.view === 'simple' || !view.reddit;

	if(exclude._length) {
		filter = function(event) {
			return !exclude.hasOwnProperty(event.type);
		};
	}

	return {
		exclude: exclude,
		view: view,
		filter: filter
	};
};

app.use('request.match', function(fn) {
	var match = matches.get(this.params.id);

	if(!match) return this.response.error(404, new Error('Invalid id'));
	if(match.error) return this.response.render('./error', { error: match.error });

	var query = eventQuery(this.query);
	var events = match.events.filter(query.filter);

	fn(match, events, query);
});

app.get('/matches', function(request, response) {
	response.render('./matches', {
		matches: matches.all(),
		feeds: Object.keys(match.feeds),
		lineups: Object.keys(match.lineups)
	});
});

app.get('/matches/{id}.md', function(request, response) {
	request.match(function(match, events) {
		response.setHeader('Content-Type', 'text/plain; charset=utf-8');
		response.render('./match/markdown/index.md', {
			match: match,
			lineup: match.lineup,
			events: events,
			markdown: markdown(request.query.view)
		});
	});
});

app.get('/matches/{id}.html', function(request, response) {
	request.match(function(match, events) {
		var locals = {
			match: match,
			lineup: match.lineup,
			events: events,
			markdown: markdown(request.query.view)
		};

		app.views.render('./match/markdown/index.md', helpers(locals), function(err, content) {
			if(err) return response.error(500, err);

			content = marked(content);
			locals.content = content;

			response.render('./match/preview/base', locals);
		});
	});
});

app.get('/matches/{id}', function(request, response) {
	request.match(function(match, events) {
		response.render('./match/main', { match: match, lineup: match.lineup, events: events });
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
	request.match(function(match, _, query) {
		var search = request.url.split('?')[1];
		search = search ? ('?' + search) : '';

		response.render('./match/preview', {
			match: match,
			lineup: match.lineup,
			extension: request.params.extension,
			search: search,
			query: query
		});
	});
});

app.get('/matches/reddit/{id}', function(request, response) {
	request.match(function(match) {
		var session = request.session;

		var oncaptcha = function(id) {
			var captcha = { url: reddit.url('/captcha/' + id), id: id };
			var query = { view: { reddit: true }, exclude: { comment: true } };

			response.render('./match/reddit', {
				match: match,
				lineup: match.lineup,
				query: query,
				session: session,
				captcha: captcha
			});
		};

		if(!config.captcha) return oncaptcha(null);

		reddit.post('/api/new_captcha', function(err, captcha) {
			if(err) return response.error(500, err);
			oncaptcha(captcha.json.data.iden);
		});
	});
});

app.post('/matches/reddit/{id}', function(request, response) {
	var match = matches.get(request.params.id);
	if(!match) return response.error(404, new Error('Invalid id'));

	request.on('form', function(data) {
		var session = request.session;
		var query = eventQuery(data);
		var events = match.events.filter(query.filter);

		var onsession = function(reddit) {
			response.session = reddit.session;

			var locals = {
				match: match,
				lineup: match.lineup,
				events: events,
				markdown: markdown(data.view)
			};

			app.views.render('./match/markdown/index.md', helpers(locals), function(err, content) {
				if(err) return response.error(500, err);

				match.createThread(reddit, {
					captcha: data.thread_captcha_solution,
					iden: data.thread_captcha_id,
					sr: data.thread_subreddit,
					text: content,
					title: data.thread_title
				}, function(err) {
					if(err) return response.error(500, err);
					response.redirect('/matches/reddit/' + match.id);
				});
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
