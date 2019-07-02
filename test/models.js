var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Models', function() {

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res))
	after('disconnect', ()=> my.disconnect());

	before('create a base schema', ()=> my.schema('people', {
		id: {type: 'oid'},
		firstName: 'string',
		middleName: 'string',
		lastName: 'string',
	}, {deleteExisting: true}));

	before('create test documents', ()=> my.models.people.createMany([
		{firstName: 'Joe', lastName: 'Random'},
		{firstName: 'Jane', middleName: 'Oliver', lastName: 'Random'},
		{firstName: 'John', lastName: 'Random'},
	]));

	before('add a custom static', ()=> my.models.people.static('countPeople', ()=>
		my.models.people.count()
	));

	it('should be able to call a custom static method', ()=>
		my.models.people.countPeople()
			.then(res => expect(res).to.equal(3))
	);

	before('add a custom method', ()=> my.models.people.method('getName', function() {
		// Force this method to act like a promise
		return Promise.resolve([this.firstName, this.middleName, this.lastName].filter(i => i).join(' '));
	}));

	it('should be able to call a custom document method', ()=>
		my.models.people.find()
			.then(people => Promise.all(people.map(p =>
				p.getName()
					.then(fullName => p.fullName = fullName)
					.then(()=> p)
			)))
			.then(people => {
				expect(people).to.be.an('array');
				expect(people).to.have.length(3);
				people.forEach(person => {
					expect(person).to.have.property('firstName');
					expect(person).to.have.property('lastName');
					expect(person).to.have.property('fullName');
					expect(person.fullName).to.be.a('string');
					expect(person.fullName).to.have.length.above(5);
				});
			})
	);

	before('add a custom virtual', ()=> my.models.people.virtual('initials', function() {
		return [this.firstName, this.middleName, this.lastName]
			.filter(i => i)
			.map(i => i.substr(0, 1).toUpperCase())
			.join('');
	}));

	it('should add a virtual getter', ()=>
		my.models.people.find()
			.then(people => {
				expect(people).to.be.an('array');
				expect(people).to.have.length(3);
				people.forEach(person => {
					expect(person).to.have.property('initials');
					expect(person.initials).to.be.a('string');
					expect(person.initials).to.have.length.above(1);
				});
			})
	);

	it('should retrive the virtual getting during a select', ()=>
		my.models.people.find()
			.select('initials')
			.then(people => {
				expect(people).to.be.an('array');
				expect(people).to.have.length(3);
				people.forEach(person => {
					expect(Object.keys(person).sort()).to.deep.equal(['id', 'initials']);
					expect(person.initials).to.have.length.above(1);
				});
			})
	);

});
