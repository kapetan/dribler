var os = require('os');
var path = require('path');
var util = require('util');

var flatfile = require('flat-file-db');
var hat = require('hat');

var dribler = require('../index');

var db = flatfile.sync(path.join(os.tmpdir(), 'dribler.db'));
var matches = {};

var noop = function() {};

var validator = function() {
	var errors = [];
	var fn = function(condition, message) {
		if(condition) errors.push(new Error(message));
	};

	fn.errors = errors;

	return fn;
};

var find = function(arr, fn) {
	for(var i = 0; i < arr.length; i++) {
		if(fn(arr[i])) return arr[i];
	}
};

var copy = function(obj) {
	return JSON.parse(JSON.stringify(obj));
};

var toJSON = function(obj, properties) {
	return properties.reduce(function(acc, p) {
		acc[p] = obj[p];
		return acc;
	}, {});
};

var decorate = function(match, data) {
	match.data = data;
	match.id = data.id;
	match.threads = data.threads;

	match.__defineGetter__('latest', function() {
		return this.events[this.events.length - 1];
	});

	match.getThread = function(id) {
		return find(this.threads, function(thread) {
			return thread.id === id;
		});
	};

	match.addThread = function(thread, callback) {
		thread.updated = Date.now();
		thread.created = thread.updated;
		match.data.updated = thread.updated;

		this.threads.push(thread);

		persistMatch(this, function(err) {
			if(err) return callback(err);
			callback(null, thread);
		});
	};

	match.createThread = function(reddit, data, callback) {
		var self = this;

		createThread(reddit, data, function(err, thread) {
			if(err) return callback(err);
			self.addThread(thread, callback);
		});
	};

	match.createThreadUsingUrl = function(reddit, data, callback) {
		var self = this;

		createThreadUsingUrl(reddit, data, function(err, thread) {
			if(err) return callback(err);
			self.addThread(thread, callback);
		});
	};

	match.updateThread = function(id, reddit, text, callback) {
		callback = callback || noop;

		var self = this;
		var thread = this.getThread(id);

		if(!thread) return callback(new Error('Invalid thread id'));

		updateThread(thread, reddit, text, function(err) {
			if(err) return callback(err);

			thread.updated = Date.now();
			match.data.updated = thread.updated;

			persistMatch(self, callback);
		});
	};

	match.on('error', function(err) {
		match.error = err;
	});

	match.resume();

	return match;
};

var persistMatch = function(match, callback) {
	var data = toJSON(match.data, ['id', 'threads', 'lineup', 'feed', 'updated', 'created']);

	data.threads = data.threads.map(function(thread) {
		return toJSON(thread, ['id', 'title', 'subreddit', 'username', 'url', 'name', 'events', 'updated', 'created']);
	});

	db.put(data.id, data, callback);
};

var createMatch = function(data) {
	var match = dribler(data);

	data.id = hat();
	data.threads = [];
	data.updated = Date.now();
	data.created = data.updated;

	decorate(match, data);

	persistMatch(match);
	matches[match.id] = match;

	return match;
};

var getMatch = function(id) {
	return matches[id];
};

var allMatches = function() {
	return Object.keys(matches).map(function(id) {
		return matches[id];
	});
};

var validateThread = function(data) {
	var assert = validator();

	assert(!data.captcha || !data.captcha.id || !data.captcha.solution, 'Missing captcha');
	assert(!data.subreddit, 'Missing subreddit');
	assert(!data.title, 'Missing title');
	assert(!data.text, 'Missing text');
	assert(!data.events || !data.events.view || !data.events.exclude, 'Missing events options');

	return assert.errors;
};

var validateThreadUsingUrl = function(data) {
	var assert = validator();

	assert(!data.url, 'Missing url');
	assert(!data.text, 'Missing text');
	assert(!data.events || !data.events.view || !data.events.exclude, 'Missing events options');

	return assert.errors;
};

var createThread = function(reddit, data, callback) {
	var errors = validateThread(data);

	if(errors.length) return callback(errors[0]);
	if(!reddit.session) return callback(new Error('Missing reddit session'));

	var body = {
		kind: 'self',
		sendreplies: true,
		sr: data.subreddit,
		title: data.title,
		captcha: data.captcha.solution,
		iden: data.captcha.id,
		text: data.text
	};

	reddit.post('/api/submit', body, function(err, response) {
		if(err) return callback(err);
		response = response.json.data;

		callback(null, {
			id: hat(),
			title: data.title,
			subreddit: data.subreddit,
			username: reddit.session.username,
			url: response.url,
			name: response.name,
			events: copy(data.events)
		});
	});
};

var updateThread = function(thread, reddit, text, callback) {
	if(!reddit.session) return callback(new Error('Missing reddit session'));
	if(reddit.session.username !== thread.username) return callback(new Error('Invalid reddit session'));

	reddit.post('/api/editusertext', { text: text, thing_id: thread.name }, callback);
};

var createThreadUsingUrl = function(reddit, data, callback) {
	var errors = validateThreadUsingUrl(data);

	if(errors.length) return callback(errors[0]);
	if(!reddit.session) return callback(new Error('Missing reddit session'));

	var url = data.url.replace(/\/$/, '') + '.json';

	reddit.get(url, function(err, response) {
		if(err) return callback(err);

		response = [0, 'data', 'children', 0, 'data'].reduce(function(acc, p) {
			if(acc) return acc[p];
		}, response);

		if(!response) return callback(new Error('Empty response'));

		var thread = {
			id: hat(),
			title: response.title,
			subreddit: response.subreddit,
			username: reddit.session.username,
			url: response.url,
			name: response.name,
			events: copy(data.events)
		};

		updateThread(thread, reddit, data.text, function(err) {
			if(err) return callback(err);
			callback(null, thread);
		});
	});
};

db.keys().forEach(function(id) {
	var data = db.get(id);
	var match = dribler(data);

	decorate(match, data);
	matches[match.id] = match;
});

exports.create = createMatch;
exports.get = getMatch;
exports.all = allMatches;
