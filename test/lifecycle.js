var _ = require('lodash');
var dynamoosey = require('..');
var expect = require('chai').expect;

describe('Document lifecycle', function() {
	this.timeout(5 * 1000);

	var dy;
	before('setup dynamoosey', ()=> dynamoosey.connect().then(res => dy = res))
	after('disconnect', ()=> dy.disconnect());

	it('should create a schema', ()=> dy.schema('widgets', {
		id: {type: 'oid'},
		title: {type: 'string', required: true},
		color: {type: 'string'},
	}));

	it('should have registered the model globally', ()=> {
		expect(dy.models).to.have.property('widgets');
		expect(dy.models.widgets).to.be.an.instanceOf(dynamoosey.Model);
	});

	var createdFoo;
	it('should create a document from the schema', ()=> Promise.resolve()
		.then(()=> dy.models.widgets.create({
			title: 'Foo',
			color: 'red',
		}))
		.then(doc => {
			expect(doc).to.be.an('object');
			expect(doc).to.have.property('title', 'Foo');
			expect(doc).to.have.property('id');
			expect(doc.id).to.satisfy(dy.oids.isOid);
			createdFoo = _.toPlainObject(doc);
		})
	);

	it('should create many documents', ()=> dy.models.widgets.insertMany([
		{title: 'Bar', color: 'red'},
		{title: 'Baz', color: 'blue'},
		{title: 'Quz'},
	]));

	it('should query the documents', ()=> dy.models.widgets.find({color: 'red'})
		.then(res => {
			expect(res).to.be.an('array');
			expect(res).to.have.length(2);
			res.forEach(doc => {
				expect(doc).to.be.an('object');
				expect(doc).to.have.property('title');
				expect(doc).to.have.property('id');
				expect(doc.id).to.satisfy(dy.oids.isOid);
			});
		})
	);

	it('should count all documents', ()=> dy.models.widgets.count().then(res => expect(res).to.be.equal(4)))

	it('should count via a query', ()=> dy.models.widgets.count({color: 'red'}).then(res => expect(res).to.be.equal(2)))

	it('should query one document - via query', function() {
		if (!createdFoo) return this.skip;
		return dy.models.widgets.findOne({title: 'Foo'})
			.then(res => expect(res).to.deep.equal(createdFoo))
	});

	it('should query one document - via ID', function() {
		if (!createdFoo) return this.skip;
		return dy.models.widgets.findOneByID(createdFoo.id)
			.then(res => expect(res).to.deep.equal(createdFoo))
	});

	it('should update a document - via query', function() {
		if (!createdFoo) return this.skip;
		return dy.models.widgets.updateOne({title: 'Foo'}, {color: 'purple'})
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'purple'}))
			.then(()=> dy.models.widgets.findOne({title: 'Foo'}))
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'purple'}))
	});

	it('should update a document - via ID', function() {
		if (!createdFoo) return this.skip;
		return dy.models.widgets.updateOneByID(createdFoo.id, {color: 'orange'})
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'orange'}))
			.then(()=> dy.models.widgets.findOne({title: 'Foo'}))
			.then(res => expect(res).to.deep.equal({...createdFoo, color: 'orange'}))
	});

	it('should one document by its ID', function() {
		return dy.models.widgets.deleteOneByID(createdFoo.id)
			.then(()=> dy.models.widgets.findOneByID(createdFoo.id))
			.then(()=> this.fail)
			.catch(()=> Promise.resolve())
	});

	it('should delete documents', ()=>
		dy.models.widgets.deleteMany({color: 'red'})
			.then(()=> dy.models.widgets.count({color: 'red'}))
			.then(count => expect(count).to.be.equal(0))
	);

	it('should delete all documents', ()=>
		dy.models.widgets.deleteMany()
			.then(()=> dy.models.widgets.count())
			.then(count => expect(count).to.be.equal(0))
	);

});
