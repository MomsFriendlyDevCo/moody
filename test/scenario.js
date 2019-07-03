var moody = require('..');
var expect = require('chai').expect;

describe('Scenario import', function() {
	this.timeout(5 * 1000);

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res))
	after('disconnect', ()=> my.disconnect());

	before('setup actor schema', ()=> my.schema('actors', {
		id: {type: 'oid', index: 'primary'},
		name: {type: 'string', index: 'sort'},
	}, {deleteExisting: true}));

	before('setup directors schema', ()=> my.schema('directors', {
		id: {type: 'oid', index: 'primary'},
		name: {type: 'string', index: 'sort'},
	}, {deleteExisting: true}));

	before('setup movies schema', ()=> my.schema('movies', {
		id: {type: 'oid', index: 'primary'},
		title: {type: 'string', index: 'sort'},
		director: 'pointer',
		actors: ['pointer'],
	}, {deleteExisting: true}));


	it('should import a scenario file', ()=> my.scenario(`${__dirname}/data/scenario.js`, {threads: 1}));

});
