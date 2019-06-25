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
* @param {object|function <Promise>|function} [options.queryForce] Override the incomming req.query object with either a static object or an evaluated promise returns. Called as `(req)`
* @param {function <Promise>|function} [options.queryValidate] Validate an incomming query, similar to `queryForce`. Throw an error to reject. Called as `(req)`.
*
* @example Create a simple ReST server of 'users' with default options
* app.use('/api/users', dynamoose.serve('users'))
*
* @example Create a ReST server where widgets can be created, updated and deleted as well as the default queries
* app.use('/api/widgets', dynamoose.serve('widgets', {
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

	return (req, res) => {
		var serverMethod;

		Promise.resolve()
			// Determine serverMethod {{{
			.then(()=> { // Work out method to use (GET /api/:id -> 'get', POST /api/:id -> 'save' etc.)
				if (req.method == 'GET' && settings.countToken && req.params[settings.param] && req.params[settings.param] == settings.countToken) { // Count matches
					serverMethod = 'count';
				} else if (req.method == 'GET' && req.params[settings.param]) { // Get one document
					serverMethod = 'get';
				} else if (req.method == 'GET') { // List all documents (filtered via req.query)
					serverMethod = 'query';
				} else if (req.method == 'POST' && req.params[settings.param]) { // Update an existing document
					serverMethod = 'save';
				} else if (req.method == 'POST') { // Create a new document (from req.body)
					serverMethod = 'create';
				} else if (req.method == 'DELETE' && req.params[settings.param]) { // Delete one document
					serverMethod = 'delete';
				} else {
					throw new Error('Unknown endpoint');
				}

				if (settings[serverMethod] === false) throw new Error('Not found'); // Endpoint is disabled
			})
			// }}}
			// Force query injection via queryForce {{{
			.then(()=> {
				if (!settings.queryForce || serverMethod == 'get' || serverMethod == 'save' || serverMethod == 'create'  || serverMethod == 'delete') return;

				if (_.isFunction(settings.queryForce)) {
					return Promise.resolve(settings.queryForce(req, res))
						.then(newQuery => req.query = newQuery)
				} else if (_.isObject(settings.queryForce)) {
					req.query = _.isObject(settings.queryForce);
				}
			})
			// }}}
			// Query validation {{{
			.then(()=> {
				if (!settings.queryValidate || serverMethod == 'get' || serverMethod == 'save' || serverMethod == 'create'  || serverMethod == 'delete') return;

				return Promise.resolve(settings.queryValidate(req, res))
			})
			// }}}
			// Run middleware {{{
			.then(()=> {
				var middleware = settings[serverMethod];

				if (middleware === true || (Array.isArray(middleware) && !middleware.length)) { // Endpoint enabled or no middleware to call
					return; // Pass through
				} else if (Array.isArray(middleware)) { // Array of middleware - run in series until exhausted
					return new Promise((resolve, reject) => {
						var runNextMiddleware = ()=> {
							var thisMiddleware = middleware.shift();
							if (!thisMiddleware) return resolve(); // Exhausted all middleware
							middleware(req, res, runNextMiddleware);
						}
						runNextMiddleware();
					});
				} else if (typeof middleware == 'function') { // Single function
					return Promise.resolve(middleware(req, res, cb));
				} else {
					throw new Error('Unknown middleware structure');
				}
			})
			// }}}
			// Execute function and return {{{
			.then(()=> {
				switch (serverMethod) {
					case 'count': return model.count(removeMetaParams(req.query))
						.then(count => ({count}))
						.catch(()=> res.sendStatus(404))

					case 'get': return model.findOneByID(req.params[settings.param])
						.select(req.query.select)
						.then(doc => {
							if (doc) return doc;
							res.sendStatus(404);
							return;
						})
						.catch(()=> res.sendStatus(404))

					case 'query': return model.find(removeMetaParams(req.query))
						.select(req.query.select)
						.sort(req.query.sort)
						.limit(req.query.limit)
						.skip(req.query.skip)
						.catch(e => res.status(400, e.toString()))

					case 'save': return model.updateOneById(req.params[settings.param], req.body)
						.catch(e => res.status(400, e.toString()))

					case 'create': return model.create(req.body)
						.catch(e => res.status(400, e.toString()))

					case 'delete': return model.deleteOneById(req.params[settings.param])
						.then(()=> {
							res.sendStatus(200)
							return;
						})
						.catch(e => res.status(400, e.toString()))
				}
			})
			// }}}
			// End {{{
			.then(output => res.send(output))
			.catch(res.sendError)
			// }}}
	};
};

module.exports = DynamooseyRestServer;
