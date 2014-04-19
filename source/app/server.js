var path = require('path');

var root = require('root');
var send = require('send');
var pejs = require('pejs');
var marked = require('marked');

var match = require('../index');

var helpers = require('./helpers');
var markdown = require('./markdown');

var PORT = 10101;

var app = root();
var views = pejs({ basedir: path.join(__dirname, 'views') });

var matches = [];

var addMatch = function(options) {
	var game = match(options);

	game.options = options;
	game.id = matches.length;

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

var parseFilter = function(params) {
	if(!params) return {};
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

var filterQuery = function(query) {
	var exclude = parseFilter(query.exclude);
	var include = parseFilter(query.include);

	if(exclude._length) {
		return function(event) {
			return !exclude.hasOwnProperty(event.type);
		};
	}
	if(include._length) {
		return function(event) {
			return include.hasOwnProperty(event.type);
		};
	}

	return function() { return true; };
};

app.use('response.render', function(template, locals) {
	var self = this;

	views.render(template, helpers(locals), function(err, content) {
		if(err) return self.error(500, err);
		self.send(content);
	});
});

app.use('request.match', function(fn) {
	var match = getMatch(this.params.id);
	var events = match.events.filter(filterQuery(this.query));

	if(!match) return this.response.error(400, new Error('Invalid id'));
	if(match.error) return this.response.render('./error', { error: match.error });

	fn(match, events);
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

		views.render('./match_md/index.md', helpers(locals), function(err, content) {
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

app.get('/matches/preview/{id}.{extension}', function(request, response) {
	var search = request.url.split('?')[1];
	search = search ? ('?' + search) : '';

	var query = {
		exclude: parseFilter(request.query.exclude),
		include: parseFilter(request.query.include),
		view: {
			simple: request.query.view === 'simple',
			reddit: request.query.view === 'reddit'
		}
	};

	request.match(function(match) {
		response.render('./match_md/preview', {
			match: match,
			lineup: match.lineup,
			extension: request.params.extension,
			search: search,
			query: query
		});
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
