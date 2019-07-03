var _ = require('lodash');
var debug = require('debug')('moody');
var debugDetail = require('debug')('moody:detail');

module.exports = function(my, id, schema, options) {
	var mym = this;

	mym.id = id;
	mym.schema = schema;
	mym.my = my;

	mym.settings = {
		idField: 'id',
		...options,
	};


	// Document defaults {{{
	mym.prototype = {};

	mym.virtuals = {}; // Lookup table for virtuals (corresponds with Object.defineProperties spec, but its values are calculated and just appended to the object - not via getters)
	// }}}

	// Tidy schema {{{
	/**
	* Travese a schema making corrections
	* @param {*} node The node to examine
	* @param {array} [path] The current path, used for error reporting
	* @param {number|string} [offset] The key of the parent entity - used for rewriting
	* @param {boolean} [overrideSingleDef=false] If enabled do not treat the next branch as a short definition (i.e. if we find an object with a `type` property)
	* @returns {*} The rewritten input node
	*/
	var tidySchema = (node, path = [], offset, overrideSingleDef = false) => {
		if (_.isArray(node)) {
			if (node.length > 1) {
				throw new Error(`Storing multi-dimentional arrays is not allowed, only collections at path ${path}`);
			} else if (_.isEmpty(node[0])) {
				return {
					type: 'list',
					list: [{type: 'string'}],
				};
			} else if (_.isString(node[0])) { // Shorthand specifier
				return {
					type: 'list',
					list: [tidySchema({type: node[0]}, path, offset)],
				};
			} else if (_.isPlainObject(node[0])) { // Nested object of form {key: [{...}]}
				return {
					type: 'list',
					list: [{
						type: Map,
						map: tidySchema(node[0], path, offset, true),
					}],
				};
			} else {
				throw new Error(`Unknown nested type at path ${path}`);
			}
		} else if (_.isString(node)) {
			return tidySchema({type: node}, path, offset);
		} else if (!overrideSingleDef && _.isPlainObject(node) && node.type) { // Extended object definition
			// Add path {{{
			node.path = path.join('.');
			// }}}

			// Is there a matching my.types.translate element? {{{
			var translated = my.types.translate.find(type => type.test(node.type));
			if (translated) { // Found a translation
				node.type = translated.type;
			}
			// }}}

			// Check for custom schema types {{{
			if (!my.types.definitions[node.type]) throw new Error(`Unknown schema type "${node.type}" for model ${mym.id} at path ${node.path}`);

			if (_.isFunction(my.types.definitions[node.type])) {
				my.types.definitions[node.type](node, mym, my);
			} else if (_.isPlainObject(my.types.definitions[node.type])) {
				_.defaults(node, my.types.definitions[node.type]);
				node.type = my.types.definitions[node.type].type; // Clobber type at least so the next stage doesn't error out
			}
			// }}}

			// Make 'required' optional (defaults to false) {{{
			if (!_.has(node, 'required')) node.required = false;
			// }}}

			// Process 'index' property {{{
			if (node.index) {
				if (node.index == 'primary') {
					node.hashKey = true;
					mym.settings.idField = _.first(path.slice(-1, 2));
					delete node.index;
				} else if (node.index == 'sort') {
					node.rangeKey = true;
					delete node.index;
				} else if (node.index === true || node.index === false) {
					// Pass through
				} else if (_.isEqual(node.index, {unique: true})) {
					debug(`FIXME: No idea how to validate unique secondary indexes for model ${mym.id} at path ${node.path}`);
					node.index = true;
				} else {
					throw new Error(`Unknown index type for model ${mym.id} at path ${node.path}`);
				}
			}
			// }}}

			// debug('Schema node', node);
			return node;
		} else if (_.isObject(node)) { // Traverse down nested object
			return _.mapValues(node, (v, k) => tidySchema(v, path.concat(k)), offset+1);
		}
	}
	// }}}


	/**
	* Crete a single document and return it
	* @param {Object} doc The document to create
	* @returns {Promise <Object>} A promise which will resolve with the created document
	*/
	mym.create = (doc, options) => new Promise((resolve, reject) => {
		debug('Create doc', mym.id, doc);
		mym.model.create(doc, (err, created) => {
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
	mym.createMany = docs => {
		debug('Create', docs.length, 'docs in batch. Will submit in', Math.ceil(docs.length / 100), 'batches of', my.settings.createMany.batchSize, 'documents');

		return my.utils.promiseThrottle(
			my.settings.createMany.threads,
			_.chunk(docs, my.settings.createMany.batchSize)
				.map((docBatch, batchIndex) => ()=> new Promise((resolve, reject) => {
					mym.model.batchPut(docBatch, err => {
						debugDetail('Created batch', batchIndex);
						if (err) return reject(err);
						resolve();
					});
				}))
		).then(()=> debug('Created', docs.length, 'docs in batch'));
	};


	/**
	* Create a query instance which acts like a promise
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.find = query =>
		new my.Query(mym)
			.find(query);


	/**
	* Create a query instance that returns one document
	* @param {Object} [query] Initial filtering criteria to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.findOne = query =>
		new my.Query(mym)
			.find(query)
			.one();


	/**
	* Create a query instance that returns one document by its ID
	* @param {string} id The ID of the document to return
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.findOneById = mym.findOneByID = id =>
		new my.Query(mym)
			.find({[mym.settings.idField]: id})
			.one();


	/**
	* Create a query instance that searches for a single item by its ID and updates it
	* @param {id} string ID of the document to update
	* @param {Object} patch Patch to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.updateOneById = mym.updateOneByID = (id, patch) => new Promise((resolve, reject) => {
		debug('Update', id, 'with patch', patch);
		mym.model.update(id, patch, {}, (err, doc) => {
			if (err) return reject(e);
			resolve(doc);
		})
	});


	/**
	* Create a query instance that searches for a single item and updates it
	* @param {Object} query Query used to find the document
	* @param {Object} patch Patch to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.updateOne = (query, patch) =>
		new my.Query(mym)
			.find(query)
			.one()
			.update(patch);


	/**
	* Create a query instance that searches for a for items by a query and updates them
	* @param {id} query Query to use when searching
	* @param {Object} update Patch to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.updateMany = (query, patch) =>
		new my.Query(mym)
			.find(query)
			.update(patch);


	/**
	* Create a query instance in count mode with an optional filter
	* @param {Object} [query] Optional query to use
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.count = query =>
		new my.Query(mym)
			.count(query);


	/**
	* Remove a single document by its primary key
	* @param {string} id The ID of the document to remove
	*/
	mym.deleteOneById = mym.deleteOneByID = (id, patch) => new Promise((resolve, reject) => {
		debug('Delete', id);
		mym.model.delete(id, (err, doc) => {
			if (err) return reject(e);
			resolve(doc);
		})
	});


	/**
	* Remove the first matching document
	* @param {Object} query Query to remove documents by, this may be an empty object
	*/
	mym.deleteOne = query =>
		new my.Query(mym)
			.find(query)
			.one()
			.delete();


	/**
	* Remove all matching documents
	* @param {Object} query Query to remove documents by, this may be an empty object
	*/
	mym.deleteMany = query =>
		new my.Query(mym)
			.find(query)
			.delete();


	/**
	* Utility function to quickly load a JSON / JS file into a model
	* @param {Object|string} input Either a JS object or a file which can be loaded via `require()`
	* @returns {Promise} A promise which will resolve when the input data has been processed
	*/
	mym.loadData = input => Promise.resolve()
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
		.then(res => mym.createMany(res));


	/**
	* Destroy the table, removing all data
	* This function is automatically called if `settings.deleteExisting` is true
	* @param {Object} [options] Additional options to pass
	* @param {boolean} [options.ignoreNotExist=true] Don't throw if the table doesn't already exist
	* @returns {Promise} A promise which will resolve when the table has been removed
	*/
	mym.dropTable = options => new Promise((resolve, reject) => {
		var settings = {
			ignoreNotExist: true,
			...options,
		};

		// my.dynamoose.dynamoDB.deleteTable({TableName: id}, err => err ? resolve() : reject())
		my.dynamoose.dynamoDB.deleteTable({TableName: id}, err => {
			if (err) {
				if (settings.ignoreNotExist && err.code == 'ResourceNotFoundException') return resolve();
				debug('Err on drop', err);
				reject(err);
			} else {
				resolve();
			}
		});
	});


	/**
	* Create the intial table schema
	* @returns {Promise} A promise which will resolve when the table has been created
	*/
	mym.createTable = ()=> {
		debug(`Create table "${mym.id}"`);
		var schema = tidySchema(mym.schema);
		debugDetail(`Create table "${mym.id}" using schema`, schema);
		return mym.model = my.dynamoose.model(mym.id, schema, {
			prefix: '',
			suffix: '',
		});
	};



	/**
	* Declare a static method against a model
	* This is really just a mixin method to glue functios to this object instance
	* @param {string} name The function name to add
	* @param {function} func The function to add
	* @returns {MoodyModel} This chainable model
	*/
	mym.static = (name, func) => {
		if (mym[name]) throw new Error(`Unable to add method "${name}" as it is already declared`);
		mym[name] = func;
		debug(`Alloc static method "${name}" to ${mym.id}`)
		return mym;
	};


	/**
	* Declare a method against a document return
	* This extends the prototype object when documents are returned
	* @param {string} name The function name to add
	* @param {function} func The function to add
	* @returns {MoodyModel} This chainable model
	*/
	mym.method = (name, func) => {
		if (mym.prototype[name]) throw new Error(`Unable to add document prototype method "${name}" as it is already declared`);
		mym.prototype[name] = func;
		debug(`Alloc doc prototype method "${name}" to ${mym.id}`)
		return mym;
	};


	/**
	* Declare a virtual field against a document
	* A virtual is a getter / setter which is omited from the output
	* @param {string} name The function name to add
	* @param {function} [getFunc] The function to use as a getter
	* @param {function} [setFunc] The function to use as a setter
	* @returns {MoodyModel} This chainable model
	*/
	mym.virtual = (name, getFunc, setFunc) => {
		mym.virtuals[name] = {
			get: getFunc,
			set: setFunc,
		};

		debug(`Alloc virtual method "${name}" to ${mym.id}`)

		return mym;
	};


	/**
	* Ask the remote database to describe a table
	* The response of this function is the raw AWS spec
	* @url https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#describeTable-property
	* @param {Object} [options] Additional options to pass
	* @param {boolean} [options.cached=true] Use a cached description if we have one
	* @returns {Promise <Object>} A promise which will resolve with the table definition
	*/
	mym.describe = options => new Promise((resolve, reject) => {
		var settings = {
			cached: true,
			...options,
		};

		if (settings.cached && mym.describeCache) return Promise.resolve(mym.describeCache);

		debug(`Describe table "${id}"`);
		my.dynamoose.dynamoDB.describeTable({TableName: id}, (err, res) => {
			if (err) return reject(err);
			if (settings.cached) mym.describeCache = true;
			resolve(res);
		});
	});


	/**
	* Last return of mym.describe, used to return the cached value
	* @var {Object}
	*/
	mym.describeCache;


	/**
	* Alternate way to set up a ReST server
	* @param {Object} [options] Options to create the ReST server
	*/
	mym.serve = options => new my.RestServer(mym, options);

	my.models[mym.id] = this;


	return Promise.resolve()
		.then(()=> mym.settings.deleteExisting && mym.dropTable())
		.then(()=> mym.createTable())
		.then(()=> mym);
};
