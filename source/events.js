var stream = require('stream');
var util = require('util');

var traverse = require('traverse');

var request = require('./request');
var lineup = require('./lineup');

var DEFAULT_FREQUENCE = 2 * 60 * 1000;
var KEY_ORDER = ['id', 'type', 'type', 'raw', 'data', 'extra', 'players', 'teams', 'keywords'];

var toCompactJSON = function() {
	var json = traverse(this).map(function(node) {
		if(node instanceof lineup.Player || node instanceof lineup.Team) {
			this.update(node.toString(), true);
		}
		if(typeof node === 'function') {
			this.remove(true);
		}
	});

	return KEY_ORDER.reduce(function(acc, key) {
		acc[key] = json[key];
		return acc;
	}, {});
};

var EventStream = function(url, frequency) {
	if(!(this instanceof EventStream)) return new EventStream(url, frequency);
	stream.Readable.call(this, { objectMode: true, hightWaterMark: 16 });

	this._url = url;
	this._frequency = frequency || DEFAULT_FREQUENCE;

	this._latest = 0;
	this._poll = null;
};

util.inherits(EventStream, stream.Readable);

EventStream.prototype._parse = function(content) {};

EventStream.prototype._read = function(size) {
	var self = this;

	this.destroy();

	this._poll = request.poll(this._frequency, this._url, function(err, body) {
		if(err) return self.emit('error', err);

		var events = self._parse(body);
		self.update(events);
	});
};

EventStream.prototype.destroy = function() {
	if(this._poll) this._poll();
	this._poll = null;
};

EventStream.prototype.update = function(events) {
	while(this._latest < events.length) {
		var event = events[this._latest];
		event.toCompactJSON = toCompactJSON;

		this._latest++;

		if(!this.push(event)) {
			this.destroy();
			return;
		}
	}
};

module.exports = EventStream;
