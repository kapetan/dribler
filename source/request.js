var util = require('util');
var fs = require('fs');

var request = require('request');

var RETRY_LIMIT = 3;

var error = function(response, callback) {
	if(!/2\d\d/.test(response.statusCode)) {
		var err = new Error(util.format('Unexpected status code %s (%s)', response.statusCode, url));
		callback(err);

		return true;
	}
};

var defaultRequest = request.defaults({
	pool: false,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.9; rv:27.0) Gecko/20100101 Firefox/27.0'
	}
});

var fn = function() {
	return defaultRequest.apply(defaultRequest, arguments);
};

['get', 'post', 'patch', 'put', 'delete'].forEach(function(method) {
	fn[method] = function() {
		return defaultRequest[method].apply(defaultRequest, arguments);
	};
});

fn.cat = function(location, callback) {
	var protocol = (location.match(/^(\w+):\/\//) || [])[1] || 'file';

	if(protocol === 'file') {
		fs.readFile(location, 'utf-8', callback);
	} else if(protocol === 'http' || protocol === 'https') {
		defaultRequest.get(location, function(err, response, body) {
			if(err) return callback(err);
			if(error(response, callback)) return;

			callback(null, body.toString('utf-8'));
		})
	} else {
		throw new Error('Unknown protocol: ' + protocol);
	}
};

fn.poll = function(interval, url, callback) {
	var retries = 0;

	var clear = false;
	var timeout = null;

	var retry = function(err) {
		if(retries === RETRY_LIMIT) return callback(err);
		retries++;

		timeout = setTimeout(poll, interval);
	};

	var poll = function() {
		fn.cat(url, function(err, body) {
			if(clear) return;
			if(err) return retry(err);

			callback(null, body);

			retries = 0;
			timeout = setTimeout(poll, interval);
		});
	};

	poll();

	return function() {
		clear = true;
		clearTimeout(timeout);
	};
};

module.exports = fn;
