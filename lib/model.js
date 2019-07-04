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
	mym.prototype = {
		/**
		* Iterate down a document mapping all matching endpoints
		* With one (dotted notation) path this acts the same as _.set() but if any of the nodes are arrays all branching endpoints are mapped via the function
		* @param {string|array} path Path expression to traverse
		* @param {Promise|function} func Function to run on each endpoint, called as (val, path, doc), you can replace values with this.$set(path, newValue)
		* @param {Object} [context=this] Context to travese, relative to the path, defaults to the current document root
		* @param {string} [currentPath] The current absolute path, used for debugging
		* @returns {Promise} A promise which will resolve when all functions have completed
		*/
		$each(path, func, context = this, currentPath = []) {
			var rootDoc = this;
			if (!_.isArray(path)) path = path.split('.');

			var traverse = (path, context, currentPath) => {
				var segment = path.shift();

				if (_.isObject(context[segment])) { // Segment is traversable
					return Promise.all(
						_.map(context[segment], (v, k) =>
							traverse(path, context[segment], currentPath.concat([segment, k]))
						)
					);
				} else {
					return Promise.resolve(func.call(rootDoc, context[segment], _.dropRightWhile(currentPath.concat([segment]), i => i === undefined), rootDoc));
				}
			};

			return traverse(path, context, currentPath);
		},


		/**
		* Set the value of a dotted notation path, evaluating the value if its a promise
		* Note: Unlike $each this does not resolve relative to the schema path, just the plain object
		* @param {string|array} path Path to set in either dotted notation or array format
		* @param {*} val The value to set, if this is a function it is evaluated as a promise before completing
		* @returns {MoodyDocument} This moody document context
		*/
		$set(path, val) {
			if (_.isFunction(val)) {
				return Promise.resolve(val(doc))
					.then(res => _.set(this, path, res))
					.then(()=> this)
			} else {
				_.set(this, path, val);
				return Promise.resolve(this);
			}
		},


		/**
		* Convert the curent Moody document to a plain object
		* This will resolve all virtuals and value keys
		* @returns {Promise <Object>} A promise which will resolve to the flattened object
		*/
		toObject() {
			var waitingOn = [];

			// Calculate initial plain object from ownProperties
			var obj = _.pickBy(this, (v, k) => this.hasOwnProperty(k));

			// Remove all virtuals
			obj = _.omit(obj, _.keys(mym.virtuals));

			// Add value fields
			Object.keys(mym.valuePaths).forEach(vPath => {
				waitingOn = waitingOn.concat(
					this.$each(vPath, (v, nodePath) =>
						Promise.resolve(
							mym.valuePaths[vPath].call(this, this, nodePath.length ? _.get(this, nodePath.slice(0, -1)) : this)
						).then(newVal => _.set(obj, nodePath, newVal))
					)
				);
			});

			return Promise.all(waitingOn).then(()=> obj);
		},

		/**
		* Save the current Moody document back to the database
		* @param {object} [patch] Additional fields to merge along with changes to the original
		* @returns {Promise <Object>} A promise which will resolve when saving has completed with the server response
		*/
		save(patch) {
			if (patch) Object.assign(this, patch);
			debug('Saving document', mym.id, '/', this[mym.settings.idField]);

			return this.toObject()
				.then(payload => {
					debugDetail('Saving document', mym.id, '/', this[mym.settings.idField], payload);
					return mym.updateOneById(this[mym.settings.idField], payload);
				});
		},


		/**
		* Delete the current Moody document
		* @returns {Promise} A promise which will resolve when the document has been removed
		*/
		delete() {
			return mym.deleteOneById(this[mym.settings.idField]);
		},
	};

	mym.virtuals = {}; // Lookup table for virtuals (corresponds with Object.defineProperties spec, but its values are calculated and just appended to the object - not via getters)

	mym.valuePaths = {}; // Lookup of all keys we found that have a `value` attribute which will need setting on save, key is the field path, value is the function
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
		if (!path.length) { // Initial setup
			mym.valuePaths = {};
		}

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

			// Add to valuePaths if there is a value property {{{
			if (node.value) mym.valuePaths[node.path] = node.value;
			// }}}

			// debug('Schema node', node);
			return node;
		} else if (_.isObject(node)) { // Traverse down nested object
			return _.mapValues(node, (v, k) => tidySchema(v, path.concat(k)), offset+1);
		}
	}
	// }}}


	/**
	* Create a single document and return it
	* @param {Object} doc The document to create
	* @param {Object} [options] Additional options
	* @param {boolean} [options.lean=false] Bypass createing a stub MoodyDocument first, this is faster but doesnt take into account virtuals or value attributes
	* @returns {Promise <Object>} A promise which will resolve with the created document
	*/
	mym.create = (doc, options) => {
		var settings = {
			lean: false,
			...options,
		};

		debug('Create doc in table', mym.id, settings.lean ? '(lean)' : '(via MoodyDocument)');

		return Promise.resolve()
			.then(()=> settings.lean ? doc : new my.Document(mym, doc)) // Wrap in a MoodyDocument?
			.then(data => settings.lean ? data : data.toObject()) // Flatten document into an object
			.then(data => new Promise((resolve, reject) =>
				mym.model.create(data, (err, created) => {
					if (err) {
						debug('Failed to create doc', data, 'Error:', err);
						return reject(err);
					}
					resolve(created);
				})
			));
	};


	/**
	* Create many documents
	* This function is effectively a wrapper around mym.create() with an array (but no output)
	* @param {array <Object>} docs Collection of items to input
	* @param {Object} [options] Additional options
	* @param {number} [options.threads=my.settings.createMany.threads] How many threads to use
	* @returns {Promise} A promise which will resolve when all items have been created, note that this does not return the created items
	*/
	mym.createMany = (docs, options) => {
		var settings = {
			threads: 1,
			...my.settings.createMany,
			...options,
		};

		debug('Create', docs.length, 'docs');
		return my.utils.promiseThrottle(settings.threads, docs.map(doc => ()=> mym.create(doc, settings)));
	};


	/**
	* Similar to create() but creates lots of items as quickly as possible
	* This function is similar to createMany() but does NOT create a MoodyDocument first, bypassing virtuals and `value` attributes
	* @param {array <Object>} docs Collection of items to input
	* @param {Object} [options] Additional options
	* @param {number} [options.batchSize=my.settings.createBatch.batchSize] How many documents to create at once
	* @param {number} [options.threads=my.settings.createBatch.threads] How many threads to use
	* @returns {Promise} A promise which will resolve when all items have been created, note that this does not return the created items
	*/
	mym.createBatch = (docs, options) => {
		var settings = {
			threads: 1,
			batchSize: 3,
			...my.settings.createBatch,
			...options,
		};

		debug('Batch create', docs.length, 'docs. Will submit in batches of', settings.batchSize);

		return my.utils.promiseThrottle(
			settings.threads,
			_.chunk(docs, settings.batchSize)
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
	mym.findOneById = mym.findOneByID = id => {
		if (!id) throw new Error(`No ID specified for moody.${mym.id}.findOneById()`);

		return new my.Query(mym)
			.find({[mym.settings.idField]: id})
			.one();
	};


	/**
	* Create a query instance that searches for a single item by its ID and updates it
	* @param {id} string ID of the document to update
	* @param {Object} patch Patch to apply
	* @returns {MoodyQuery} The query object + Promise
	*/
	mym.updateOneById = mym.updateOneByID = (id, patch) => new Promise((resolve, reject) => {
		debug('Update', id, 'with patch', patch);
		mym.model.update(
			{[mym.settings.idField]: id},
			{$PUT: patch},
			(err, doc) => {
				if (err) return reject(err);
				resolve(doc);
			}
		)
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
		.then(res => mym.createBatch(res));


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
