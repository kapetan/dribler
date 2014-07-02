var cheerio = require('cheerio');

var request = require('../request');

var parse = function(html) {
	var $ = cheerio.load(html);

	var parseContent = function($el) {
		return $el.text().trim();
	};

	var parsePlayer = function($li) {
		var number = $li.find('.number').text().trim();
		var name = $li.find('.name').text().trim();

		return {
			name: name,
			number: parseInt(number, 10) || null,
			position: null
		};
	};

	var parsePlayerList = function($list) {
		return $list
			.children('li')
			.toArray()
			.map(function(li) {
				return parsePlayer($(li));
			});
	};

	var names = $('.lineups > h2');
	var players = $('.lineups .players .player-list');
	var substitutes = $('.lineups .substitutes .player-list');
	var managers = $('.lineups .manager .name');

	return {
		team1: {
			name: parseContent(names.eq(0)),
			starters: parsePlayerList(players.eq(0)),
			substitutes: parsePlayerList(substitutes.eq(0)),
			coach: parseContent(managers.eq(0))
		},
		team2: {
			name: parseContent(names.eq(1)),
			starters: parsePlayerList(players.eq(1)),
			substitutes: parsePlayerList(substitutes.eq(1)),
			coach: parseContent(managers.eq(1))
		}
	};
};

module.exports = function(url, callback) {
	request.cat(url, function(err, body) {
		if(err) return callback(err);
		callback(null, parse(body));
	});
};
