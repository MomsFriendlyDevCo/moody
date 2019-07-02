var crypto = require('crypto');
var promisify = require('util').promisify;
var uuid = require('uuid/v4');

module.exports = my => my
	.schemaType('pointer', {
		type: 'string',
		validate: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	})
	.schemaType('oid', {
		type: 'string',
		default: ()=> promisify(crypto.randomBytes)(16)
			.then(random => uuid({random})),
		required: true,
		validate: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	})
