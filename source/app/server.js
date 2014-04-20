var path = require('path');

var root = require('root');
var send = require('send');
var marked = require('marked');

var match = require('../index');

var helpers = require('./helpers');
var markdown = require('./markdown');
var reddit = require('./reddit');

var PORT = 10101;

var app = root();

app.use(require('./middleware/session'));
app.use(require('./middleware/cookies'));
app.use(require('./middleware/render'), {
	basedir: path.join(__dirname, 'views'),
	helpers: helpers
});

var matches = [];

var addMatch = function(options) {
	var game = match(options);

	game.options = options;
	game.id = matches.length;
	game.threads = [];

	game.on('error', function(err) {
		game.error = err;
	});
	game.on('data', function(event) {
		game.latest = event;
	});

	matches.push(game);
	return game;
};

var getMatch = function(id) {
	id = parseInt(id, 10);
	return matches[id];
};

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
	var match = getMatch(this.params.id);

	if(!match) return this.response.error(400, new Error('Invalid id'));
	if(match.error) return this.response.render('./error', { error: match.error });

	var query = eventQuery(this.query);
	var events = match.events.filter(query.filter);

	fn(match, events, query);
});

app.get('/matches', function(request, response) {
	response.render('./matches', {
		matches: matches,
		feeds: Object.keys(match.feeds),
		lineups: Object.keys(match.lineups)
	});
});

app.get('/matches/{id}.md', function(request, response) {
	request.match(function(match, events) {
		response.setHeader('Content-Type', 'text/plain; charset=utf-8');
		response.render('./match_md/index.md', {
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

		app.views.render('./match_md/index.md', helpers(locals), function(err, content) {
			if(err) return response.error(500, err);

			content = marked(content);
			locals.content = content;

			response.render('./match_md/index.html', locals);
		});
	});
});

app.get('/matches/{id}', function(request, response) {
	request.match(function(match, events) {
		response.render('./match', { match: match, lineup: match.lineup, events: events });
	});
});

app.post('/matches', function(request, response) {
	request.on('form', function(body) {
		var options = {
			lineup: { provider: body.lineup_provider, url: body.lineup_url },
			feed: { provider: body.feed_provider, url: body.feed_url }
		};

		addMatch(options);
		response.redirect('/matches');
	});
});

app.get('/matches/preview/{id}.{extension}', function(request, response) {
	request.match(function(match, _, query) {
		var search = request.url.split('?')[1];
		search = search ? ('?' + search) : '';

		response.render('./match_md/preview', {
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

		reddit.post('/api/new_captcha', function(err, captcha) {
			if(err) return response.error(500, err);

			var id = captcha.json.data.iden;
			var captcha = { url: reddit.url('/captcha/' + id), id: id };
			var query = { view: { reddit: true }, exclude: { comment: true } };

			response.render('./reddit', {
				match: match,
				lineup: match.lineup,
				query: query,
				session: session,
				captcha: captcha
			});
		});
	});
});

app.post('/matches/reddit/{id}', function(request, response) {
	var match = getMatch(request.params.id);
	if(!match) return response.error(400, new Error('Invalid id'));

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

			app.views.render('./match_md/index.md', helpers(locals), function(err, content) {
				if(err) return response.error(500, err);

				reddit.post('/api/submit', {
					captcha: data.thread_captcha_solution,
					iden: data.thread_captcha_id,
					kind: 'self',
					sendreplies: true,
					sr: data.thread_subreddit,
					text: content,
					title: data.thread_title
				}, function(err, result) {
					if(err) return response.error(400, err);

					match.threads.push(result.json.data);
					response.redirect('/matches/' + match.id);
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

app.listen(PORT, function() {
	console.log('Server listening on port ' + PORT);
});

try {
	// Load test data
	require('./data').forEach(addMatch);
} catch(err) {}
