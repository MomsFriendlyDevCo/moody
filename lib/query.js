var _ = require('lodash');
var debug = require('debug')('moody');
var debugDetail = require('debug')('moody:detail');

module.exports = function Moomyquery(model, filter) {
	var myq = this;
	myq.my = model.my;
	myq.model = model;

	myq.query = {
		action: 'find',
		actionPayload: undefined,
		count: false,
		limit: 0,
		skip: 0,
		filters: {},
		select: [],
		sort: [],
		flatten: false,
		lean: false,
	};


	/**
	* Append query criteria
	* @param {Object} query Query to append
	* @returns {MoodyQuery} This chainable query
	*/
	myq.find = query => {
		Object.assign(myq.query.filters, query);
		return myq;
	};

	// Populate initial query
	if (filter) myq.find(filter);


	/**
	* Mark the query as a count - which will only return the number of matches
	* @param {Object} query Optional to append
	* @returns {MoodyQuery} This chainable query
	*/
	myq.count = query => {
		myq.query.count = true;
		return myq.find(query);
	};


	/**
	* Set the limit of documents
	* If the value is zero, falsy or Infinity the limit is disabled
	* @param {*} limit The limit to set
	* @returns {MoodyQuery} This chainable query
	*/
	myq.limit = limit => {
		myq.query.limit =
			!limit || limit === Infinity ? 0
			: limit;

		return myq;
	};


	/**
	* Set the skip for documents (i.e. the paginated offset of responses)
	* If the value is zero or falsy the skip is disabled
	* @param {*} skip The skip offset to set
	* @returns {MoodyQuery} This chainable query
	*/
	myq.skip = skip => {
		myq.query.skip = !skip ? 0 : skip;
		return myq;
	};


	/**
	* Set an action to perform when the query executes
	* This function is not intended for user use and is usually mapped via operations such as `model.updateOneByID(id, patch)`
	* @param {string} action The action to perform
	* @param {*} [actionPayload] Optional action payload to also set
	* @returns {MoodyQuery} This chainable query
	*/
	myq.action = (action, actionPayload) => {
		Object.assign(myq.query, {action, actionPayload});
		return myq;
	};


	/**
	* Set the fields to return (or "Project" to use proper DB terminology)
	* Fields can be specified in array or CSV form
	* @param {string|array} fields... Fields to return
	* @returns {MoodyQuery} This chainable query
	*/
	myq.select = (...fields) => {
		myq.query.select = Array.from(new Set(
			_(fields.concat([model.settings.idField])) // Glue Id field onto select
				.map(f => _.isString(f) ? f.split(/\s*,\s*/) : f)
				.flatten()
				.concat(myq.query.select)
				.filter()
				.value()
		));

		return myq;
	};


	/**
	* Set the sort criteria of the query
	* @param {string|array} sort... Sort criteria to add, can be a string, array or CSVs
	* @returns {MoodyQuery} This chainable query
	*/
	myq.sort = (...fields) => {
		myq.query.sort = Array.from(new Set(
			_(fields)
				.map(f => _.isString(f) ? f.split(/\s*,\s*/) : f)
				.flatten()
				.concat(myq.query.select)
				.filter()
				.value()
		));

		return myq;
	};


	/**
	* Set that we are only interested in the first match and it should be returned directly as an object rather than an array of matches
	* @returns {MoodyQuery} This chainable query
	*/
	myq.one = ()=> {
		myq.query.limit = 1;
		myq.query.flatten = true;
		return myq;
	};


	/**
	* Set the lean property - i.e. don't try to decorate the response documents
	* @returns {MoodyQuery} This chainable query
	*/
	myq.lean = ()=> {
		myq.query.lean = true;
		return myq;
	};


	/**
	* Execute the query and return a promise
	* @returns {Promise <Object|array|undefined>} A promise which returns the found document, collection of documents or undefined
	*/
	myq.exec = myq.promise = ()=> Promise.resolve()
		// Execute query, returning a promise {{{
		.then(()=> new Promise((resolve, reject) => {
			debugDetail('Execute query', myq.query);

			var q = myq.model.model.scan(myq.query.filters);
			if (myq.query.count) q.count();

			q.exec((err, res) => {
				if (err) return reject(err);
				if (myq.query.count) {
					debugDetail('Counted', res[0], 'docs from query');
					resolve(res[0]);
				} else {
					debugDetail('Found', res.length, 'docs from query');
					resolve(res);
				}
			});
		}))
		// }}}
		// Perform post operation actions {{{
		.then(res => {
			if (myq.query.action == 'update') {
				debug('Update', res.length, 'documents via exec post action');
				return Promise.all(res.map(doc =>
					model.updateOneById(doc[model.settings.idField], myq.query.actionPayload)
				));
			} else if (myq.query.action == 'delete') {
				debug('Delete', res.length, 'documents via exec post action');
				return Promise.all(res.map(doc =>
					model.deleteOneById(doc[model.settings.idField])
				));
			} else {
				return res;
			}
		})
		// }}}
		// BUGFIX: Crappy soft projection / select support {{{
		.then(res => _.isArray(res) && myq.query.select.length ? res.map(doc => _.pick(doc, myq.query.select)) : res)
		// }}}
		// Decorate documents (if !query.lean) {{{
		.then(res => _.isArray(res) && !myq.query.lean ? res.map(doc => new myq.my.Document(model, doc)) : res)
		// }}}
		// Perform final flatten {{{
		.then(res =>
			myq.query.flatten
				? res[0]
				: res
		)
		// }}}


	/**
	* Return a promise and immediately execute it
	* This is really just an alias for myq.promise().then(...)
	* @param {*} args... Callback to run
	* @returns {Promise}
	*/
	myq.then = (...args) => myq.promise().then(...args);


	/**
	* Return a promise and immediately execute it as a catch
	* This is really just an alias for myq.promise().catch(...)
	* @param {*} args... Callback to run
	* @returns {Promise}
	*/
	myq.catch = (...args) => myq.promise().catch(...args);


	/**
	* Return a promise and immediately execute it as a finally block
	* This is really just an alias for myq.promise().finally(...)
	* @param {*} args... Callback to run
	* @returns {Promise}
	*/
	myq.finally = (...args) => myq.promise().finally(...args);


	return myq;
};
