var rimraf = require('rimraf')
  , fork = require('child_process').fork
  , assert = require('assert')
  , express = require('express')
  , readfile = require('fs').readFileSync
  , Server = require('./server')

var forks = process.forks = []
process.server = new Server('http://localhost:55551/')
process.server2 = new Server('http://localhost:55552/')
process.express = express()

process.express.listen(55550)

var debug = process.argv.indexOf('-d') !== -1 || process.argv.indexOf('--debug') !== -1

module.exports.start = function start(dir, conf, cb) {

	// global.console.log(require('path').resolve(__dirname, '../../../', 'bin/sinopia'))

	rimraf(__dirname + '/../' + dir, function() {
		var f = fork(__dirname + '/../../../bin/sinopia'
		          , ['-c', __dirname + '/../' + conf]
		          , {silent: debug ? false : true}
		)
		forks.push(f)
		f.on('message', function(msg) {
			if ('sinopia_started' in msg) {
				cb()
			}
		})
	})
}

process.on('exit', function() {
	if (forks[0]) forks[0].kill()
	if (forks[1]) forks[1].kill()
})

