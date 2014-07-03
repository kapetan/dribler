var stream = require('stream');
var util = require('util');
var crypto = require('crypto');

var traverse = require('traverse');
var stringify = require('json-stable-stringify');

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

var id = function(event) {
	event = stringify(event);

	return crypto.createHash('md5')
		.update(event)
		.digest('hex');
};

var EventStream = function(url, frequency) {
	if(!(this instanceof EventStream)) return new EventStream(url, frequency);
	stream.Readable.call(this, { objectMode: true, highWaterMark: 16 });

	this._url = url;
	this._frequency = frequency || DEFAULT_FREQUENCE;

	this._ids = [];
	this._poll = null;
};

util.inherits(EventStream, stream.Readable);

EventStream.prototype._parse = function(content) {};

EventStream.prototype._read = function(size) {
	if(this._poll) return;

	var self = this;

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
	var self = this;
	var ids = this._ids.slice();

	for(var i = 0, j = 0; i < events.length; i++) {
		var event = events[i];

		event.id = id(event);
		event.toCompactJSON = toCompactJSON;

		if(j === ids.length) {
			this._ids.push(event.id);

			if(!this.push(event)) {
				this.destroy();
				break;
			}

			continue;
		}

		if(ids[j] !== event.id) {
			self.emit('amend', event, i);
			this._ids.splice(i, 0, event.id);
		} else {
			j++;
		}
	}
};

module.exports = EventStream;
