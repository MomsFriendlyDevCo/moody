var crypto = require('crypto');
var promisify = require('util').promisify;
var uuid = require('uuid/v4');

module.exports = my => my
	.schemaType('pointer', {
		type: 'string',
		validate: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v),
	})
	.schemaType('oid', {
		type: 'string',
		default: ()=> promisify(crypto.randomBytes)(16)
			.then(random => uuid({random})),
		validate: v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v),
	})
