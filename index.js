var _ = require('lodash');
var debug = require('debug')('moody');
var dynalite = require('dynalite');
var dynamoose = require('dynamoose');
var eventer = require('@momsfriendlydevco/eventer');
var timestring = require('timestring');

function Moody() {
	var my = this;

	my.Document = require('./lib/document');
	my.Model = require('./lib/model');
	my.Query = require('./lib/query');
	my.RestServer = require('./lib/rest');
	my.utils = require('./lib/utils');
	my.scenario = (input, options) => require('./lib/scenario')(my, input, options);
	my.types = require('./lib/types');

	my.dynamoose = dynamoose;
	my.dynalite;

	my.settings = {
		aws: {
			enabled: false,
			accessKeyId: 'AKID',
			secretAccessKey: 'SECRET',
			region: 'us-east-1',
		},
		cache: {
			defaultTime: timestring('30s'),
		},
		createBatch: {
			threads: 1,
			batchSize: 100,
		},
		createMany: {
			threads: 1,
		},
		dynalite: {
			enabled: true,
			port: 8000,
			path: undefined,
			ssl: false,
			createTableMs: 500,
			deleteTableMs: 500,
			updateTableMs: 500,
			maxItemSizeKb: 400,
		},
		extraTypes: true,
		local: {
			enabled: false,
			uri: 'http://localhost:8000',
		},
		indexes: {
			forceScan: false,
			scanWarning: false,
		},
		query: {
			soft: {
				select: false,
				sort: false,
			},
		},
		serve: {
		},
	};


	/**
	* Set a single setting by key or merge config
	* @param {Object|string|array} key Either a single key (dotted string / array notation are supported) or an object to merge into the settings
	* @param {*} [val] The value to set if key is a path
	* @returns {Moody} This Moody instance
	*/
	my.set = (key, val) => {
		if (_.isPlainObject(key)) {
			_.merge(my.settings, key);
		} else {
			_.set(my.settings, key, val);
		}
		return my;
	};


	/**
	* Setup a connection to either Dynalite (spawned if needed) or AWS
	* @returns {Promise <Moody>} A promise which will resolve with the active Moody instance when completed
	*/
	my.connect = options => Promise.resolve()
		.then(()=> {
			if (my.settings.dynalite.enabled) {
				debug('Spawning dynalite service on port', my.settings.dynalite.port);
				my.dynalite = dynalite(my.settings.dynalite);
				return new Promise((resolve, reject) => {
					my.dynalite.listen(my.settings.dynalite.port, err => {
						if (err) return reject(err);
						debug('Connected to Dynalite');
						resolve();
					});
				});
			} else if (my.settings.local.enabled) {
				debug('Connecting to', my.settings.local.uri);
			} else if (my.settings.aws.enabled) {
				debug('Connecting to AWS region', my.settings.aws.region);
			} else {
				throw new Error('Unsupported connection method, set one of {aws,dynalite,local}.enabled to true');
			}
		})
		.then(()=> my.dynamoose.AWS.config.update({
			...my.settings.aws,
			...options,
		}))
		.then(()=> {
			if (my.settings.dynalite.enabled) {
				return my.dynamoose.local();
			} else if (my.settings.local.enabled) {
				return my.dynamoose.local(my.settings.local.uri);
			}
		})
		.then(()=> my)


	/**
	* Terminate outstanding connections and cleanup
	* @returns {Promise} A promise which will resolve after cleanup
	*/
	my.disconnect = ()=> Promise.resolve()
		.then(()=> my.dynalite && my.dynalite.close())



	/**
	* Define (or overwrite) a schema type
	* @param {string} name The name of the type to declare
	* @param {function|Object} def Either a function which mutates the node (called as `(node, moody)`) or an object to assign to the node
	* @returns {Moody} This chainable instance
	*/
	my.schemaType = (id, def) => {
		if (!_.isFunction(def) && !_.isPlainObject(def)) throw new Error('Only functions and plain objects are allowed as schema type definitions');
		my.types.definitions[id] = def;
		return my;
	};


	/**
	* Storage for all Moody models
	* @var {Object}
	*/
	my.models = {}; // Model storage

	my.schema = (id, schema, options) => new my.Model(my, id, schema, options);

	my.serve = (model, options) => new my.RestServer(my.models[model], options);


	if (my.settings.extraTypes) require('./lib/defaultTypes')(my);

	eventer.extend(my);

	return my;
};

module.exports = new Moody();
