var _ = require('lodash');
var debug = require('debug')('dynamoosey');

module.exports = function(dy, id, schema) {
	var dym = this;

	dym.id = id;
	dym.schema = schema;

	// Tidy schema {{{
	var tidySchema = (node, path = [], offset) => {
		if (_.isArray(node)) {
			node.forEach((child, index) => tidySchema(child, path.concat(index), index));
		} else if (_.isObject(node) && node.type) { // Extended object definition
			// Add path {{{
			node.path = path.join('.');
			// }}}

			// Match type {{{
			if (node.type === String || node.type == 'string') {
				node.type = String;
			} else if (node.type === Number || node.type == 'number') {
				node.type = Number;
			} else if (node.type == 'oid') {
				Object.assign(node, {
					type: String,
					default: dy.oids.create,
					validate: dy.oids.isOid,
				});
				/*
				if (path.length == 1) {
					debug('Use hash key', path);
					node.hashKey = true;
				}
				*/
			} else {
				throw new Error(`Unknown schema type "${node.type}" at path ${path} for schema ${dym.id}`);
			}
			// }}}

			// Make 'required' optional (defaults to false) {{{
			if (!_.has(node, 'required')) node.required = false;
			// }}}

			// debug('Schema node', node);
		} else if (_.isObject(node)) { // Traverse down nested object
			Object.keys(node).forEach((k, index) => tidySchema(node[k], path.concat(k)), offset);
		}

		return node;
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
	dym.create = doc => new Promise((resolve, reject) => {
		debug('Create doc', doc);
		dym.model.create(doc, (err, created) => {
			debug('Failed to create doc', doc, 'Error:', err);
			if (err) return reject(err);
			resolve(created);
		});
	});


	/**
	* Call `create()` on an array of documents
	* @param {Array <Object>} docs The documents to create
	* @returns {Array <Object>} The created documents
	*/
	dym.createMany = dym.insertMany = docs => Promise.resolve()
		.then(()=> debug('Create', docs.length, 'docs'))
		.then(()=> Promise.all(docs.map(doc => dym.create(doc))));



	/**
	* Create a query instance which acts like a promise
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.find = query => new dy.Query(dym, query);


	/**
	* Create a query instance that returns one document
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {DynamooseyQuery} The query object + Promise
	*/
	dym.findOne = query => new dy.Query(dym, query).limit(1);


	/**
	* Remove all matching documents
	* @param {Object} query Query to remove documents by, this may be an empty object
	*/
	dym.deleteMany = query => new Promise((resolve, reject) => {
		debug('Delete many docs from', dym.id, 'with query', query);
		this.model.batchDelete(query, err => {
			if (err) return reject(err);
			resolve();
		});
	});


	/**
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
