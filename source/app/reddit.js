var util = require('util');
var request = require('request');

var BASE_URL = 'http://www.reddit.com';
var USER_AGENT = 'dribler v0.0.1';

var redditUrl = function(url) {
	if(!/^http(s)?:/.test(url)) {
		url = /^\//.test(url) ? url : ('/' + url);
		url = BASE_URL + url;
	}

	return url;
};

var extend = function(that) {
	['get', 'post', 'put', 'patch', 'del', 'head'].forEach(function(method) {
		that[method] = function(url, data, callback) {
			if(!callback && typeof data === 'function') {
				callback = data;
				data = null;
			}

			var headers = {};
			if(that.session) {
				headers['Cookie'] = util.format('reddit_session=%s;', encodeURIComponent(that.session.cookie));
				headers['X-Modhash'] = that.session.modhash;
			}

			return send(method, url, headers, data, callback);
		};
	});

	that.url = redditUrl;

	return that;
};

var send = function(method, url, headers, data, callback) {
	method = method.toUpperCase();
	if(method === 'DEL') method = 'DELETE';

	url = redditUrl(url);
	headers = headers || {};

	var options = {
		method: method,
		url: url,
		headers: headers
	};

	options.headers['User-Agent'] = USER_AGENT;

	if(method in { POST: 1, PATCH: 1, PUT: 1 }) {
		data = data || {};

		data.api_type = 'json';
		options.form = data;
	} else if(data) {
		options.qs = data;
	}

	var onresponse = function(err, response, body) {
		if(err) return callback(err);
		if(!/2\d\d/.test(response.statusCode)) {
			var err = new Error('Unexpected status code ' + response.statusCode);
			return callback(err);
		}

		if(!/\/json/.test(response.headers['content-type'])) return callback(null, body);

		try {
			body = JSON.parse(body);
		} catch(err) {
			return callback(err);
		}

		if(body.json && body.json.errors && body.json.errors.length) {
			var message = body.json.errors[0]
				.filter(function(item) { return item })
				.join(', ');

			return callback(new Error(message));
		}

		callback(null, body);
	};

	return request(options, callback && onresponse);
};

var login = function(credentials, callback) {
	callback = callback || function() {};
	var that = extend({});

	if(credentials.cookie) {
		that.session = credentials;
		callback(null, that);

		return that;
	}

	var data = { user: credentials.username, passwd: credentials.password, rem: true };

	that.post('/api/login', data, function(err, user) {
		if(err) return callback(err);

		var error = function(message) {
			message = util.format('%s: %s', message, JSON.stringify(user));
			callback(new Error(message));
		};

		if(!user.json) return error('Invalid response');
		if(!user.json.data) return error('Invalid response');
		if(user.errors && user.errors.length) return error('Response error');

		that.session = user.json.data;
		that.session.username = credentials.username;

		callback(null, that);
	});

	return that;
};

module.exports = login;
extend(module.exports);
