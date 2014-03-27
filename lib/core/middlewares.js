var UError = require('../helpers/error').UserError
  , logger = require('./logger')
  , crypto = require('crypto')
  , path = require('path')
  , utils = require('../helpers/utils')

// express doesn't do etags with requests <= 1024b
// we use md5 here, it works well on 1k+ bytes, but sucks with fewer data
// could improve performance using crc32 after benchmarks
function md5sum(data) {
	return crypto.createHash('md5').update(data).digest('hex')
}

module.exports = {
	basic_auth: function(callback) {
		return function(req, res, _next) {
			function next(err) {
				// uncomment this to reject users with bad auth headers
				//return _next.apply(null, arguments)

				// swallow error, user remains unauthorized
				// set remoteUserError to indicate that user was attempting authentication
				if (err) req.remoteUserError = err.msg
				return _next()
			}

			var authorization = req.headers.authorization

			if (req.remoteUser != null) return next()
			if (authorization == null) return next()

			var parts = authorization.split(' ')

			if (parts.length !== 2) return next({
				status: 400,
				msg: 'bad authorization header',
			})

			var scheme = parts[0]
			  , credentials = new Buffer(parts[1], 'base64').toString()
			  , index = credentials.indexOf(':')

			if (scheme !== 'Basic' || index < 0) return next({
				status: 400,
				msg: 'bad authorization header',
			})

			var user = credentials.slice(0, index)
			  , pass = credentials.slice(index + 1)

			 logger.info(user, path)

			if (callback(user, pass)) {
				req.remoteUser = user
				next()
			} else {
				next({
					status: 403,
					msg: 'bad username/password, access denied',
				})
			}
		}
	},	
	error_reporter: function(req, res, next) {
		var calls = 0

		res.report_error = res.report_error || function(err) {
			calls++
			if (err.status && err.status >= 400 && err.status < 600) {
				global.console.log('Error', err)
				if (calls == 1) {
					res.status(err.status)
					var body = {error: err.msg || err.message || 'unknown error'};

					// Make 404 responses compliant with CouchDB REST API
					if (err.status == 404) {
						body.reason = body.error
						body.error = 'not_found'
					}

					res.send(body)
				}
			} else {
				logger.error({err: err}, 'unexpected error: @{!err.message}\n@{err.stack}')
				if (!res.status || !res.send) {
					logger.error('this is an error in express.js, please report this')
					res.destroy()
				}
				if (calls == 1) {
					res.status(500)
					res.send({error: 'internal server error'})
				}
			}
		}

		next()
	},
	error: function (err, req, res, next) {
		if(err) {
			res.report_error(err)
		} else
			next()
	},
	anti_loop: function(config) {
		return function(req, res, next) {
			if (req.headers.via != null) {
				var arr = req.headers.via.split(',')
				for (var i=0; i<arr.length; i++) {
					var m = arr[i].match(/\s*(\S+)\s+(\S+)/)
					if (m && m[2] === config.server_id) {
						return next(new UError({
							status: 508,
							msg: 'loop detected',
						}))
					}
				}
			}
			next()
		}
	},
	log_and_etagify: function(req, res, next) {
		// logger
		req.log = logger.child({sub: 'in'})


		var _auth = req.headers.authorization
		if (_auth) req.headers.authorization = '<Classified>'
		req.log.info({req: req, ip: req.ip}, '@{ip} requested \'@{req.method} @{req.url}\'')
		if (_auth) req.headers.authorization = _auth

		var bytesin = 0
		req.on('data', function(chunk){ bytesin += chunk.length })

		var _send = res.send
		res.send = function(body) {
			try {
				if (typeof(body) === 'string' || typeof(body) === 'object') {
					res.header('Content-type', 'application/json')

					if (typeof(body) === 'object' && body != null) {
						if (body.error) {
							res._sinopia_error = body.reason || body.error
						}
						body = JSON.stringify(body, undefined, '\t') + '\n'
					}

					// don't send etags with errors
					if (!res.statusCode || (res.statusCode >= 200 && res.statusCode < 300)) {
						res.header('ETag', '"' + md5sum(body) + '"')
					}
				} else {
					// send(null), send(204), etc.
				}
			} catch(err) {
				// if sinopia sends headers first, and then calls res.send()
				// as an error handler, we can't report error properly,
				// and should just close socket
				if (err.message.match(/set headers after they are sent/)) {
					return res.socket.destroy()
				} else {
					throw err
				}
			}

			res.send = _send
			res.send(body)
		}

		var bytesout = 0
		  , _write = res.write
		res.write = function(buf) {
			bytesout += buf.length
			_write.apply(res, arguments)
		}

		function log() {
			var msg = '@{status}, user: @{user}, req: \'@{request.method} @{request.url}\''
			if (res._sinopia_error) {
				msg += ', error: @{!error}'
			} else {
				msg += ', bytes: @{bytes.in}/@{bytes.out}'
			}
			req.log.warn({
				request: {method: req.method, url: req.url},
				level: 35, // http
				user: req.remoteUser,
				status: res.statusCode,
				error: res._sinopia_error,
				bytes: {
					in: bytesin,
					out: bytesout,
				}
			}, msg)
		}

		req.on('close', function() {
			log(true)
		})

		var _end = res.end
		res.end = function(buf) {
			if (buf) bytesout += buf.length
			_end.apply(res, arguments)
			log()
		}
		next()
	}
}