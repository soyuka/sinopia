require('./lib/startup')

var assert = require('assert')
  , async = require('async')
  , crypto = require('crypto')

function readfile(x) {
	return require('fs').readFileSync(__dirname + '/' + x)
}

module.exports = function() {
	var server = process.server
	var server2 = process.server2
	
	var rand_package_name = 'testpkg' + Math.round(Math.random() * 100)

	describe('Testing package : '+rand_package_name, function() {

		it('trying to fetch non-existent package', function(cb) {
			server.get_package(rand_package_name, function(res, body) {
				assert.equal(res.statusCode, 404)
				assert.equal(body.error, 'not_found')
				assert(~body.reason.indexOf('no such package'))
				cb()
			})
		})

		it('should add package', function(cb) {
			//asserts are already made into the add_package function...
			server.add_package(rand_package_name, cb)
		})

		it('downloading non-existent tarball', function(cb) {
			server.get_tarball(rand_package_name, 'blahblah', function(res, body) {
				assert.equal(res.statusCode, 404)
				assert.equal(body.error, 'not_found')
				assert(~body.reason.indexOf('no such file'))
				cb()
			})
		})

		it('uploading incomplete tarball', function(cb) {
			server.put_tarball_incomplete(rand_package_name, 'blahblah1', readfile('fixtures/binary'), 3000, function(res, body) {
				cb()
			})
		})

		describe('tarball', function() {

			it('should upload new tarball', function(cb){
				server.put_tarball(rand_package_name, 'blahblah', readfile('fixtures/binary'), function(res, body) {
					assert.equal(res.statusCode, 201)
					assert(body.ok)
					cb()
				})
			})

			it('downloading newly created tarball', function(cb) {
				server.get_tarball(rand_package_name, 'blahblah', function(res, body) {
					assert.equal(res.statusCode, 200)
					assert.deepEqual(body, readfile('fixtures/binary').toString('utf8'))
					cb()
				})
			})

			it('uploading new package version (bad sha)', function(cb) {
				var pkg = require('./lib/package')(rand_package_name)
				pkg.dist.shasum = crypto.createHash('sha1').update('fake').digest('hex')
				server.put_version(rand_package_name, '0.0.1', pkg, function(res, body) {
					assert.equal(res.statusCode, 400)
					assert(~body.error.indexOf('shasum error'))
					cb()
				})
			})

			describe('version', function() {

				it('uploading new package version', function(cb){
					var pkg = require('./lib/package')(rand_package_name)
					pkg.dist.shasum = crypto.createHash('sha1').update(readfile('fixtures/binary')).digest('hex')
					server.put_version(rand_package_name, '0.0.1', pkg, function(res, body) {
						assert.equal(res.statusCode, 201)
						assert(~body.ok.indexOf('published'))
						cb()
					})
				})

				it('downloading newly created package', function(cb) {
					server.get_package(rand_package_name, function(res, body) {
						assert.equal(res.statusCode, 200)
						assert.equal(body.name, rand_package_name)
						assert.equal(body.versions['0.0.1'].name, rand_package_name)
						assert.equal(body.versions['0.0.1'].dist.tarball, 'http://localhost:55551/'+rand_package_name+'/-/blahblah')
						assert.deepEqual(body['dist-tags'], {latest: '0.0.1'})
						cb()
					})
				})

				it('downloading package via server2', function(cb) {
					server2.get_package(rand_package_name, function(res, body) {
						assert.equal(res.statusCode, 200)
						assert.equal(body.name, rand_package_name)
						assert.equal(body.versions['0.0.1'].name, rand_package_name)
						assert.equal(body.versions['0.0.1'].dist.tarball, 'http://localhost:55552/'+rand_package_name+'/-/blahblah')
						assert.deepEqual(body['dist-tags'], {latest: '0.0.1'})
						cb()
					})
				})
			})
		})

		it('uploading new package version for bad pkg', function(cb) {
			server.put_version('testpxg', '0.0.1', require('./lib/package')('testpxg'), function(res, body) {
				assert.equal(res.statusCode, 404)
				assert.equal(body.error, 'not_found')
				assert(~body.reason.indexOf('no such package'))
				cb()
			})
		})

		it('doubleerr test', function(cb) {
			server.put_tarball('testfwd2', 'blahblah', readfile('fixtures/binary'), function(res, body) {
				assert.equal(res.statusCode, 404)
				assert(body.error)
				cb()
			})
		})

		it('publishing package / bad ro uplink', function(cb) {
			server.put_package('baduplink', require('./lib/package')('baduplink'), function(res, body) {
				assert.equal(res.statusCode, 503)
				assert(~body.error.indexOf('one of the uplinks is down, refuse to publish'))
				cb()
			})
		})
	})

}

