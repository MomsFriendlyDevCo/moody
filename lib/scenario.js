var _ = require('lodash');
var debug  = require('debug')('dynamoosey');
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
		} else if (_.isString(node) && node.startsWith('$')) {
			if (lookup[node]) {
				debug('RESOLVE', path, '=', lookup[node]);
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
* @returns {Promise} A promise which will resolve when the input data has been processed
*/
module.exports = (dy, input) => Promise.resolve()
	.then(()=> Promise.all(_.castArray(input).map(item => {
		if (_.isString(item)) {
				return glob(item)
					.then(files => files.map(file => require(file)))
					.then(imported => _.first(imported))
		} else if (_.isObject(item)) {
			return item;
		}
	})))
	.then(blobs => blobs.reduce((t, v) => { // Merge all objects together
		if (!_.isObject(v)) throw new Error('First item in input must be an object');
		_.map(v, (v, k) => {
			if (!t[k]) {
				t[k] = v;
			} else {
				t[k] = t[k].concat(v);
			}
		});
		return t;
	}, {}))
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

		var tryCreate = ()=>
			Promise.all(queue.map(item => {
				if (item.needs.length) return; // Cannot create at this stage
				debug('MAKE', item.item);
				return dy.models[item.table].create(item.item)
					.then(created => {
						// Stash ID?
						if (item.id) lookup[item.id] = created[dy.models[item.table].settings.idField];
						item.created = true;
					});
			}))
			.then(()=> { // Filter queue to non-created items
				var newQueue = queue.filter(item => !item.created);
				if (queue.length == newQueue.length) {
					debug('Unresolvable remaining queue is', newQueue);
					throw new Error('Unresolable scenario');
				}

				debug('Imported', queue.length - newQueue.length, 'in scenario cycle', ++scenarioCycle);
				queue = newQueue;
			})
			.then(()=> queue = queue.map(item => {
				item.needs = scanDoc(item.item, lookup);
				return item;
			}))
			.then(()=> queue.length && tryCreate());

		return tryCreate();
	})
