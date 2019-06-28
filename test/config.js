var moody = require('..');

moody.set({
	// FIXME: Temporary fix until native querying is supported
	indexes: {
		forceScan: true,
	},

	// If using AWS Dynamo local
	local: {
		enabled: false,
		uri: 'http://localhost:8000',
	},

	// Fallback if you have nothing else available
	dynalite: {
		enabled: true,
	},
});
