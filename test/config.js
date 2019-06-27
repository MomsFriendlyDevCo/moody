var moody = require('..');

moody.set({
	// If using AWS Dynamo local
	local: {
		enabled: true,
		uri: 'http://localhost:8000',
	},

	// Fallback if you have nothing else available
	dynalite: {
		enabled: false,
	},
});
