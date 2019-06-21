var debug = require('debug')('dynamoosey');

module.exports = function DynamooseyQuery(model, filter) {
	var dyq = this;
	dyq.dy = model.dy;
	dyq.model = model;

	dyq.filters = {};
	dyq.sort = [];


	/**
	* Append query criteria
	* @param {Object} query Query to append
	* @returns {DynamooseQuery} This chainable query
	*/
	dyq.find = query => {
		Object.assign(dyq.filters, query);
		return dyq;
	};

	// Populate initial query
	if (filter) dyq.find(filter);


	/**
	* Execute the query and return a promise
	* @returns {Promise <Object|array|undefined>} A promise which returns the found document, collection of documents or undefined
	*/
	dyq.promise = ()=> new Promise((resolve, reject) => {
		debug('Execute query', {filters: dyq.filters, sort: dyq.sort});
		dyq.model.model.scan(dyq.filters).exec((err, res) => {
			debug('Found', res.length, 'docs from query');
			if (err) return reject(err);
			resolve(res);
		});
	});


	/**
	* Return a promise and immediately execute it
	* This is really just an alias for dyq.promise().then(...)
	* @param {*} args... Callback to run
	* @returns {Promise}
	*/
	dyq.then = (...args) => dyq.promise().then(...args);



	return dyq;
};
