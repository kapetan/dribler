var cheerio = require('cheerio');

var request = require('../request');

var TEAM_NAMES = {
	'man utd': 'Manchester United F.C.',
	'tottenham': 'Tottenham Hotspur F.C.'
};

var fullName = function(name) {
	var normalized = name.toLowerCase();
	var keys = Object.keys(TEAM_NAMES);

	for(var i = 0; i < keys.length; i++) {
		var key = keys[i];

		if(normalized.indexOf(key) !== -1) {
			return TEAM_NAMES[key];
		}
	}

	return name;
};

var parse = function(html) {
	var $ = cheerio.load(html);

	var parsePlayerInfo = function($player) {
		var number = $player.find('.player_shirt_number_lineup').text().trim();
		var name = $player.find('.player_name_lineup .player_lineup').text().trim();
		var position = $player.find('.player_name_lineup strong').text().trim();

		return {
			name: name,
			number: parseInt(number, 10) || null,
			position: position || null
		};
	};

	var parseTeamLineup = function($lineup) {
		return $lineup
			.find('.player_info_tab_lineup')
			.toArray()
			.map(function(player) {
				return parsePlayerInfo($(player));
			});
	};

	var parseGroup = function($group) {
		return $group
			.find('.team-lineup')
			.toArray()
			.map(function(lineup) {
				return parseTeamLineup($(lineup));
			});
	};

	var parseTeamNames = function() {
		return $('#match_lineup .team_name_lineup')
			.toArray()
			.map(function(name) {
				return fullName($(name).text().trim());
			});
	};

	var groups = $('#match_lineup .group').toArray();

	var starters = parseGroup($(groups[0]));
	var substitutes = parseGroup($(groups[1]));
	var coaches = parseGroup($(groups[2])).map(function(coach) {
		return coach[0].name;
	});

	var names = parseTeamNames();

	return {
		team1: {
			name: names[0],
			starters: starters[0],
			substitutes: substitutes[0],
			coach: coaches[0]
		},
		team2: {
			name: names[1],
			starters: starters[1],
			substitutes: substitutes[1],
			coach: coaches[1]
		}
	};
};

module.exports = function(url, callback) {
	request.cat(url, function(err, body) {
		if(err) return callback(err);
		callback(null, parse(body));
	});
};
