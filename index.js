var _ = require('lodash');
var debug = require('debug')('dynamoosey');
var dynalite = require('dynalite');
var dynamoose = require('dynamoose');
var promisify = require('util').promisify;

function Dynamoosey() {
	var dy = this;

	dy.Model = require('./classes/model');
	dy.oids = require('./classes/oids');
	dy.utils = require('./classes/utils');

	dy.dynamoose = dynamoose;
	dy.dynalite;

	dy.settings = {
		dynalite: true,
		dynalitePort: 8000,
		aws: {
			accessKeyId: 'AKID',
			secretAccessKey: 'SECRET',
			region: 'us-east-1',
		},
	};


	/**
	* Setup a connection to either Dynalite (spawned if needed) or AWS
	* @returns {Promise <Dynamoosey>} A promise which will resolve with the active Dynamoosey instance when completed
	*/
	dy.connect = options => Promise.resolve()
		.then(()=> {
			if (dy.settings.dynalite) {
				debug('Spawning dynalite service on port', dy.settings.dynalitePort);
				dy.dynalite = dynalite();
				return new Promise((resolve, reject) => {
					dy.dynalite.listen(dy.settings.dynalitePort, err => {
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
		.then(()=> dy.settings.dynalite && dy.dynamoose.local())
		.then(()=> dy)

	dy.disconnect = ()=> { throw new Error('dy.disconnect() not yet supported') };


	/**
	* Storage for all Dynamoosey models
	* @var {Object}
	*/
	dy.models = {}; // Model storage

	dy.schema = (id, schema) => new dy.Model(dy, id, schema);

	return dy;
};

module.exports = new Dynamoosey();
