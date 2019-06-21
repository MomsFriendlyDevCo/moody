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

* [ ] query.select is not honored during a query
* [ ] query.limit is not honored during a query
* [ ] query.skip is not honored during a query
* [ ] query.sort is not honored during a query
* Deep schema validation
* dy.Query.find() needs to reuse indexes instead of doing stupid `scan()` operations every time
* [ ] `model.updateMany()`, `model.deleteMany()` could be improved by using better logic to reuse indexes rather than doing a query to fetch the ID's then acting on those


Debugging
=========
This module uses the [debug NPM module](https://github.com/visionmedia/debug) for debugging. To enable set the environment variable to `DEBUG=dynamoosey` or `DEBUG=dynamoosey*` for detail.

For example:

```
DEBUG=dynamoosey node myFile.js
```

If you want detailed module information (like what exact functions are calling queued), set `DEBUG=dynamoosey:detail`.
