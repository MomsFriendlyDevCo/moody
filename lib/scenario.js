var _ = require('lodash');
var debug  = require('debug')('moody');
var debugDetail  = require('debug')('moody:detail');
var glob = require('globby');


/**
* Deeply scan a document replacing all '$items' with their replacements
* @param {Object} doc The document to deep scan, document is modified in place
* @param {Object} lookup The lookup table to replace items with
* @returns {Object} An array of items that could not be resolved
*/
var scanDoc = (doc, lookup) => {
	var unresolved = [];
	var scanNode = (node, path) => {
		if (_.isArray(node)) {
			node.forEach((v, k) => scanNode(v, path.concat(k)));
		} else if (_.isPlainObject(node)) {
			Object.keys(node).forEach(k => k != '$' && scanNode(node[k], path.concat(k)));
		} else if (_.isString(node) && node.startsWith('$') && node.length > 1) {
			if (lookup[node]) {
				_.set(doc, path, lookup[node]);
			} else {
				unresolved.push(node)
			}
		}
	};
	scanNode(doc, []);
	return unresolved;
};


/**
* Utility function to quickly load a JSON / JS file into a model
* @param {Object|string|array <string|object>} input Either a JS object(s) or a file glob (or array of globs) to process
* @param {Object} [options] Additional options
* @param {boolean} [nuke=false] Whether to erase / rebuild existing tables before replacing them entirely
* @param {function <Promise>} [options.postRead] Manipulate the merged scenario object before processing, called as (tree) where each key is the model and all keys are an array of items, expected to return the changed tree
* @param {function} [options.postCreate] Function called whenever a document is created under a model, called as (model, count) where model is a string and count the number created for that model so far
* @param {function} [options.postStats] Called when complete as (stats) where each key is the model and the value is the number of documents created
* @param {number} [options.threads=3] How many documents to attempt to create at once
* @returns {Promise} A promise which will resolve when the input data has been processed
*/
module.exports = (my, input, options) => Promise.resolve()
	.then(()=> Promise.all(_.castArray(input).map(item => {
		if (_.isString(item)) {
				return glob(item)
					.then(files => files.map(file => {
						var res = require(file);
						if (!res || !_.isObject(res)) throw new Error(`Error importing scenario contents from ${file}, expected object got ${typeof res}`);
						debugDetail('Scenario import', file, '=', _.keys(res).length, 'keys');
						return res;
					}))
		} else if (_.isObject(item)) {
			return item;
		}
	})))
	.then(blob => blob[0].reduce((t, items) => {
		_.forEach(items, (v, k) => {
			t[k] = t[k] ? t[k].concat(v) : v;
		});
		return t;
	}, {}))
	.then(blob => {
		debugDetail('Import merged scenario', blob);
		return blob;
	})
	.then(blob => {
		if (!options || !options.postRead) return blob;

		// Call postRead and wait for response
		return options.postRead(blob);
	})
	.then(blob => {
		_.forEach(blob, (v, k) => {
			if (!my.models[k]) throw new Error(`Unknown model "${k}" when prepairing to create scenario`);
		});
		return blob;
	})
	.then(blob => {
		if (!options || !options.nuke) return blob;
		debug('Dropping tables:', _.keys(blob).join(', '));

		return Promise.all(
			_.keys(blob)
				.map(m => Promise.resolve()
					.then(()=> my.models[m].dropTable())
					.then(()=> my.models[m].createTable())
				)
		).then(()=> blob);
	})
	.then(blob => _.flatMap(blob, (items, table) => { // Flatten objects into array
		return items.map(item => ({
			id: item.$,
			needs: scanDoc(item, {}),
			table,
			item: _.omit(item, '$'),
		}));
	}), [])
	.then(blob => {
		var queue = blob;
		var lookup = {};
		var scenarioCycle = 0;
		var modelCounts = {};

		debugDetail('Import compiled scenario queue', queue);

		var tryCreate = ()=>
			my.utils.promiseThrottle(options && options.threads ? options.threads : 3, queue.map(item => ()=> {
				if (item.needs.length) return; // Cannot create at this stage
				if (!my.models[item.table]) throw new Error(`Cannot create item in non-existant or model "${item.table}"`);
				return my.models[item.table].create(item.item)
					.then(created => {
						// Stash ID?
						if (item.id) lookup[item.id] = created[my.models[item.table].settings.idField];
						item.created = true;

						if (options && options.postCreate) {
							modelCounts[item.table] = modelCounts[item.table] ? ++modelCounts[item.table] : 1;
							options.postCreate(item.table, modelCounts[item.table]);
						}
					})
					.catch(e => {
						debug('Error when creating doc', item.item, 'Error:', e);
						throw e;
					})
			}))
			.then(()=> { // Filter queue to non-created items
				var newQueue = queue.filter(item => !item.created);
				if (newQueue.length > 0 && queue.length == newQueue.length) {
					debug('--- UNRESOLVABLE QUEUE ---');
					debug(newQueue);
					debug('----------- END ----------');
					throw new Error('Unresolvable scenario - set DEBUG=moody to see document queue');
				}

				debug('Imported', queue.length - newQueue.length, 'in scenario cycle with', newQueue.length, 'remaining after cycle', ++scenarioCycle);
				queue = newQueue;
			})
			.then(()=> queue = queue.map(item => {
				item.needs = scanDoc(item.item, lookup);
				return item;
			}))
			.then(()=> queue.length && tryCreate())

		return tryCreate()
			.then(()=> options && options.postStats && options.postStats(modelCounts));
	})
