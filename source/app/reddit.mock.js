var util = require('util');
var stream = require('stream');

var NoopStream = function() {
	stream.Readable.call(this);
};

util.inherits(NoopStream, stream.Readable);

NoopStream.prototype._read = function(n) {
	this.push(null);
};

var extend = function(that, routes) {
	['get', 'post', 'put', 'patch', 'del', 'head'].forEach(function(method) {
		that[method] = function(url, data, callback) {
			if(!callback && typeof data === 'function') {
				callback = data;
				data = null;
			}

			if(method === 'del') method = 'delete';
			method = method.toUpperCase();

			var route = util.format('%s %s', method, url);
			var response = routes[route];

			if(!response) callback(new Error('Unknown route ' + route));
			else if(callback) callback(null, response);

			return new NoopStream();
		};
	});

	that.url = function(url) {
		return url;
	};

	return that;
};

module.exports = function(routes) {
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
