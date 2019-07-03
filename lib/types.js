module.exports = {
	translate: [
		{test: f => f === String, type: 'string'},
		{test: f => f === Number, type: 'number'},
		{test: f => f === Date, type: 'date'},
		{test: f => f === Boolean, type: 'boolean'},
	],
	definitions: {
		// Basic scalar primatives
		boolean: node => node.type = Boolean,
		date: node => node.type = Date,
		map: node => node.type = Map,
		number: node => node.type = Number,
		string: node => node.type = String,
	},
};
