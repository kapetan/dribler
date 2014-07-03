var cheerio = require('cheerio');
var diacritic = require('diacritic');

var events = require('../events');
var request = require('../request');

var UPDATE_FREQUENCY = 2 * 60 * 1000;

var parse = function(html, lineup) {
	var $ = cheerio.load(html);

	var text = function($el) {
		return $el
			.contents()
			.filter(function() {
				var self = this[0];
				return self.type === 'text' && self.data.trim().length;
			})
			.map(function() {
				return this.data.trim();
			})
			.toArray()
			.join('');
	};

	var parseTime = function($time) {
		var $extra = $time.find('.extra-info');

		var minute = parseInt(text($time).split(':')[0], 10);
		var stoppage = parseInt(text($extra).split(':')[0], 10) || 0;

		if(!minute && minute !== 0) return null;

		return {
			minute: minute,
			stoppage: stoppage,
			absolute: minute + stoppage
		};
	};

	var parseType = function($p) {
		var type = $p
			.find('.event-title')
			.text()
			.trim()
			.toLowerCase()
			.replace(/[,.!?]/g, '')
			.replace(/\s+/g, '_');

		return type || 'comment';
	};

	var parseBooking = function(data) {
		if((/yellow card/i).test(data)) return 'yellow_card';
		if((/red card/i).test(data)) return 'red_card';
	};

	var parseParagraph = function($p) {
		var $time = $p.prev('span');

		var type = parseType($p);
		var raw = diacritic.clean(text($p));
		var data = raw;
		var extra = {};

		var event = {
			raw: raw,
			time: parseTime($time),
			players: lineup.matchAllPlayers(raw),
			teams: lineup.matchAllTeams(raw)
		};

		if(type === 'booking') {
			type = parseBooking(raw) || 'comment';
		}

		if(type === 'yellow_card' || type === 'red_card' || type === 'goal') {
			if(!event.players.length) type = 'comment';
			else data = event.players[0];
		}
		if(type === 'substitution') {
			if(event.players.length !== 2) type = 'comment';
			else data = { entering: event.players[0], leaving: event.players[1] };
		}

		if(type === 'goal') {
			if((/own goal/i).test(raw)) extra.subtype = 'own_goal';

			var assist = raw.split(/assisted by/i)[1];

			if(assist) {
				for(var i = 1; i < event.players.length; i++) {
					var player = event.players[i];

					if(player.name.matches(assist)) {
						extra.assist = player;
						break;
					}
				}
			}
		}

		event.type = type;
		event.data = data;
		event.extra = extra;

		return event;
	};

	return $('#live-text > p').toArray()
		.concat($('#more-live-text > p').toArray())
		.reverse()
		.map(function(p) {
			return parseParagraph($(p));
		});
};

module.exports = function(url, lineup) {
	var stream = events(url);

	stream._parse = function(content) {
		return parse(content, lineup);
	};

	return stream;
};
