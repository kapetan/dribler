var stream = require('stream');
var util = require('util');

var feeds = require('./feeds');
var lineups = require('./lineups');

var lineup = require('./lineup');

var filter = require('./filter');
var keywords = require('./keywords');

var error = function(property) {
	return new Error(util.format('Invalid %s', property));
};

var validate = function(options) {
	if(!options) return error('options');
	if(!options.lineup || !options.lineup.provider || !options.lineup.url) return error('lineup options');
	if(!options.feed || !options.feed.provider || !options.feed.url) return error('feed options');
};

var MatchStream = function() {
	stream.Transform.call(this, { objectMode: true, highWaterMark: 16 });

	this.lineup = null;
	this.events = [];
};

util.inherits(MatchStream, stream.Transform);

MatchStream.prototype._transform = function(event, encoding, callback) {
	this.events.push(event);
	callback(null, event);
};

module.exports = function(options) {
	var match = new MatchStream();
	var err = validate(options);

	if(err) {
		setImmediate(match.emit.bind(match, 'error', err));
		return match;
	}

	lineups[options.lineup.provider](options.lineup.url, function(err, result) {
		if(err) return match.emit('error', err);
		if(!lineup.valid(result)) return match.emit('error', new Error('Invalid lineup: ' + JSON.stringify(result)));

		match.lineup = lineup(result);
		match.emit('lineup', match.lineup);

		var feed = feeds[options.feed.provider](options.feed.url, match.lineup);

		feed.on('error', function(err) {
			match.emit('error', err);
		});

		feed.pipe(filter())
			.pipe(keywords())
			.pipe(match)
	});

	return match;
};

module.exports.feeds = feeds;
module.exports.lineups = lineups;
