**Features**:

* Dynalite shipped internally to help with debugging
* All functions operate as promises, not callbacks
* Schemas now support string types i.e. `{type: String}` is the same as `{type: 'string'}`
* Can trap calls to all functions via the Debug NPM


**TODO:**

* `model.updateMany()`, `model.deleteMany()` could be improved by them using better logic to reuse indexes rather than doing a query first
