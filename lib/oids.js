var uuid = require('uuid/v4');

module.exports = {
	isOid: input => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	create: ()=> uuid(),
};
