var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Index access', function() {
	this.timeout(5 * 1000);

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res));
	after('disconnect', ()=> my.disconnect());

	var events = {queryScan: 0, queryPrimary: 0};
	before('setup event listeners', ()=> {
		my.on('queryPrimary', ()=> events.queryPrimary++);
		my.on('queryScan', ()=> events.queryScan++);
	});

	it('should create a schema', ()=> my.schema('widgets', {
		id: {type: 'oid', index: 'primary'},
		title: {type: 'string', required: true, index: 'sort'},
		color: {type: 'string', index: true},
		sprockets: {type: 'number'},
	}, {deleteExisting: true}));

	it('should create some test documents', ()=> my.models.widgets.createMany([
		{title: 'Foo', color: 'red', sprockets: 3},
		{title: 'Bar', color: 'white'},
		{title: 'Baz', color: 'red', sprockets: 12},
		{title: 'Quz', color: 'blue', sprockets: 9},
	]));

	it('should wait', ()=> new Promise(resolve => setTimeout(resolve, 1000)));

	it('should warn when using a raw scan method', ()=>
		my.models.widgets.find({sprockets: 10})
			.then(()=> expect(events.queryScan).to.equal(1))
	);

	it('should use the primary key index', ()=>
		my.models.widgets.find({id: 'b8e5ad7e-6f84-4335-9d7b-96930e1aa3bd'})
			.then(()=> expect(events.queryPrimary).to.equal(1))
	);

});
