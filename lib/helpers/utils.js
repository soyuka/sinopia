/**
 * https://github.com/rlidwka/sinopia
 */

var assert = require('assert')
  , semver = require('semver')
  , logger = require('../core/logger')
  , URL = require('url')

// from normalize-package-data/lib/fixer.js
module.exports.validate_name = function(name) {
	if (typeof(name) !== 'string') return false
	name = name.toLowerCase()
	if (
		name.charAt(0) === '.' || // ".bin", etc.
		name.charAt(0) === '-' || // "-" is reserved by couchdb
		name.match(/[\/@\s\+%:]/) ||
		name !== encodeURIComponent(name) ||
		name === 'node_modules' ||
		name === '__proto__' ||
		name === 'package.json' ||
		name === 'favicon.ico'
	) {
		return false
	} else {
		return true
	}
}

module.exports.is_object = function(obj) {
	return typeof(obj) === 'object' && obj !== null && !Array.isArray(obj)
}

module.exports.validate_metadata = function(object, name) {
	assert(module.exports.is_object(object), 'not a json object')
	assert.equal(object.name, name)

	if (!module.exports.is_object(object['dist-tags'])) {
		object['dist-tags'] = {}
	}

	if (!module.exports.is_object(object['versions'])) {
		object['versions'] = {}
	}

	return object
}

module.exports.parse_tarball_url = function(_url) {
	var url = URL.parse(_url)

	var path = url.path.replace(/^\//, '').split('/')
	if (path.length >= 3 && path[path.length-2] === '-') {
		var filename = path.pop()
		  , pkgpath = '/' + filename // tarball name
		pkgpath = '/' + path.pop() + pkgpath // "-"
		pkgpath = '/' + path.pop() + pkgpath // package.name
	} else {
		return null
	}

	return {
		protocol: url.protocol,
		host: url.host,
		prepath: '/' + path.join('/'),
		pkgpath: pkgpath,
		filename: filename,
	}
}

module.exports.filter_tarball_urls = function(pkg, req, config) {
	function filter(_url) {
		if (!req.headers.host) return _url

		var url = module.exports.parse_tarball_url(_url)
		// weird url, just return it
		if (url == null) return _url

		if (config.url_prefix != null) {
			var result = config.url_prefix.replace(/\/$/, '')
		} else {
			var result = req.protocol + '://' + req.headers.host
		}

		return result + url.pkgpath
	}

	for (var ver in pkg.versions) {
		var dist = pkg.versions[ver].dist
		if (dist != null && dist.tarball != null) {
			dist.__sinopia_orig_tarball = dist.tarball
			dist.tarball = filter(dist.tarball)
		}
	}
	return pkg
}

module.exports.tag_version = function(data, version, tag) {
	if (tag === 'latest') return
	switch(typeof(data['dist-tags'][tag])) {
		case 'string':
			data['dist-tags'][tag] = [data['dist-tags'][tag]]
			break
		case 'object': // array
			break
		default:
			data['dist-tags'][tag] = []
	}
	if (data['dist-tags'][tag].indexOf(version) === -1) {
		data['dist-tags'][tag].push(version)
		data['dist-tags'][tag] = module.exports.semver_sort(data['dist-tags'][tag])
	}
}

// gets version from a package object taking into account semver weirdness
module.exports.get_version = function(object, version) {
	if (object.versions[version] != null) return object.versions[version]

	try {
		version = semver.parse(version, true)
		for (var k in object.versions) {
			if (version.compare(semver.parse(k, true)) === 0) {
				return object.versions[k]
			}
		}
	} catch(err) {
		return undefined
	}
}

var parse_interval_table = {
	'': 1000,
	ms: 1,
	s: 1000,
	m: 60*1000,
	h: 60*60*1000,
	d: 86400000,
	w: 7*86400000,
	M: 30*86400000,
	y: 365*86400000,
}

module.exports.parse_interval = function(interval) {
	if (typeof(interval) === 'number') return interval * 1000

	var result = 0
	var last_suffix = Infinity
	interval.split(/\s+/).forEach(function(x) {
		if (!x) return
		var m = x.match(/^((0|[1-9][0-9]*)(\.[0-9]+)?)(ms|s|m|h|d|w|M|y|)$/)
		if (!m
		||  parse_interval_table[m[4]] >= last_suffix
		||  (m[4] === '' && last_suffix !== Infinity)) {
			throw new Error('invalid interval: ' + interval)
		}
		last_suffix = parse_interval_table[m[4]]
		result += Number(m[1]) * parse_interval_table[m[4]]
	})
	return result
}

// function filters out bad semver versions and sorts the array
module.exports.semver_sort = function semver_sort(array) {
	return array
	      .filter(function(x) {
			if (!semver.parse(x, true)) {
				logger.warn({ver: x}, 'ignoring bad version :', x)
				return false
			}
			return true
	      })
	      .sort(semver.compareLoose)
	      .map(String)
}

