var stream = require('stream');
var util = require('util');

var VALID_EVENTS = ['goal', 'yellow_card', 'red_card', 'substitution', 'comment', 'half_time', 'full_time'];

var FilterStream = function() {
	if(!(this instanceof FilterStream)) return new FilterStream();
	stream.Transform.call(this, { objectMode: true, hightWaterMark: 16 });
};

util.inherits(FilterStream, stream.Transform);

FilterStream.prototype._transform = function(event, encoding, callback) {
	if(VALID_EVENTS.indexOf(event.type) !== -1 && event.time) {
		return callback(null, event);
	}

	callback();
};

module.exports = FilterStream;
