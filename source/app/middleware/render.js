var pejs = require('pejs');

module.exports = function(app, options) {
	var helpers = options.helpers;
	var views = pejs({ basedir: options.basedir });

	app.views = views;

	app.use('response.render', function(template, locals) {
		var self = this;

		views.render(template, helpers(locals), function(err, content) {
			if(err) return self.error(500, err);
			self.send(content);
		});
	});
};
