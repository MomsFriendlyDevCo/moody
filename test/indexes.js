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
		id: {type: 'oid'},
		title: {type: 'string', required: true, index: 'sort'},
		color: {type: 'string', index: true},
		sprockets: {type: 'number'},
	}, {deleteExisting: true}));

	it('should wait', ()=> new Promise(resolve => setTimeout(resolve, 1000)));

	it('should warn when using a raw scan method', ()=>
		my.models.widgets.find({sprockets: 10})
			.then(()=> expect(events.queryScan).to.equal(1))
	);

	it('should use the primary key index', ()=>
		my.models.widgets.find({id: 123})
			.then(()=> expect(events.queryPrimary).to.equal(1))
	);

});
