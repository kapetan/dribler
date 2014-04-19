var stream = require('stream');
var util = require('util');

var KEYWORDS = [
	'injury',
	'injured',
	'free kick',
	'foul',
	'penalty',
	'goal',
	'own goal',
	'red card',
	'yellow card',
	'booked',
	'substitution',
	'assist',
	'save',
	'half time',
	'full time',
	'first half',
	'second half',
	'corner',
	'offside'
];

var KEYWORD_PATTERNS = KEYWORDS.reduce(function(acc, word) {
	var words = word.split(/\s+|-/);
	var patterns = ['-', ' ', ''].map(function(sep) {
		return util.format('(%s)', words.join(sep));
	});

	patterns.push(util.format('(%a)', word));

	acc[word] = new RegExp(patterns.join('|'), 'i');
	return acc;
}, {});

var match = function(str) {
	return Object.keys(KEYWORD_PATTERNS).filter(function(key) {
		return KEYWORD_PATTERNS[key].test(str);
	});
};

var KeywordStream = function(lineup) {
	if(!(this instanceof KeywordStream)) return new KeywordStream(lineup);
	stream.Transform.call(this, { objectMode: true, hightWaterMark: 16 });
};

util.inherits(KeywordStream, stream.Transform);

KeywordStream.prototype._transform = function(event, encoding, callback) {
	event.keywords = match(event.raw);
	callback(null, event);
};

module.exports = KeywordStream;
