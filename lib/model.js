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
