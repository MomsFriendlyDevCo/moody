module.exports = function DynamooseyDocument(model, data) {
	// Create initial prototype from model.prototype
	var dyd = Object.create(model.prototype);

	// Assign all data
	Object.assign(dyd, data);

	return dyd;
};
