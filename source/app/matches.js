var os = require('os');
var path = require('path');
var util = require('util');

var flatfile = require('flat-file-db');
var hat = require('hat');

var dribler = require('../index');

var db = flatfile.sync(path.join(os.tmpdir(), 'dribler.db'));
var matches = {};

var noop = function() {};

var find = function(arr, fn) {
	for(var i = 0; i < arr.length; i++) {
		if(fn(arr[i])) return arr[i];
	}
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

	match.createThread = function(reddit, data, callback) {
		var self = this;

		createThread(reddit, data, function(err, thread) {
			if(err) return callback(err);

			thread.updated = Date.now();
			thread.created = thread.updated;

			self.threads.push(thread);
			persistMatch(self, callback);
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
	var data = match.data;

	data.updated = Date.now();
	data.created = data.created || data.updated;

	db.put(data.id, data, callback);
};

var createMatch = function(data) {
	var match = dribler(data);

	data.id = hat();
	data.threads = [];

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
	var errors = [];
	var error = function(message) {
		errors.push(new Error(message));
	};

	if(!data.captcha || !data.captcha.id || !data.captcha.solution) error('Missing captcha');
	if(!data.subreddit) error('Missing subreddit');
	if(!data.title) error('Missing title');
	if(!data.text) error('Missing text');
	if(!data.events || !data.events.view || !data.events.exclude) error('Missing events options');

	return errors;
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
			events: data.events
		});
	});
};

var updateThread = function(thread, reddit, text, callback) {
	if(!reddit.session) return callback(new Error('Missing reddit session'));
	if(reddit.session.username !== thread.username) return callback(new Error('Invalid reddit session'));

	reddit.post('/api/editusertext', { text: text, thing_id: thread.name }, callback);
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
