var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Document lifecycle', function() {
	this.timeout(5 * 1000);

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res));
	after('disconnect', ()=> my.disconnect());

	it('should create a schema', ()=> my.schema('widgets', {
		id: {type: 'oid'},
		title: {type: 'string', required: true},
		color: {type: 'string'},
	}, {deleteExisting: true}));

	it('should have registered the model globally', ()=> {
		expect(my.models).to.have.property('widgets');
		expect(my.models.widgets).to.be.an.instanceOf(my.Model);
	});

	var createdFoo;
	it('should create a document from the schema', ()=> Promise.resolve()
		.then(()=> my.models.widgets.create({
			title: 'Foo',
			color: 'red',
		}))
		.then(doc => {
			expect(doc).to.be.an('object');
			expect(doc).to.have.property('title', 'Foo');
			expect(doc).to.have.property('id');
			expect(doc.id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			createdFoo = _.toPlainObject(doc);
		})
	);

	it('should create many documents', ()=> my.models.widgets.createMany([
		{title: 'Bar', color: 'red'},
		{title: 'Baz', color: 'blue'},
		{title: 'Quz'},
	]));

	it('should query the documents', ()=> my.models.widgets.find({color: 'red'})
		.then(res => {
			expect(res).to.be.an('array');
			expect(res).to.have.length(2);
			res.forEach(doc => {
				expect(doc).to.be.an('object');
				expect(doc).to.have.property('title');
				expect(doc).to.have.property('id');
				expect(doc.id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			});
		})
	);

	it('should count all documents', ()=> my.models.widgets.count().then(res => expect(res).to.be.equal(4)))

	it('should count via a query', ()=> my.models.widgets.count({color: 'red'}).then(res => expect(res).to.be.equal(2)))

	it('should query one document - via query', function() {
		if (!createdFoo) return this.skip;
		return my.models.widgets.findOne({title: 'Foo'})
			.lean()
			.then(res => expect(res).to.deep.equal(createdFoo))
	});

	it('should query one document - via ID', function() {
		if (!createdFoo) return this.skip;
		return my.models.widgets.findOneByID(createdFoo.id)
			.lean()
			.then(res => expect(res).to.deep.equal(createdFoo))
	});

	it('should update a document - via query', function() {
		if (!createdFoo) return this.skip;
		return my.models.widgets.updateOne({title: 'Foo'}, {color: 'purple'}).lean()
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'purple'}))
			.then(()=> my.models.widgets.findOne({title: 'Foo'}).lean())
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'purple'}))
	});

	it('should update a document - via ID', function() {
		if (!createdFoo) return this.skip;
		return my.models.widgets.updateOneByID(createdFoo.id, {color: 'orange'})
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'orange'}))
			.then(()=> my.models.widgets.findOne({title: 'Foo'}).lean())
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'orange'}))
	});

	it('should one document by its ID', function() {
		return my.models.widgets.deleteOneByID(createdFoo.id)
			.then(()=> my.models.widgets.findOneByID(createdFoo.id))
			.then(()=> this.fail)
			.catch(()=> Promise.resolve())
	});

	it('should delete documents', ()=>
		my.models.widgets.deleteMany({color: 'red'})
			.then(()=> my.models.widgets.count({color: 'red'}))
			.then(count => expect(count).to.be.equal(0))
	);

	it('should delete all documents', ()=>
		my.models.widgets.deleteMany()
			.then(()=> my.models.widgets.count())
			.then(count => expect(count).to.be.equal(0))
	);

});
