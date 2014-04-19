var traverse = require('traverse');

var helpers = require('./helpers');

var events = {};

events.simple = require('./views/match_md/events/simple.json');
events.reddit = require('./views/match_md/events/reddit.json');

var comment = function(event) {
	return event.data;
};

var formatter = function(str) {
	return function(event) {
		return helpers.string.format(str, { event: event });
	};
};

Object.keys(events).forEach(function(key) {
	events[key] = traverse(events[key]).map(function(node) {
		if(this.isLeaf) this.update(formatter(node));
	});
});

var renderEvent = function(name, event) {
	var templates = events[name] || events.simple;
	var type = event.type;

	if(type === 'goal') {
		if(event.extra.assist && templates.goal.assist) return templates.goal.assist(event);
		if(event.extra.subtype === 'own_goal' && templates.goal.own_goal) return templates.goal.own_goal(event);
	}
	if(type === 'red_card') {
		if(event.extra.subtype === 'yellow_card' && templates.red_card.yellow_card) return templates.red_card.yellow_card(event);
	}

	return (templates[type] ? templates[type]['default'] : comment)(event);
};

module.exports = function(name) {
	return function(event) {
		return renderEvent(name, event);
	};
};
