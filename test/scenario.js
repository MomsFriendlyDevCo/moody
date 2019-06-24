var dynamoosey = require('..');
var expect = require('chai').expect;

describe('Scenario import', function() {
	this.timeout(5 * 1000);

	var dy;
	before('setup dynamoosey', ()=> dynamoosey.connect().then(res => dy = res))
	after('disconnect', ()=> dy.disconnect());

	before('setup actor schema', ()=> dy.schema('actors', {
		id: {type: 'oid', hashKey: true},
		name: 'string',
	}));

	before('setup directors schema', ()=> dy.schema('directors', {
		id: {type: 'oid', hashKey: true},
		name: 'string',
	}));

	before('setup movies schema', ()=> dy.schema('movies', {
		id: {type: 'oid', hashKey: true},
		title: 'string',
		director: 'pointer',
		actors: ['pointer'],
	}));

	it('should import a scenario file', ()=> dy.scenario(`${__dirname}/data/scenario.js`));

});
