var _ = require('lodash');
var debug = require('debug')('moody');

module.exports = function(filter, query) {
	debug('TRANSLATE', filter);
	return Object.keys(filter).reduce((t, k) => {
		if (!_.isObject(filter[k])) return t.query(k).eq(filter[k]); // Simple equality

		if (filter[k].$eq) t = t.query(k).eq(filter[k]); // Verbose equality

		// Numerical checks
		if (filter[k].$gt) {
			debug('NUMERIC GT', k, filter[k].$gt);
			t = t.query(k).gt(filter[k].$gt);
		}

		return t;
	}, query);
};
