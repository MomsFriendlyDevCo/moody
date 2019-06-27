module.exports = function MoodyDocument(model, data) {
	// Create initial prototype from model.prototype
	var myd = Object.create(model.prototype);

	// Assign all data
	Object.assign(myd, data);

	return myd;
};
