**Features**:

* Dynalite shipped internally to help with debugging
* All functions operate as promises, not callbacks
* Schemas now support string types i.e. `{type: String}` is the same as `{type: 'string'}`
* Can trap calls to all functions via the Debug NPM


**TODO:**

* [ ] query.select is not honored
* [ ] query.limit is not honored
* [ ] query.skip is not honored
* [ ] query.sort is not honored
* [ ] `model.updateMany()`, `model.deleteMany()` could be improved by them using better logic to reuse indexes rather than doing a query first


Debugging
=========
This module uses the [debug NPM module](https://github.com/visionmedia/debug) for debugging. To enable set the environment variable to `DEBUG=dynamoosey` or `DEBUG=dynamoosey*` for detail.

For example:

```
DEBUG=dynamoosey node myFile.js
```

If you want detailed module information (like what exact functions are calling queued), set `DEBUG=dynamoosey:detail`.
