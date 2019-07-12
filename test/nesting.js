var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Nested models', function() {

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res))
	after('disconnect', ()=> my.disconnect());

	before('create a base schema', ()=> my.schema('widgets', {
		id: {type: 'number', index: 'primary'},
		title: 'string',
		colors: [{
			name: 'string',
			shortCode: {type: 'string', value: (doc, iter, docPath, schemaPath) => iter.name.substr(0, 1).toUpperCase()}, // First letter of color, calculated
		}],
		settings: {
			something: {
				greeting: {type: 'string'},
				farewell: {type: 'string'},
			},
		},
	}, {deleteExisting: true}));

	before('create test documents', ()=> my.models.widgets.createMany([
		{id: 1, title: 'Sprocket', colors: [{name: 'blue'}, {name: 'yellow'}], settings: {something: {greeting: 'Hello'}}},
	]));

	it('should set nested endpoints', ()=> {
		var testDoc = new my.Document(my.models.widgets, {
			title: 'Test doc',
			colors: [
				{name: 'Orange'},
				{name: 'Pink'},
			],
			settings: {
				something: {
					greeting: 'Hello',
					// Intentional omission of 'farewell'
				},
			},
		});

		return Promise.resolve()
			.then(()=> { // Simple key/val
				var foundPaths = [];
				return testDoc.$each('title', (path, schemaPath) => foundPaths.push({path, schemaPath}))
					.then(()=> expect(foundPaths).to.deep.equal([
						{path: ['title'], schemaPath: ['title']},
					]))
			})
			.then(()=> { // Collection access
				var foundPaths = [];
				return testDoc.$each('colors', (path, schemaPath) => {
					foundPaths.push({path, schemaPath})
				})
					.then(()=> expect(foundPaths).to.deep.equal([
						{path: ['colors', 0], schemaPath: ['colors']},
						{path: ['colors', 1], schemaPath: ['colors']},
					]))
			})
			.then(()=> { // Nested objects - specified fields
				var foundPaths = [];
				return testDoc.$each('settings.something.greeting', (path, schemaPath) => {
					foundPaths.push({path, schemaPath});
				})
					.then(()=> expect(foundPaths).to.deep.equal([
						{path: ['settings', 'something', 'greeting'], schemaPath: ['settings', 'something', 'greeting']},
					]))
			})
			.then(()=> { // Nested objects - omitted fields
				var foundPaths = [];
				return testDoc.$each('settings.something.farewell', (path, schemaPath) => {
					foundPaths.push({path, schemaPath});
				})
					.then(()=> expect(foundPaths).to.deep.equal([
						{path: ['settings', 'something', 'farewell'], schemaPath: ['settings', 'something', 'farewell']},
					]))
			})
	});

	it('should have populated the nested value paths', ()=> {
		var sprockets = []; // Pulls from DB for each sprocket, so we can compare

		return my.models.widgets.findOneByID(1)
			.then(sprocket => {
				expect(sprocket).to.have.property('title', 'Sprocket');
				expect(sprocket).to.have.property('colors');
				expect(sprocket.colors).to.be.deep.equal([
					{name: 'blue', shortCode: 'B'},
					{name: 'yellow', shortCode: 'Y'},
				]);

				sprockets.push(sprocket);
			})
	});

});
