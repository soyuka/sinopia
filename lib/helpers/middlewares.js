var UError = require('./error').UserError
  , crypto = require('crypto')
  , utils = require('./utils')


module.exports = {
	validate_name: function(req, res, next, value, name) {
		if (value.charAt(0) === '-') {
			// special case in couchdb usually
			next('route')
		} else if (utils.validate_name(value)) {
			next()
		} else {
			next(new UError({
				status: 403,
				msg: 'invalid ' + name,
			}))
		}
	},
	match: function(regexp) {
		return function(req, res, next, value, name) {
			if (regexp.exec(value)) {
				next()
			} else {
				next('route')
			}
		}
	},
	media: function media(expect) {
		return function(req, res, next) {
			if (req.headers['content-type'] !== expect) {
				next(new UError({
					status: 415,
					msg: 'wrong content-type, expect: '+expect+', got: '+req.headers['content-type'],
				}))
			} else {
				next()
			}
		}
	},
	expect_json: function expect_json(req, res, next) {
		if (!utils.is_object(req.body)) {
			return next({
				status: 400,
				msg: 'can\'t parse incoming json',
			})
		}
		next()
	}
}



