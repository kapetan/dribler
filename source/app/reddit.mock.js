var util = require('util');
var stream = require('stream');

var BASE_URL = 'http://www.reddit.com';

var NoopStream = function() {
	stream.Readable.call(this);
};

util.inherits(NoopStream, stream.Readable);

NoopStream.prototype._read = function(n) {
	this.push(null);
};

var matcher = function(pattern, json) {
	pattern = pattern.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, '\\$&');
	pattern = pattern.replace(/\*/g, '(.+?)');
	pattern = util.format('^%s(/?)$', pattern);
	pattern = new RegExp(pattern);

	var matches = function(url) {
		url = url.replace(BASE_URL, '');
		return pattern.test(url);
	};

	var response = function() {
		return JSON.parse(JSON.stringify(json));
	};

	return {
		matches: matches,
		response: response
	};
};

var extend = function(that, routes) {
	var find = function(url) {
		for(var i = 0; i < routes.length; i++) {
			var route = routes[i];
			if(route.matches(url)) return route;
		}
	};

	['get', 'post', 'put', 'patch', 'del', 'head'].forEach(function(method) {
		that[method] = function(url, data, callback) {
			if(!callback && typeof data === 'function') {
				callback = data;
				data = null;
			}

			if(method === 'del') method = 'delete';
			method = method.toUpperCase();

			var url = util.format('%s %s', method, url);
			var route = find(url);

			if(!route) callback(new Error('Unknown route ' + url));
			else if(callback) callback(null, route.response());

			return new NoopStream();
		};
	});

	that.url = function(url) {
		return url;
	};

	return that;
};

module.exports = function(routes) {
	routes = Object.keys(routes).map(function(pattern) {
		return matcher(pattern, routes[pattern]);
	});

	var login = function(credentials, callback) {
		callback = callback || function() {};
		var that = extend({}, routes);

		if(credentials.cookie) {
			that.session = credentials;
			callback(null, that);

			return that;
		}

		that.session = { username: credentials.username };
		callback(null, that);

		return that;
	};

	return extend(login, routes);
};
