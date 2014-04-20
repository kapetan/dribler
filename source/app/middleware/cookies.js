var cookie = require('cookie');

module.exports = function(app) {
	app.use('request.cookies', { getter: true }, function() {
		var cookies = this._cookies;
		if(cookies) return cookies;

		if(this.headers['cookie']) {
			cookies = cookie.parse(this.headers['cookie']);
		}

		cookies = cookies || {};
		this._cookies = cookies;

		return cookies;
	});

	app.use('response.cookie', function(name, value, options) {
		this.setHeader('Set-Cookie', cookie.serialize(name, value, options));
	});
};
