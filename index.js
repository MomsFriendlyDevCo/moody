var _ = require('lodash');
var debug = require('debug')('dynamoosey');
var dynalite = require('dynalite');
var dynamoose = require('dynamoose');
var promisify = require('util').promisify;

function Dynamoosey() {
	var dy = this;

	dy.Model = require('./lib/model');
	dy.Query = require('./lib/query');
	dy.oids = require('./lib/oids');
	dy.RestServer = require('./lib/rest');
	dy.utils = require('./lib/utils');
	dy.scenario = input => require('./lib/scenario')(dy, input);

	dy.dynamoose = dynamoose;
	dy.dynalite;

	dy.settings = {
		createMany: {
			threads: 1,
			batchSize: 100,
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
		aws: {
			accessKeyId: 'AKID',
			secretAccessKey: 'SECRET',
			region: 'us-east-1',
		},
	};


	/**
	* Set a single setting by key or merge config
	* @param {Object|string|array} key Either a single key (dotted string / array notation are supported) or an object to merge into the settings
	* @param {*} [val] The value to set if key is a path
	* @returns {Dynamoosey} This Dynamoosey instance
	*/
	dy.set = (key, val) => {
		if (_.isPlainObject(key)) {
			_.mergeDeep(dy.settings, key);
		} else {
			_.set(dy.settings, key, val);
		}
		return dy;
	};


	/**
	* Setup a connection to either Dynalite (spawned if needed) or AWS
	* @returns {Promise <Dynamoosey>} A promise which will resolve with the active Dynamoosey instance when completed
	*/
	dy.connect = options => Promise.resolve()
		.then(()=> {
			if (dy.settings.dynalite.enabled) {
				debug('Spawning dynalite service on port', dy.settings.dynalite.port);
				dy.dynalite = dynalite(dy.settings.dynalite);
				return new Promise((resolve, reject) => {
					dy.dynalite.listen(dy.settings.dynalite.port, err => {
						if (err) return reject(err);
						debug('Connected to Dynalite');
						resolve();
					});
				});
			} else {
				throw new Error('Remote Dyanmoose connections are not yet supported');
			}
		})
		.then(()=> dy.dynamoose.AWS.config.update({
			...dy.settings.aws,
			...options,
		}))
		.then(()=> dy.settings.dynalite.enabled && dy.dynamoose.local())
		.then(()=> dy)


	/**
	* Terminate outstanding connections and cleanup
	* @returns {Promise} A promise which will resolve after cleanup
	*/
	dy.disconnect = ()=> Promise.resolve()
		.then(()=> dy.dynalite && dy.dynalite.close())


	/**
	* Storage for all Dynamoosey models
	* @var {Object}
	*/
	dy.models = {}; // Model storage

	dy.schema = (id, schema) => new dy.Model(dy, id, schema);

	dy.serve = (model, options) => new dy.RestServer(dy.models[model], options);

	return dy;
};

module.exports = new Dynamoosey();
