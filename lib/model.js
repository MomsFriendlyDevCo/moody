var _ = require('lodash');
var debug = require('debug')('dynamoosey');

module.exports = function(dy, id, schema) {
	var dym = this;

	dym.id = id;
	dym.schema = schema;

	dym.settings = {
		idField: 'id',
	};

	// Tidy schema {{{
	var tidySchema = (node, path = [], offset) => {
		if (_.isArray(node)) {
			return node.map((child, index) => tidySchema(child, path.concat(index), index));
		} else if (_.isString(node)) {
			return tidySchema({type: node}, path, offset);
		} else if (_.isPlainObject(node) && node.type) { // Extended object definition
			// Add path {{{
			node.path = path.join('.');
			// }}}

			// Match type {{{
			if (node.type === String || node.type == 'string') {
				node.type = String;
			} else if (node.type === Number || node.type == 'number') {
				node.type = Number;
			} else if (node.type === Date || node.type == 'date') {
				node.type = Date;
			} else if (node.type == 'oid') {
				Object.assign(node, {
					type: String,
					default: dy.oids.create,
					validate: dy.oids.isOid,
				});
			} else {
				throw new Error(`Unknown schema type "${node.type}" at path ${path} for schema ${dym.id}`);
			}
			// }}}

			// Make 'required' optional (defaults to false) {{{
			if (!_.has(node, 'required')) node.required = false;
			// }}}

			// debug('Schema node', node);
			return node;
		} else if (_.isObject(node)) { // Traverse down nested object
			return _.mapValues(node, (v, k) => tidySchema(v, path.concat(k)), offset+1);
		}
	}
	// }}}

	/**
	* Dynamoose handle for the model
	* @var {DynamooseModel}
	*/
	debug('Create model', dym.id);
	dym.model = dy.dynamoose.model(dym.id, tidySchema(dym.schema), {
		prefix: '',
		suffix: '',
	});


	/**
	* Crete a single document and return it
	* @param {Object} doc The document to create
	* @returns {Promise <Object>} A promise which will resolve with the created document
	*/
	dym.create = (doc, options) => new Promise((resolve, reject) => {
		debug('Create doc', doc);
		dym.model.create(doc, (err, created) => {
			if (err) {
				debug('Failed to create doc', doc, 'Error:', err);
				return reject(err);
			}
			resolve(created);
		});
	});


	/**
	* Similar to create() but creates lots of items as quickly as possible
	* @param {array <Object>} docs Collection of items to input
	* @returns {Promise} A promise which will resolve when all items have been created, note that this does not return the created items
	*/
	dym.createMany = docs => {
		debug('Create', docs.length, 'docs in batch. Will submit in', Math.floor(docs.length / 100), 'batches of', dy.settings.createMany.batchSize, 'documents');

		return dy.utils.promiseThrottle(
			dy.settings.createMany.threads,
			_.chunk(docs, dy.settings.createMany.batchSize)
				.map((docBatch, batchIndex) => ()=> new Promise((resolve, reject) => {
					dym.model.batchPut(docBatch, err => {
						debug('Created batch', batchIndex);
						if (err) return reject(err);
						resolve();
					});
				}))
		);
	};


	/**
	* Create a query instance which acts like a promise
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.find = query =>
		new dy.Query(dym)
			.find(query);


	/**
	* Create a query instance that returns one document
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.findOne = query =>
		new dy.Query(dym)
			.find(query)
			.one();


	/**
	* Create a query instance that returns one document by its ID
	* @param {string} id The ID of the document to return
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.findOneById = dym.findOneByID = id =>
		new dy.Query(dym)
			.find({[dym.settings.idField]: id})
			.one();


	/**
	* Create a query instance that searches for a single item by its ID and updates it
	* @param {id} string ID of the document to update
	* @param {Object} patch Patch to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.updateOneById = dym.updateOneByID = (id, patch) => new Promise((resolve, reject) => {
		debug('Update', id, 'with patch', patch);
		dym.model.update(id, patch, {}, (err, doc) => {
			if (err) return reject(e);
			resolve(doc);
		})
	});


	/**
	* Create a query instance that searches for a single item and updates it
	* @param {Object} query Query used to find the document
	* @param {Object} patch Patch to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.updateOne = (query, patch) =>
		new dy.Query(dym)
			.find(query)
			.one()
			.action('update', patch);


	/**
	* Create a query instance that searches for a for items by a query and updates them
	* @param {id} query Query to use when searching
	* @param {Object} update Patch to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.updateMany = (query, patch) =>
		new dy.Query(dym)
			.find(query)
			.action('update', patch);


	/**
	* Create a query instance in count mode with an optional filter
	* @param {Object} [query] Optional query to use
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.count = query =>
		new dy.Query(dym)
			.count(query);


	/**
	* Remove a single document by its primary key
	* @param {string} id The ID of the document to remove
	*/
	dym.deleteOneById = dym.deleteOneByID = (id, patch) => new Promise((resolve, reject) => {
		debug('Delete', id);
		dym.model.delete(id, (err, doc) => {
			if (err) return reject(e);
			resolve(doc);
		})
	});


	/**
	* Remove the first matching document
	* @param {Object} query Query to remove documents by, this may be an empty object
	*/
	dym.deleteOne = query =>
		new dy.Query(dym)
			.find(query)
			.one()
			.action('delete');


	/**
	* Remove all matching documents
	* @param {Object} query Query to remove documents by, this may be an empty object
	*/
	dym.deleteMany = query =>
		new dy.Query(dym)
			.find(query)
			.action('delete');


	/**
	* Utility function to quickly load a JSON / JS file into a model
	* @param {Object|string} input Either a JS object or a file which can be loaded via `require()`
	* @returns {Promise} A promise which will resolve when the input data has been processed
	*/
	dym.loadData = input => Promise.resolve()
		.then(()=> {
			if (_.isString(input)) {
				debug('Load data from', input);
				return require(input);
			} else {
				return input;
			}
		})
		.then(res => {
			if (!Array.isArray(res)) throw new Error('Input data must be a collection');
			debug('Going to batch load', res.length, 'documents');
			return res
		})
		.then(res => dym.createMany(res));


	/**
	* @UNTESTED
	* Return whether an index exists which matches the query
	* @param {Object} query The query to examine
	* @returns {string|undefined} The name of the index if one exists
	*/
	dym.matchIndex = query => {
		var fields = _.keys(query);

		return dym.model.getTableReq().KeySchema
			.find(ks => _.isEqual(ks.AttributeName, fields));
	};


	dy.models[dym.id] = this;

	return this;
};
