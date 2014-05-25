var util = require('util');
var json = require('json-markup');
var traverse = require('traverse');
var moment = require('moment');

var format = {};
var string = {};
var form = {};

format.time = function(time) {
	if(!time) return '-';

	if(time.stoppage) {
		return util.format('%s\' + %s\'', time.minute, time.stoppage);
	}

	return util.format('%s\'', time.minute);
};

format.type = function(type) {
	return type.split('_').map(string.capitalize).join(' ');
};

format.player = function(player) {
	return util.format('%s (%s)', player.name, player.team.name);
};

format.teams = function(team, team2) {
	if(team2) {
		team = [].concat(team, team2);
	}

	return team.join(' vs. ');
};

format.timestamp = function(timestamp) {
	return moment.duration(timestamp - Date.now()).humanize(true);
};

format.date = function(date) {
	return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

string.capitalize = function(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
};

string.camelize = function(str) {
	return str.replace(/[_.-](\w|$)/g, function (_, x) {
		return x.toUpperCase()
	});
};

string.truncate = function(str, length) {
	length = length || 120;

	if(str.length <= length) return str;
	return str.slice(0, length).replace(/\s+$/, '') + '...';
};

string.format = function(str, obj) {
	obj = (typeof obj === 'object') ? obj : Array.prototype.slice.call(arguments, 1);
	obj = traverse(obj);

	return str.replace(/\{([^{}]+)\}/gm, function(value, path) {
		var result = obj.get(path.split('.'));
		return result === undefined ? value : result;
	});
};

form.checked = function(bool) {
	return bool ? 'checked="checked"' : '';
};

form.exclude = function(exclude) {
	return Object.keys(exclude).join(',');
};

var contextual = function(type) {
	return ({
		yellow_card: 'warning',
		red_card: 'danger',
		goal: 'success',
		substitution: 'info',
		half_time: 'active',
		full_time: 'active'
	}[type] || '');
};

var iif = function(condition, t, f) {
	return condition ? t : (f || '');
};

var toHTML = function(obj) {
	return json(obj);
};

var assign = function(locals, name, obj) {
	if(locals[name] === undefined) locals[name] = obj;
};

var extend = function(locals) {
	locals = locals || {};

	assign(locals, 'format', format);
	assign(locals, 'string', string);
	assign(locals, 'form', form);
	assign(locals, 'contextual', contextual);
	assign(locals, 'iif', iif);
	assign(locals, 'toHTML', toHTML);

	return locals;
};

module.exports = extend;
extend(module.exports);
