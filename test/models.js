var _ = require('lodash');
var moody = require('..');
var expect = require('chai').expect;

describe('Models', function() {

	var my;
	before('config', ()=> require('./config'));
	before('setup moody', ()=> moody.connect().then(res => my = res))
	after('disconnect', ()=> my.disconnect());

	before('create a base schema', ()=> my.schema('people', {
		id: {type: 'oid', index: 'primary'},
		firstName: 'string',
		middleName: 'string',
		lastName: {type: 'string'},
		edited: {type: 'number', value: doc => new Promise(resolve => setTimeout(()=> resolve(Date.now()), 100))}, // Set edited to a Unix Epoch (+3 ms precision because its JavaScript)
	}, {deleteExisting: true}));

	before('create test documents', ()=> my.models.people.createMany([
		{firstName: 'Joe', lastName: 'Nothing'},
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

	it('should have populated the `edited` value field in each case', ()=> {
		var joes = []; // All times we have pulled the "joes" record from the DB

		return my.models.people.find()
			.then(people => {
				expect(people).to.be.an('array');
				expect(people).to.have.length(3);
				people.forEach(person => {
					// Edited should not have been set as we have not written this object before
					expect(person).not.to.have.property('edited');
				});

				return people;
			})
			.then(people => Promise.all(people.map(person => person.toObject()))) // Flatten back into a plain object
			.then(people => {
				firstPeopleSet = people;
				people.forEach(person => {
					// Edit should have been set during the `toObject()` phrase
					expect(person).to.have.property('edited');

					// Remove middleName as it may not bre present, ignore initials because its a virtual
					expect(Object.keys(person).sort().filter(i => i != 'middleName')).to.deep.equal(['edited', 'firstName', 'id', 'lastName']);
				});
				joes.push(people.find(p => p.firstName == 'Joe'));
			})
			.then(()=> my.models.people.findOneByID(joes[0].id).update({firstName: 'Joseph'}))
			.then(changedPerson => {
				expect(changedPerson).to.have.property('firstName', 'Joseph');
				expect(changedPerson).to.have.property('edited');
				expect(changedPerson.edited).to.be.a('number');
				joes.push(changedPerson);
			})
			.then(()=> my.models.people.findOneByID(joes[0].id).update({firstName: 'Joseph2'})) // Write again to test edited updates
			.then(changedPerson => {
				expect(changedPerson).to.have.property('firstName', 'Joseph2');
				expect(changedPerson).to.have.property('edited');
				expect(changedPerson.edited).to.be.above(joes[1].edited);
				joes.push(changedPerson);
			})
			.then(()=> my.models.people.findOneByID(joes[0].id)) // Check the data did actually write
			.then(person => {
				expect(person).to.have.property('firstName', 'Joseph2');
				expect(person).to.have.property('edited');
				expect(person.edited).to.be.equal(joes[2].edited);
			})
	});

});
