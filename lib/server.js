var express = require('express')
  , cookies = require('cookies')
  , utils = require('./helpers/utils')
  , middlewares = require('./helpers/middlewares')
  , Storage = require('./storage/storage')
  , UError = require('./helpers/error').UserError
  , Config = require('./core/config')

module.exports = function(config) {
	//config is a path
	if(typeof config == 'string')
		config = require(config)

	config = new Config(config)

	var storage = new Storage(config)
	var sinopia = new express.Router()

	//todo move this
	var can = function(action) {
		return function(req, res, next) {
			if (config['allow_'+action](req.params.package, req.remoteUser)) {
				next()
			} else {
				if (!req.remoteUser) {
					if (req.remoteUserError) {
						var msg = "can't "+action+' restricted package, ' + req.remoteUserError
					} else {
						var msg = "can't "+action+" restricted package without auth, did you forget 'npm set always-auth true'?"
					}
					next(new UError({
						status: 403,
						msg: msg,
					}))
				} else {
					next(new UError({
						status: 403,
						msg: 'user '+req.remoteUser+' not allowed to '+action+' it'
					}))
				}
			}
		}
	}


	sinopia.param('package', middlewares.validate_name)
	sinopia.param('filename', middlewares.validate_name)
	sinopia.param('tag', middlewares.validate_name)
	sinopia.param('version', middlewares.validate_name)
	sinopia.param('revision', middlewares.validate_name)
	sinopia.param('_rev', middlewares.match(/^-rev$/))
	sinopia.param('org_couchdb_user', middlewares.match(/^org\.couchdb\.user:/))

	sinopia

		.route('/:package/:version?')
		.get(function(req, res, next) {
			
			storage.get_package(req.params.package, {req: req}, function(err, info) {
				if (err) return next(err)
				info = utils.filter_tarball_urls(info, req, config)

				var version = req.params.version
				  , t
				if (!version) {
					return res.send(info)
				}

				if ((t = utils.get_version(info, version)) != null) {
					return res.send(t)
				}

				if (info['dist-tags'] != null) {
					if (info['dist-tags'][version] != null) {
						version = info['dist-tags'][version]
						if ((t = utils.get_version(info, version)) != null) {
							return res.send(t)
						}
					}
				}

				return next(new UError({
					status: 404,
					msg: 'version not found: ' + req.params.version
				}))
			})
			}
		)

	    sinopia
			.route('/:package/-/:filename')
			.get(
				can('access'),
				 function(req, res, next) {
					var stream = storage.get_tarball(req.params.package, req.params.filename)
					stream.on('content-length', function(v) {
						res.header('Content-Length', v)
					})
					stream.on('error', function(err) {
						return res.report_error(err)
					})
					res.header('Content-Type', 'application/octet-stream')
					stream.pipe(res)
				}
			)

		//app.get('/*', function(req, res) {
		//	proxy.request(req, res)
		//})

		// placeholder 'cause npm require to be authenticated to publish
		// we do not do any real authentication yet
		sinopia
			.route('/_session')
			.post(cookies.express(), function(req, res) {
				res.cookies.set('AuthSession', String(Math.random()), {
					// npmjs.org sets 10h expire
					expires: new Date(Date.now() + 10*60*60*1000)
				})
				res.send({'ok':true,'name':'somebody','roles':[]})
			})

		sinopia
			.route('/-/user/:org_couchdb_user')
			.get(function(req, res, next) {
				res.status(200)
				return res.send({
					ok: 'you are authenticated as "' + req.remoteUser + '"',
				})
			})
			.put(function(req, res, next) {
				res.status(409)
				return res.send({
					error: 'registration is not implemented',
				})
			})

		sinopia
			.route('/-/user/:org_couchdb_user/-rev/*')
			.put(function(req, res, next) {
				if (req.remoteUser == null) {
					res.status(403)
					return res.send({
						error: 'bad username/password, access denied',
					})
				}

				res.status(201)
				return res.send({
					ok: 'you are authenticated as "' + req.remoteUser + '"',
				})
			})

		// tagging a package
		sinopia
			.route('/:package/:tag')
			.put(
				can('publish'),
				middlewares.media('application/json'),
				function(req, res, next) {
					if (typeof(req.body) !== 'string') return next('route')

					storage.add_tag(req.params.package, req.body, req.params.tag, function(err) {
						if (err) return next(err)
						res.status(201)
						return res.send({
							ok: 'package tagged'
						})
					})
				}
			)

		// publishing a package
		sinopia
			.route('/:package/:_rev?/:revision?')
			.put(can('publish'), middlewares.media('application/json'), middlewares.expect_json, function(req, res, next) {
				var name = req.params.package

				if (Object.keys(req.body).length == 1 && utils.is_object(req.body.users)) {
					return next(new UError({
						// 501 status is more meaningful, but npm doesn't show error message for 5xx
						status: 404,
						msg: 'npm star|unstar calls are not implemented',
					}))
				}

				try {
					var metadata = utils.validate_metadata(req.body, name)
				} catch(err) {
					return next(new UError({
						status: 422,
						msg: 'bad incoming package data',
					}))
				}

				if (req.params._rev) {
					storage.change_package(name, metadata, req.params.revision, function(err) {
						after_change(err, 'package changed')
					})
				} else {
					storage.add_package(name, metadata, function(err) {
						after_change(err, 'created new package')
					})
				}

				function after_change(err, ok_message) {
					// old npm behaviour
					if (metadata._attachments == null) {
						if (err) return next(err)
						res.status(201)
						return res.send({
							ok: ok_message
						})
					}

					// npm-registry-client 0.3+ embeds tarball into the json upload
					// https://github.com/isaacs/npm-registry-client/commit/e9fbeb8b67f249394f735c74ef11fe4720d46ca0
					// issue #31, dealing with it here:

					if (typeof(metadata._attachments) != 'object'
					||  Object.keys(metadata._attachments).length != 1
					||  typeof(metadata.versions) != 'object'
					||  Object.keys(metadata.versions).length != 1) {

						// npm is doing something strange again
						// if this happens in normal circumstances, report it as a bug
						return next(new UError({
							status: 400,
							msg: 'unsupported registry call',
						}))
					}

					if (err && err.status != 409) return next(err)

					// at this point document is either created or existed before
					var t1 = Object.keys(metadata._attachments)[0]
					create_tarball(t1, metadata._attachments[t1], function(err) {
						if (err) return next(err)

						var t2 = Object.keys(metadata.versions)[0]
						create_version(t2, metadata.versions[t2], function(err) {
							if (err) return next(err)

							res.status(201)
							return res.send({
								ok: ok_message
							})
						})
					})
				}

				function create_tarball(filename, data, cb) {
					var stream = storage.add_tarball(name, filename)
					stream.on('error', function(err) {
						cb(err)
					})
					stream.on('success', function() {
						cb()
					})

					// this is dumb and memory-consuming, but what choices do we have?
					stream.end(new Buffer(data.data, 'base64'))
					stream.done()
				}

				function create_version(version, data, cb) {
					// assume latest tag, it's ignored anyway
					// if you want tags, tag packages explicitly
					storage.add_version(name, version, data, 'latest', cb)
				}
			})

		// unpublishing an entire package
		sinopia
			.route('/:package/-rev/*')
			.delete(can('publish'), function(req, res, next) {
				storage.remove_package(req.params.package, function(err) {
					if (err) return next(err)
					res.status(201)
					return res.send({
						ok: 'package removed'
					})
				})
			})

		// removing a tarball
		sinopia
			.route('/:package/-/:filename/-rev/:revision')
			.delete(can('publish'), function(req, res, next) {
				storage.remove_tarball(req.params.package, req.params.filename, req.params.revision, function(err) {
					if (err) return next(err)
					res.status(201)
					return res.send({
						ok: 'tarball removed'
					})
				})
			})

		// uploading package tarball
		sinopia
			.route('/:package/-/:filename/*')
			.put(can('publish'), middlewares.media('application/octet-stream'), function(req, res, next) {
				var name = req.params.package

				var stream = storage.add_tarball(name, req.params.filename)
				req.pipe(stream)

				// checking if end event came before closing
				var complete = false
				req.on('end', function() {
					complete = true
					stream.done()
				})
				req.on('close', function() {
					if (!complete) {
						stream.abort()
					}
				})

				stream.on('error', function(err) {
					return res.report_error(err)
				})
				stream.on('success', function() {
					res.status(201)
					return res.send({
						ok: 'tarball uploaded successfully'
					})
				})
			})

		// adding a version
		sinopia
			.route('/:package/:version/-tag/:tag')
			.put(can('publish'), middlewares.media('application/json'), middlewares.expect_json, function(req, res, next) {
				var name = req.params.package
				  , version = req.params.version
				  , tag = req.params.tag

				storage.add_version(name, version, req.body, tag, function(err) {
					if (err) return next(err)
					res.status(201)
					return res.send({
						ok: 'package published'
					})
				})
			})
		
	return sinopia;
}