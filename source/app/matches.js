var os = require('os');
var path = require('path');

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
			return thread.id = id;
		});
	};

	match.createThread = function(reddit, data, callback) {
		var self = this;

		createThread(reddit, data, function(err, thread) {
			if(err) return callback(err);

			self.threads.push(thread);
			persistMatch(self, callback);
		});
	};

	match.updateThread = function(id, reddit, text, callback) {
		callback = callback || noop;

		var thread = this.getThread();
		if(!thread) return callback(new Error('Invalid thread id'));

		updateThread(thread.name, reddit, text, callback);
	};

	match.on('error', function(err) {
		match.error = err;
	});

	return match;
};

var persistMatch = function(match, callback) {
	db.put(match.id, match.data, callback);
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

var createThread = function(reddit, data, callback) {
	data.kind = 'self';
	data.sendreplies = true;

	reddit.post('/api/submit', data, function(err, response) {
		if(err) return callback(err);
		response = response.json.data;

		callback(null, {
			id: hat(),
			title: data.title,
			subreddit: data.sr,
			username: reddit.session.username,
			url: response.url,
			name: response.name
		});
	});
};

var updateThread = function(name, reddit, text, callback) {
	reddit.post('/api/editusertext', { text: text, thing_id: name }, callback);
};

db.keys().forEach(function(id) {
	var data = db.get(id);
	var match = dribler(data);

	decorate(match, data);
	matches[match.id] = match;
});

exports.db = db;
exports.create = createMatch;
exports.get = getMatch;
exports.all = allMatches;
