var _ = require('lodash');
var debug = require('debug')('moody');

module.exports = function(filter, query) {
	return query.query(filter); // FIXME: Bypass the below as it seems badly broken for now

	/**
	* Apply Dynamoose query operators in sequence until exhausted
	* This is necessary because of the weird error handling Dynamoose uses where any segment can silently raise an error
	* @param {DynamooseQuery} query The input query object to mutate
	* @param {*} [args..] The key/val pairs to use in 2's
	* @returns {DynamooseQuery} The mutated query
	*/
	var queryBind = (input, ...args) => {
		var node = input;

		_.chunk(args, 2).forEach((chunk, offset) => {
			// Reduce down the query pairs calling each
			try {
				node = node[chunk[0]].call(node, chunk[1]);
			} catch (e) {
				if (/is not a function$/.test(e)) {
					throw new Error(`Invalid query function "${chunk[0]}" in path: ${_.chunk(args, 2).map(c => `${c[0]}(${c[1]})`).join('.')}`);
				} else {
					throw new Error(`Error calling query function "${chunk[0]}" in path: ${_.chunk(args, 2).map(c => `${c[0]}(${c[1]})`).join('.')} - ${e.toString()}`);
				}
			}

			if (node.validationError) throw new Error(`Validation error in query segment path: ${_.chunk(args, 2).map(c => `${c[0]}(${c[1]})`).join('.')} - ${node.validationError}`);
		});

		debug('Exit translate');
		return node;
	};

	return Object.keys(filter).reduce((t, k) => {
		if (!_.isObject(filter[k])) {
			t = queryBind(t, 'query', k, 'eq', filter[k]);
		} else {
			throw new Error('FIXME: UNTESTED QUERY TYPE');
			if (filter[k].$eq) t = queryBind(t, 'query', k, 'eq', filter[k]); // Verbose equality

			// Numerical checks
			if (filter[k].$gt) {
				debug('NUMERIC GT', k, filter[k].$gt);
				t = queryBind(t, 'query', k, 'gt', filter[k].$gt);
			}
		}

		return t;
	}, query);
};
