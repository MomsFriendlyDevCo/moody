var _ = require('lodash');
var dynamoosey = require('..');
var expect = require('chai').expect;

describe('Extending', function() {

	var dy;
	before('setup dynamoosey', ()=> dynamoosey.connect().then(res => dy = res))
	after('disconnect', ()=> dy.disconnect());

	before('create a base schema', ()=> dy.schema('people', {
		id: {type: 'oid'},
		firstName: 'string',
		middleName: 'string',
		lastName: 'string',
	}));

	before('create test documents', ()=> dy.models.people.createMany([
		{firstName: 'Joe', lastName: 'Random'},
		{firstName: 'Jane', middleName: 'Oliver', lastName: 'Random'},
		{firstName: 'John', lastName: 'Random'},
	]));

	before('add a custom static', ()=> dy.models.people.static('countPeople', ()=>
		dy.models.people.count()
	));

	it('should be able to call a custom static method', ()=>
		dy.models.people.countPeople()
			.then(res => expect(res).to.equal(3))
	);

	before('add a custom method', ()=> dy.models.people.method('getName', function() {
		// Force this method to act like a promise
		return Promise.resolve([this.firstName, this.middleName, this.lastName].filter(i => i).join(' '));
	}));

	it('should be able to call a custom document method', ()=>
		dy.models.people.find()
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

	before('add a custom virtual', ()=> dy.models.people.virtual('intitals', function() {
		return [this.firstName, this.middleName, this.lastName]
			.filter(i => i)
			.map(i => i.substr(0, 1))
			.join('. ');
	}));

	it('should add a virtual getter', ()=>
		dy.models.people.find()
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

});
