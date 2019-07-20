var _ = require('lodash');
var debug = require('debug')('moody');
var debugDetail = require('debug')('moody:detail');

module.exports = function Moomyquery(model, filter) {
	var myq = this;
	myq.my = model.my;
	myq.model = model;

	myq.query = {
		table: myq.model.id,
		index: undefined,
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
		cache: false, // Falsy or Millisecond expiry time
		...myq.my.settings.query,
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
	* Perform a query and delete all resulting records
	* Alias for `query.action('delete')`
	* @returns {MoodyQuery} This chainable query
	*/
	myq.delete = ()=> myq.action('delete');


	/**
	* Perform a query and update all resulting records
	* Note that if `lean` is enabled virtuals and fields with the `value` attribute cannot be processed also
	* Alias for `query.action('update', fields)`
	* @returns {MoodyQuery} This chainable query
	*/
	myq.update = fields => myq.action('update', fields);


	/**
	* Set the fields to return (or "Project" to use proper DB terminology)
	* Fields can be specified in array or CSV form
	* @param {string|array} fields... Fields to return
	* @returns {MoodyQuery} This chainable query
	*/
	myq.select = (...fields) => {
		if (!fields.length || _.isEqual(fields, [undefined])) return myq; // Nothing to do

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
		if (!fields.length || _.isEqual(fields, [undefined])) return myq; // Nothing to do

		myq.query.sort = Array.from(new Set(
			_(fields)
				.map(f => _.isString(f) ? f.split(/\s*,\s*/) : f)
				.flatten()
				.concat(myq.query.sort)
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
	* Manually specify the index to use
	* @param {string} index The index name to force
	* @returns {MoodyQuery} This chainable query
	*/
	myq.using = index => {
		myq.query.index = index;
		return myq;
	};


	/**
	* Set the cache bit
	* This means that colliding requests within the same cache frequency will recieve the same result
	* @param {string} [timeout] A timestring parsable expression indicating the maximum timeout
	* @returns {MoodyQuery} This chainable query
	*/
	myq.cache = timeout => {
		myq.query.cache = _.isString(timeout)
			? timestring(timeout)
			: myq.my.settings.cache.defaultTime;
		return myq;
	},


	/**
	* Execute the query and return a promise
	* @returns {Promise <Object|array|undefined>} A promise which returns the found document, collection of documents or undefined
	*
	* @emits queryScan Emitted as `(queryData)` when falling back to using a scan
	* @emits query Emitted as `(queryData)` when running a query with a valid index
	*/
	myq.exec = myq.promise = ()=> Promise.resolve()
		// Execute query, returning a promise {{{
		.then(()=> {
			if (
				_.size(myq.query.filters) // We have at least one filter
				&& (
					!myq.my.settings.indexes.forceScan // Not being forced to scan
					|| myq.query.index // OR we're forcing an index
				)
			) {
				myq.my.emit('query', myq.query);
				debugDetail('Execute query (via query w/index)', myq.query);

				return new Promise((resolve, reject) => {
					var q = myq.model.model;
					q = myq.my.translateMongo(myq.query.filters, q);

					if (myq.query.count) q.count();
					if (myq.query.limit) q.limit(myq.query.limit);
					if (myq.query.index) q.using(myq.query.index);
					if (myq.query.selected) q.attributes(myq.query.selected);

					q.exec((err, res) => {
						debugDetail('Query finish', err, res);
						if (err) debugDetail('Query rejected', err.toString());
						if (err) return reject(err);
						if (myq.query.count) {
							debugDetail('Counted', res[0], 'docs from query');
							resolve(res[0]);
						} else {
							debugDetail('Found', res.length, 'docs from query');
							resolve(res);
						}
					});
				});
			} else {
				debugDetail('Execute query (via scan)', myq.query);
				if (myq.my.settings.indexes.scanWarning) console.log('WARN', 'Using scan instead of index based query for', myq.query);

				myq.my.emit('queryScan', myq.query);

				return new Promise((resolve, reject) => {
					var q = myq.model.model.scan(myq.query.filters);

					if (myq.query.count) q.count();
					if (myq.query.limit) q.limit(myq.query.limit);
					if (myq.query.index) q.using(myq.query.index);
					if (myq.query.selected) q.attributes(myq.query.selected);

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
				});
			}
		})
		// }}}
		// Soft select {{{
		.then(res => {
			if (!myq.query.soft.select || !_.isArray(res)) {
				return res; // Not an array or enabled anyway
			} else if (!myq.query.select.length && !Object.keys(model.virtuals).length) { // Not selecting anything and we have no virtuals
				return res;
			} else if (Object.keys(model.virtuals).length && !myq.query.select.length) { // Not selecting but we have virtuals to flatten
				return res.map(doc =>
					Object.keys(model.virtuals).reduce((t, k) => {
						t[k] = model.virtuals[k].get.call(doc, doc);
						return t;
					}, doc)
				);
			} else { // Selecting AND we have virtuals
				return res.map(doc =>
					myq.query.select.reduce((t, k) => {
						if (model.virtuals[k]) { // Is a virtual
							t[k] = model.virtuals[k].get.call(doc, doc);
						} else { // Is presumably a regular key
							t[k] = doc[k];
						}
						return t;
					}, {})
				)
			}
		})
		// }}}
		// Soft sort {{{
		.then(res => {
			if (!myq.query.soft.sort || !myq.query.sort.length || !_.isArray(res)) {
				return res; // Not an array or enabled anyway
			} else { // Selecting AND we have virtuals
				return _.orderBy(res, ..._(myq.query.sort)
					.map(o =>
						o.startsWith('-') ? [o.substr(1), 'desc']
						: o.startsWith('+') ? [o.substr(1), 'asc']
						: [o, 'asc']
					)
					.unzip()
					.value()
				);
			}
		})
		// }}}
		// Decorate documents (if !query.lean) {{{
		.then(res => _.isArray(res) && !myq.query.lean
			? res.map(doc => new myq.my.Document(model, doc))
			: res
		)
		// }}}
		// Perform post operation actions {{{
		.then(res => {
			if (!_.isArray(res)) return res;
			if (myq.query.action == 'update') {
				debug('Update', res.length, 'documents via exec post action');
				return Promise.all(res.map(doc => Promise.resolve()
					.then(()=>
						myq.query.lean
							? model.updateOneById(doc[model.settings.idField], myq.query.actionPayload)
							: doc.save(myq.query.actionPayload)
					)
					.then(()=> myq.query.lean ? undefined : doc)
					.catch(e => debug('Error when updating', doc[model.settings.idField], '-', e))
				));
			} else if (myq.query.action == 'delete') {
				debug('Delete', res.length, 'documents via exec post action');
				return Promise.all(res.map(doc =>
					myq.query.lean
						? model.deleteOneById(doc[model.settings.idField])
						: doc.delete()
				));
			} else {
				return res;
			}
		})
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


	/**
	* Return whether a model index exists which matches the query
	* * NOTE: This is not the same as the queryOptimizer used by Dynamoose
	* @param {Object} query The query to examine
	* @returns {string|undefined} The name of the index if one exists
	*/
	myq.getIndex = ()=>
		myq.model.describe()
			.then(spec => {
				var wantKeysSet = new Set(_.keys(myq.query.filters));
				if (!wantKeysSet.size) return undefined; // Cannot use indexes with 'find all' queries
				var wantSortSet = new Set(myq.query.sort);

				debug('SPEC', JSON.stringify(spec.moodyIndexLookup, null, '\t'));

				var useIndex = _(spec.moodyIndexLookup)
					.map(i => {
						i.filterScore = i.filters.reduce((t, v) => wantKeysSet.has(v) ? t + 1 : t, 0);
						i.sortScore = myq.query.sort.every(s => wantSortSet.has(s)) ? 1 : 0;
						return i;
					})
					.sortBy([
						'filterScore',
						'sortScore',
						(a, b) => a.index == 'partitionKey' ? -1 : 1, // Bias towards partition key if we can't guess
					])
					.first();

				debug('WANT', 'FILTERS:', Array.from(wantKeysSet), 'SORTS:', myq.query.sort);
				debug('COMPUTES TO', JSON.stringify(useIndex, null, '\t'));

				return useIndex ? useIndex.index : undefined;
			})

	return myq;
};
