var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Index access', function() {
	this.timeout(5 * 1000);

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res));
	before('force moody to use hard indexes', ()=> moody.set('indexes.forceScan', false));
	after('disconnect', ()=> my.disconnect());

	var events = {queryScan: 0, queryPrimary: 0};
	before('setup event listeners', ()=> {
		my.on('queryPrimary', ()=> events.queryPrimary++);
		my.on('queryScan', ()=> events.queryScan++);
	});

	it('should create a schema', ()=> my.schema('widgets', {
		id: {type: 'oid', index: 'primary'},
		title: {type: 'string', required: true, rangeKey: true},
		color: {type: 'string', index: {global: true, name: 'filterColorSortTitle'}},
		sprockets: {type: 'number', index: true},
	}, {deleteExisting: true}));

	it('should create some test documents', ()=> my.models.widgets.createMany([
		{title: 'Foo', color: 'red', sprockets: 3},
		{title: 'Bar', color: 'white'},
		{title: 'Baz', color: 'red', sprockets: 12},
		{title: 'Quz', color: 'blue', sprockets: 9},
	]));

	it('should wait', ()=> new Promise(resolve => setTimeout(resolve, 1000)));

	var widgets;
	it('should warn when using a raw scan method', ()=>
		my.models.widgets.find()
			.then(res => {
				widgets = res;
				expect(events.queryScan).to.equal(1);
			})
	);

	it('should use the primary key index', ()=>
		my.models.widgets.find({id: widgets[1].id})
			.then(res => {
				expect(res).to.be.an('array');
				expect(res).to.have.length(1);
				expect(res[0]).to.have.property('id', widgets[1].id);
			})
	);

	it('should use a secondary index (forced)', ()=>
		my.models.widgets.find({color: 'red'})
			.using('filterColorSortTitle')
			.then(res => {
				expect(res).to.be.an('array');
				expect(res).to.have.length(2);
			})
	);

	it('should use a secondary index (automatic)', ()=>
		my.models.widgets.find({color: 'blue'})
			.then(res => {
				expect(res).to.be.an('array');
				expect(res).to.have.length(1);
			})
	);

	// Not yet supported
	it.skip('should count with a range', ()=>
		my.models.widgets.find({
			sprockets: {$gt: 4},
		}).then(res => expect(res).to.equal(2))
	);

});
