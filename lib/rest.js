var _ = require('lodash');
var debug = require('debug')('dynamoosey');

/**
* ReST server middleware for Express
* This middleware is designed to be used with `app.use` rather than picking specific endpoints, although this is also possible if needed
*
* NOTES:
*        * Middleware functions are standard Express pattern middlewares, they can either be a single function or an array
*        * This function is available as either `dynamoosey.serve(modelName, options)` or `dyanmoosey.models.MODEL.serve(options)`
*
* @param {DynamooseyModel} model Dynamoosey model to link against
* @param {Object} [options] Options object
* @param {string} [options.param="id"] Where to look in req.params for the document ID to get/update/delete
* @param {string} [options.countToken="count"] Special case to of req.params[options.param] when to count documents rather than query them
* @param {boolean|array <function>|function} [options.get=true] Enable getting of records or specify middleware(s) to execute beforehand
* @param {boolean|array <function>|function} [options.query=true] Enable querying of records or specify middleware(s) to execute beforehand
* @param {boolean|array <function>|function} [options.count=true] Enable counting of records or specify middleware(s) to execute beforehand
* @param {boolean|array <function>|function} [options.create=false] Enable creating of records or specify middleware(s) to execute beforehand
* @param {boolean|array <function>|function} [options.save=false] Enable updating of records or specify middleware(s) to execute beforehand
* @param {boolean|array <function>|function} [options.delete=false] Enable deleting of records or specify middleware(s) to execute beforehand
*
* @example Create a simple ReST server of 'users' with default options
* app.use('/api/users', dynamoose.serve('users'))
*
* @example Create a ReST server where widgets can be created, updated and deleted as well as the default queries
* app.use('/api/users', dynamoose.serve('users', {
*   create: true,
*   save: true,
*   delete: (req, res, next) => res.send('Are you sure you should be deleting that?'),
* ))
*/
var DynamooseyRestServer = function(model, options) {
	var settings = {
		param: 'id',
		countToken: 'count',
		get: true,
		query: true,
		count: true,
		create: false,
		save: false,
		delete: false,
		...options,
	};

	var removeMetaParams = query => _.omit(query, ['limit', 'select', 'skip', 'sort']);

	// Utility functions {{{
	/**
	* Execute any associated middlewares before calling the callback
	* @param {array|function|boolean} middleware An express middleware, an array of the same or Boolean True/False to globally enable/disable
	*/
	var runMiddleware = (middleware, req, res, cb) => {
		if (middleware === false) { // Endpoint disabled
			res.sendStatus(404);
		} else if (middleware === true || (Array.isArray(middleware) && !middleware.length)) { // Endpoint enabled or no middleware to call
			cb();
		} else if (Array.isArray(middleware)) { // Array of middleware - run in series until exhausted
			var runNextMiddleware = ()=> {
				var thisMiddleware = middleware.shift();
				if (!thisMiddleware) return cb(); // Exhausted all middleware
				middleware(req, res, runNextMiddleware);
			}
			runNextMiddleware();
		} else if (typeof middleware == 'function') { // Single function
			middleware(req, res, cb);
		}
	};
	// }}}

	return (req, res) => {
		if (req.method == 'GET' && settings.countToken && req.params[settings.param] && req.params[settings.param] == settings.countToken) { // Count matches
			runMiddleware(settings.get, req, res, ()=>
				model.count(req.query)
					.then(count => res.send({count}))
					.catch(()=> res.status(404))
			);
		} else if (req.method == 'GET' && req.params[settings.param]) { // Get one document
			runMiddleware(settings.get, req, res, ()=>
				model.findOneByID(req.params[settings.param])
					.select(req.query.select)
					.then(doc => res.send(doc))
					.catch(()=> res.status(404))
			);
		} else if (req.method == 'GET') { // List all documents (filtered via req.query)
			runMiddleware(settings.get, req, res, ()=>
				model.find(removeMetaParams(req.query))
					.select(req.query.select)
					.sort(req.query.sort)
					.limit(req.query.limit)
					.skip(req.query.skip)
					.then(docs => res.send(docs))
					.catch(e => res.status(400, e.toString()))
			);
		} else if (req.method == 'POST' && req.params[settings.param]) { // Update an existing document
			runMiddleware(settings.save, req, res, ()=>
				model.updateOneById(req.params[settings.param], req.body)
					.then(doc => res.send(doc))
					.catch(e => res.status(400, e.toString()))
			);
		} else if (req.method == 'POST') { // Create a new document (from req.body)
			runMiddleware(settings.create, req, res, ()=>
				model.create(req.body)
					.then(doc => res.send(doc))
					.catch(e => res.status(400, e.toString()))
			);
		} else if (req.method == 'DELETE' && req.params[settings.param]) { // Delete one document
			runMiddleware(settings.delete, req, res, ()=>
				model.deleteOneById(req.params[settings.param])
					.then(()=> res.sendStatus(200))
					.catch(e => res.status(400, e.toString()))
			);
		} else {
			res.status(400).send('Unknown request');
		}
	};
};

module.exports = DynamooseyRestServer;
