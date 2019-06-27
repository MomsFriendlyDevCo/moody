var _ = require('lodash');
var debug = require('debug')('moody');
var dynalite = require('dynalite');
var dynamoose = require('dynamoose');
var promisify = require('util').promisify;

function Moody() {
	var my = this;

	my.Document = require('./lib/document');
	my.Model = require('./lib/model');
	my.Query = require('./lib/query');
	my.oids = require('./lib/oids');
	my.RestServer = require('./lib/rest');
	my.utils = require('./lib/utils');
	my.scenario = input => require('./lib/scenario')(my, input);

	my.dynamoose = dynamoose;
	my.dynalite;

	my.settings = {
		createMany: {
			threads: 1,
			batchSize: 100,
		},
		aws: {
			accessKeyId: 'AKID',
			secretAccessKey: 'SECRET',
			region: 'us-east-1',
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
		local: {
			enabled: false,
			uri: 'http://localhost:8000',
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
			} else {
				throw new Error('Unsupported connection method, set one of {dynalite,local}.enabled to true');
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
	* Storage for all Moody models
	* @var {Object}
	*/
	my.models = {}; // Model storage

	my.schema = (id, schema) => new my.Model(my, id, schema);

	my.serve = (model, options) => new my.RestServer(my.models[model], options);

	return my;
};

module.exports = new Moody();
