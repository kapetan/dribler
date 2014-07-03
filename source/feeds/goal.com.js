var util = require('util');
var diacritic = require('diacritic');
var events = require('../events');

var validate = function(json) {
	if(!Array.isArray(json)) return false;

	var nullable = function(obj) {
		return (typeof obj === 'string') || obj === null || obj === undefined;
	};

	return json.every(function(event) {
		if(!event) return false;

		return nullable(event.time) &&
			(typeof event.eventType === 'string') &&
			nullable(event.commentary) &&
			Array.isArray(event.players)
	});
};

var parseTime = function(time) {
	var minute = time && time.match(/(\+?\d+)/g);
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

var parse = function(json, lineup) {
	try {
		json = JSON.parse(json);
	} catch(err) {
		return [];
	}

	if(!validate(json)) return [];

	return json.map(function(event) {
		var type = event.eventType.replace('-', '_');
		var raw = event.commentary;
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
			raw = util.format('%s, %s', event.players[0], event.players[1]);
		} else if(type === 'yellow_card' || type === 'red_card' || type === 'goal' || type === 'assist') {
			raw = raw || event.players[0];
		} else {
			type = 'comment';
		}

		raw = diacritic.clean(raw);

		var data = raw;
		var result = {
			raw: raw,
			extra: extra,
			time: parseTime(event.time),
			players: lineup.matchAllPlayers(raw),
			teams: lineup.matchAllTeams(raw)
		};
		var players = event.players
			.map(function(name) {
				return lineup.matchPlayer(name);
			})
			.filter(function(player) {
				return player;
			});

		if(type === 'substitution') {
			if(players.length !== 2) type = 'comment';
			else data = { leaving: players[0], entering: players[1] };
		}
		if(type === 'yellow_card' || type === 'red_card' || type === 'goal' || type === 'assist') {
			if(players.length !== 1) type = 'comment';
			else data = players[0];
		}

		result.type = type;
		result.data = data;

		return result;
	});
};

module.exports = function(url, lineup) {
	var stream = events(url);

	stream._parse = function(content) {
		return parse(content, lineup);
	};

	return stream;
};
