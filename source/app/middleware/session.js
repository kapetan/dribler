var EXPIRES = 30 * 24 * 60 * 60 * 1000;

module.exports = function(app) {
	app.use('request.session', { getter: true }, function() {
		var session = this.cookies.session;
		if(!session) return null;

		try {
			return JSON.parse(session);
		} catch(err) {
			return null;
		}
	});

	app.use('response.session', { setter: true }, function(value) {
		var expires = new Date(Date.now() + EXPIRES);

		if(!value) {
			value = null;
			expires = new Date(0);
		}

		var session = JSON.stringify(value);
		this.cookie('session', session, { path: '/', expires: expires });
	});
};
