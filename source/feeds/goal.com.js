var util = require('util');

var cheerio = require('cheerio');
var diacritic = require('diacritic');

var events = require('../events');
var request = require('../request');

var UPDATE_FREQUENCY = 2 * 60 * 1000;

var parse = function(html, lineup) {
	var $ = cheerio.load(html);

	var parseTime = function($item) {
		var minute = $item
			.find('.live_comments_minute strong')
			.text()
			.match(/(\+?\d+)/g);

		if(!minute) return null;

		minute = minute.map(function(m) {
			return parseInt(m, 10);
		});

		var m = minute[0];
		var e = minute.length > 1 ? minute[1] : 0;

		return {
			minute: m,
			stoppage: e,
			absolute: m + e
		};
	};

	var parseType = function($item) {
		var $text = $item.find('.live_comments_text');
		var	type = $text
			.find('> span:first-child')
			.text()
			.trim()
			.toLowerCase()
			.replace(/\s+/, '_');

		return type || 'comment';
	};

	var parsePlayers = function($item) {
		return $item.find('.live_comments_text')
			.contents()
			.filter(function() {
				var self = this[0];
				return self.type === 'text' && self.data.trim().length;
			})
			.map(function() {
				return this.data.trim();
			})
			.toArray();
	};

	var parsePlayerText = function($item) {
		return parsePlayers($item)[0];
	};

	var parseText = function($item) {
		return $item.find('.live_comments_text').text().trim();
	};

	var parseItem = function($item) {
		var type = parseType($item);
		var raw = parseText($item);
		var extra = {};

		if(type === 'own_goal') {
			extra.subtype = 'own_goal';
			type = 'goal';
		}
		if(type === 'penalty_goal') {
			extra.subtype = 'penalty';
			type = 'goal';
		}
		if(type === 'yellow/red') {
			extra.subtype = 'yellow_card';
			type = 'red_card';
		}

		if(type === 'substitution') {
			var players = parsePlayers($item);
			raw = util.format('%s, %s', players[0], players[1]);
		} else if(type === 'yellow_card' || type === 'red_card' || type === 'goal' || type === 'assist') {
			raw = parsePlayerText($item);
		} else {
			type = 'comment';
			raw = parseText($item);
		}

		raw = diacritic.clean(raw);

		var data = raw;
		var event = {
			raw: raw,
			extra :extra,
			time: parseTime($item),
			players: lineup.matchAllPlayers(raw),
			teams: lineup.matchAllTeams(raw)
		};

		if(type === 'substitution') {
			if(event.players.length !== 2) type = 'comment';
			else data = { leaving: event.players[0], entering: event.players[1] };
		}
		if(type === 'yellow_card' || type === 'red_card' || type === 'goal' || type === 'assist') {
			if(event.players.length !== 1) type = 'comment';
			else data = event.players[0];
		}

		event.type = type;
		event.data = data;

		return event;
	};

	var id = 0;

	return $('.live_comments_item')
		.toArray()
		.reverse()
		.map(function(item) {
			item = parseItem($(item));
			item.id = (id++);

			return item;
		})
};

module.exports = function(url, lineup) {
	var stream = events(url);

	stream._parse = function(content) {
		return parse(content, lineup);
	};

	return stream;
};
