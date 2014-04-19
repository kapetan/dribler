var util = require('util');
var diacritic = require('diacritic');

var MIN_STRING_LENGTH = 4;

var match = function(list, str) {
	for(var i = 0; i < list.length; i++) {
		if(list[i].name.matches(str)) {
			return list[i];
		}
	}

	return null;
};

var matchAll = function(list, str) {
	var matched = [];

	outer:
	for(var i = 0; i < list.length; i++) {
		var obj = list[i];

		var m = obj.name.match(str);

		if(m) {
			m.obj = obj;

			for(var j = 0; j < matched.length; j++) {
				var n = matched[j];

				if((m.index <= n.index && n.index < m.index + m.length) || (n.index <= m.index && m.index < n.index + n.length)) {
					if(m.length > n.length) {
						matched.splice(j, 1, m);
					}

					continue outer;
				}
				if(m.index < n.index) {
					matched.splice(j, 0, m);
					continue outer;
				}
			}

			matched.push(m);
		}
	}

	return matched.map(function(m) {
		return m.obj;
	});
};

var contains = function(list, obj) {
	for(var i = 0; i < list.length; i++) {
		if(list[i].equals(obj)) {
			return true;
		}
	}

	return false;
};

var pattern = function(name) {
	name = diacritic.clean(name);

	var pattern = name
		.split(/\s+|-/)
		.filter(function(n) {
			return n.length >= MIN_STRING_LENGTH;
		})
		.concat(name)
		.map(function(n) {
			return util.format('(%s)', n);
		})
		.sort(function(a, b) {
			return b.length - a.length;
		})
		.join('|');

	return new RegExp(pattern, 'i');
};

var Name = function(name) {
	this.original = name;
	this.normalized = diacritic.clean(name);
	this.pattern = pattern(name);
};

Name.prototype.toString = function() {
	return this.original;
};

Name.prototype.match = function(str) {
	var result = str.match(this.pattern);
	return result && { index: result.index, length: result[0].length, match: result[0] };
};

Name.prototype.matches = function(str) {
	return !!this.match(str);
};

Name.prototype.equals = function(other) {
	if(other instanceof Name) return other.normalized === this.normalized;
	return false;
};

var Player = function(json, team) {
	this.name = new Name(json.name);
	this.position = json.position;
	this.number = json.number;

	this.team = team;
};

Player.valid = function(json) {
	return !!(json && json.name);
};

Player.prototype.toString = function() {
	return this.name.toString();
};

Player.prototype.toJSON = function() {
	return {
		name: this.name.toString(),
		position: this.position,
		number: this.number
	};
};

Player.prototype.equals = function(other) {
	if(other instanceof Player) {
		return other.name.equals(this.name) && other.team.equals(team);
	}

	return false;
};

var Team = function(json) {
	var self = this;

	var starters = json.starters.map(function(player) {
		return new Player(player, self);
	});

	var substitutes = json.substitutes.map(function(player) {
		return new Player(player, self);
	});

	this.starters = starters;
	this.substitutes = substitutes;
	this.players = starters.concat(substitutes);
	this.name = new Name(json.name);
	this.coach = new Player({ name: json.coach, position: 'Coach' }, this);
};

Team.valid = function(json) {
	var validPlayers = function(players) {
		if(!players || !players.length) return false;
		return players.every(Player.valid);
	};

	if(!json || !json.name || !json.coach) return false;
	if(!validPlayers(json.starters) && json.starters.length !== 11) return false;
	if(!validPlayers(json.substitutes)) return false;

	return true;
};

Team.prototype.toString = function() {
	return this.name.toString();
};

Team.prototype.toJSON = function() {
	var starters = this.starters.map(function(player) {
		return player.toJSON();
	});

	var substitutes = this.substitutes.map(function(player) {
		return player.toJSON();
	});

	return {
		name: this.name.toString(),
		coach: this.coach.name.toString(),
		starters: starters,
		substitutes: substitutes
	};
};

Team.prototype.matchPlayer = function(str) {
	return match(this.players, str);
};

Team.prototype.matchAllPlayers = function(str) {
	return matchAll(this.players, str);
};

Team.prototype.hasPlayer = function(player) {
	return contains(this.players, player);
};

Team.prototype.equals = function(other) {
	if(other instanceof Team) return other.name.equals(this.name);
	return false;
};

var Lineup = function(json) {
	if(!(this instanceof Lineup)) return new Lineup(json);

	this.team1 = new Team(json.team1);
	this.team2 = new Team(json.team2);
	this.teams = [this.team1, this.team2];
	this.players = this.team1.players.concat(this.team2.players);
};

Lineup.valid = function(json) {
	if(!json.team1 || !json.team2) return false;
	return Team.valid(json.team1) && Team.valid(json.team2);
};

Lineup.prototype.toString = function() {
	return util.format('%s - %s', this.team1, this.team2);
};

Lineup.prototype.matchTeam = function(str) {
	return match(this.teams, str);
};

Lineup.prototype.matchAllTeams = function(str) {
	return matchAll(this.teams, str);
};

Lineup.prototype.matchAllPlayers = function(str) {
	return matchAll(this.players, str);
};

Lineup.prototype.hasTeam = function(team) {
	return contains(this.teams, team);
};

module.exports = Lineup;

module.exports.Name = Name;
module.exports.Player = Player;
module.exports.Team = Team;

