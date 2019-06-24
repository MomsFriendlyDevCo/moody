@MomsFriendlyDevCo/Dynamoosey
=============================
Thin wrapper around Dynamoose, providing some additional functionality and bringing the API closer to standard [Mongoose](https://mongoosejs.com).


**Features**:

* Dynalite shipped internally to help with debugging
* All functions operate as promises, not callbacks
* Schemas now support string types i.e. `{type: String}` is the same as `{type: 'string'}`
* Object IDs (UUID/v4's) supported as a native type with `{type: 'oid'}`
* Can trap calls to all functions via the Debug NPM (see [below](#debugging))
* `model.createMany()` (this modules version of `model.batchPut`) works with batches and thread limits
* Usual collection of Mongoose like functionality: `model.count`, `model.find{,One,OneByID}`, `model.{delete,update}{OneByID,One,Many}`
* Functionality to quickly load from a file - `model.loadData(path|collection)`
* Express compatible ReST server out-of-the-box
* `index` attribute can now take more shorthand values


```javascript
var dy = require('@momsfriendlydevco/dynamoosey');
await dy.connect(); // By default uses Dynalite so no config needed for minimal tests


// Declare a schema which to validate against
dy.schema('widgets', { 
	id: {type: 'oid'},
	title: {type: 'string', required: true},
	color: {type: 'string'},
});


// Make a new widget
var myWidget = await dy.models.widgets.create({ 
	title: 'Foo',
	color: 'red',
});


// Update the widget by its primary key
await dy.models.widgets.updateOneByID(myWidget.id, {color: 'purple'});


// Delete it
await dy.models.widgets.deleteOneByID(myWidget.id);
```


**TODO:**

* [x] Basic implementation
* [x] [CRUD lifecycle](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete)
* [x] Testkits
* [x] ReST server
* [x] Scenario support
* [ ] Model.virtual()
* [ ] Model.method()
* [ ] Model.emit() / Model.on()
* [ ] query.select is not honored during a query
* [ ] query.limit is not honored during a query
* [ ] query.skip is not honored during a query
* [ ] query.sort is not honored during a query
* [ ] Deep schema validation
* [ ] dy.Query.find() needs to reuse indexes instead of doing stupid `scan()` operations every time
* [ ] `model.updateMany()`, `model.deleteMany()` could be improved by using better logic to reuse indexes rather than doing a query to fetch the ID's then acting on those


Debugging
=========
This module uses the [debug NPM module](https://github.com/visionmedia/debug) for debugging. To enable set the environment variable to `DEBUG=dynamoosey` or `DEBUG=dynamoosey*` for detail.

For example:

```
DEBUG=dynamoosey node myFile.js
```

If you want detailed module information (like what exact functions are calling queued), set `DEBUG=dynamoosey:detail`.


API
===

dynamoosey
----------
Main instance of the Dynamoosey database driver.


dynamoosey.dynamoose
--------------------
Dynamoose instance.


dynamoosey.settings
-------------------
Storage for global settings.

| Setting                  | Type    | Default     | Description                                           |
|--------------------------|---------|-------------|-------------------------------------------------------|
| `createMany`             | Object  | See below   | Settings which change the behaviour of `createMany()` |
| `createMany.threads`     | Number  | `1`         | How many parallel threads should be allowed           |
| `createMany.batchSize`   | Number  | `100`       | How many documents per batch                          |
| `dynalite`               | Object  | See below   | Settings which change the behaviour of Dynalite       |
| `dynalite.enabled`       | Boolean | `true`      | Whether Dynalite should be used                       |
| `dynalite.port`          | Number  | `8000`      | What port to run Dynalite on                          |
| `dynalite.path`          | String  | `undefined` | Path on disk to stort the Dynalite instance           |
| `dynalite.ssl`           | String  | `false`     | Whether to use SSL encodig with Dynalite              |
| `dynalite.createTableMs` | Number  | `500`       | See Dynalite documentation                            |
| `dynalite.deleteTableMs` | Number  | `500`       | See Dynalite documentation                            |
| `dynalite.updateTableMs` | Number  | `500`       | See Dynalite documentation                            |
| `dynalite.maxItemSizeKb` | Number  | `400`       | See Dynalite documentation                            |
| `aws`                    | Object  | See code    | AWS configuration settings                            |


dynamoosey.models
-----------------
Object for all loadded models. These can be set with `dynamoosey.set()`.


dynamoosey.set(key, val)
------------------------
Set a single setting by key or merge config.
If an object is passed the entire object is merged with the `dynamoosey.settings` object.


dynamoosey.connect(options)
---------------------------
Connect to AWS or spawn a Dynalite instance.
Returns a promise.


dynamoosey.disconnect()
-----------------------
Disconnect from AWS or close a Dynalite instance.
Returns a promise.


dynamoosey.schema(id, schema)
-----------------------------
Declare a model schema. All models are automatically available via `dynamoosey.models`.

Each schema entry has the following properties:

| Name           | Type                | Default | Description                                                                                                                                                                                                                                                                                             |
| `index`        | Boolean / String    | `false` | Specifies indexing, values are (`primary` - use as primary entry, `sort` - use as "range key", `true` - use as a secondary index and `false` - disable indexing)                                                                                                                                        |
| `type`         | * / String / Object |         | Specify the type of the field, both JS natives (e.g. `Boolean`, `Number`) and strings (e.g. `'boolean'`, `'number'`) are supported. Additional types can be added via `dy.addType()`. If an object is given this corresponds with the [Dynamoose index definition](https://dynamoosejs.com/api/schema). |
| `default`      | *                   |         | Specify the default value to use when creating a new document                                                                                                                                                                                                                                           |
| `required`     | Boolean             | `false` | Check that the field has a value before saving, null and undefined are not accepted                                                                                                                                                                                                                     |
| `trim`         | Boolean             | `false` | With strings, remove all surrounding whitespace
| `validate`     | Function, RegExp, * |         | Specify a validation function to run when setting the value                                                                                                                                                                                                                                             |
| `enum`         | Array <String>      |         | Specify valid options with a string                                                                                                                                                                                                                                                                     |
| `lowercase`    | Boolean             | `false` | Force incoming values to lowercase                                                                                                                                                                                                                                                                      |
| `uppercase`    | Boolean             | `false` | Force incoming values to UPPERCASE                                                                                                                                                                                                                                                                      |
| `forceDefault` | Boolean             | `false` | Always force the default value being used on first write, even if a value is specified                                                                                                                                                                                                                  |
| `set`          | Function            |         | Function to transform the given value before DB write                                                                                                                                                                                                                                                   |
| `get`          | Function            |         | Function to transform the raw DB value before passing it to the application                                                                                                                                                                                                                             |
| `toDynamo`     | Function            |         | Function to transform the entire field into a Dynamo response                                                                                                                                                                                                                                           |
| `fromDynamo`   | Function            |         | Inverse of `toDynamo`                                                                                                                                                                                                                                                                                   |


dynamoosey.serve(model, options)
--------------------------------
Return an Express middleware layer for a model.


```javascript
// Create a simple ReST server of 'users' with default options
app.use('/api/users', dynamoose.serve('users'))

// Create a ReST server where widgets can be created, updated and deleted as well as the default queries
app.use('/api/widgets', dynamoose.serve('widgets', {
	create: true,
	save: true,
	delete: (req, res, next) => res.send('Are you sure you should be deleting that?'),
))
```


dynamoose.scenario(input)
-------------------------
Accept a glob of files (can be an array) and import them. JSON and JS files (with an export) are accepted.
The meta field `$` is used to reference fields, with any value starting with `$` getting that fields value.

```javascript
module.exports = {
	actors: [
		{$: '$actors.daniel_bruhl', name: 'Daniel Bruhl'},
		{$: '$actors.chris_hemsworth', name: 'Chris Hemsworth'},
		{$: '$actors.olivia_wilde', name: 'Olivia Wilde'},
		{$: '$actors.natalie_portman', name: 'Natalie Portman'},
		{$: '$actors.tom_hiddleston', name: 'Tom Hiddleston'},
	],
	movies: [
		{
			title: 'Rush',
			year: 2013,
			actors: [
				'$actors.daniel_bruhl',
				'$actors.chris_hemsworth',
				'$actors.olivia_wilde',
			],
		},
	],
};
```


model
-----
A Dynamoosey model which was registered via `dynamoosey.schema(id, schema)`.

model.settings
--------------
Internal model settings.


| Name      | Type   | Default | Description                  |
|-----------|--------|---------|------------------------------|
| `idField` | String | `id`    | The primary key of the model |


model.create(doc, options)
--------------------------
Create a single document.
Returns a promise.


model.createMany(docArray)
--------------------------
Create multiple documents in an array. Operates in batches.
Returns a promise.


model.find(query)
-----------------
Create a query instance with an initially populated query.
Acts like a promise.


model.findOne(query)
--------------------
Shorthand for `model.find(query).one()`.


model.findOneByID(query)
------------------------
Shorthand for `model.find({[model.settings.idField]: id}).one()`.


model.count(query)
------------------
Shorthand for `model.find({[model.settings.idField]: id}).count()`.


model.updateOneByID(query, patch)
---------------------------------
Update a document by its ID.
Returns a promise.


model.updateOne(query, patch)
-----------------------------
Find a single document and patch it.
Returns a promise.


model.updateMany(query, patch)
------------------------------
Find a multiple documents and patch them.
Returns a promise.


model.deleteOneByID(query, patch)
---------------------------------
Delete a document by its ID.
Returns a promise.


model.deleteOne(query)
----------------------
Find a single document and delete it.
Returns a promise.


model.deleteMany(query)
-----------------------
Find a multiple documents and delete them.
Returns a promise.


model.loadData(input)
---------------------
Accept a filename or input object and perform a `model.createMany()` operation.
Returns a promise.


model.serve(options)
--------------------
Shorthand for `dynamoose.serve(id, options)`.


query
-----
The Dynamoose query object.
This is a chainable instance which executes itself when any Promise method is called i.e. `then`, `catch` or `finally.


query.find(query)
-----------------
Merge the internal query to execute with the provided one.


query.count()
-------------
Transform the query output into a count of documents rather than the document itself.


query.limit(limit)
------------------
Set the maximum number of documents to return.


query.skip(skip)
----------------
Ignore the first number of documents in a return.


query.select(fields...)
-----------------------
Specify an array, CSV or list of fields to provide from the query rather than the entire object.


query.sort(fields...)
---------------------
Specify an array, CSV or list of sort criteria. Reverse sorting is provided by prefixing the field with `-`.


query.one()
-----------
Return only the first match from a query as an object - rather than a collection.


query.exec()
------------
Execute the query and return a promise.
This is automatically invoked with any promise like function call - `then`, `catch` and `finally`.
