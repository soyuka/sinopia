```
{
  // a list of other known repositories we can talk to
  "uplinks": {
    "npmjs": {
      "url": "https://registry.npmjs.org/"
      // amount of time to wait for repository to respond
      // before giving up and use the local cached copy
      //timeout: 30s

      // maximum time in which data is considered up to date
      //
      // default is 2 minutes, so server won't request the same data from
      // uplink if a similar request was made less than 2 minutes ago
      //maxage: 2m

      // if two subsequent requests fail, no further requests will be sent to
      // this uplink for five minutes
      //max_fails: 2
      //fail_timeout: 5m

      // timeouts are defined in the same way as nginx, see:
      // http://wiki.nginx.org/ConfigNotation
    }
  }, 
  "packages": {
    // uncomment this for packages with "local-" prefix to be available
    // for admin only, it's a recommended way of handling private packages
    /*'local-*': {
      allow_access: admin,
      allow_publish: admin,
      // you can override storage directory for a group of packages this way:
      storage: 'local_storage'
    },*/
    "*": {
      // allow all users to read packages ('all' is a keyword)
      // this includes non-authenticated users
      "allow_access": "all",
      // allow 'admin' to publish packages
      "allow_publish": "admin", 
      // if package is not available locally, proxy requests to 'npmjs' registry
      "proxy": "npmjs"
    }
  }, 
  // path to a directory with all packages
  "storage": "./storage", 
  "logs": [
    {
      "format": "pretty", 
      "type": "stdout", 
      "level": "http"
    }
  ], 
  "users": {
    "admin": {
      // crypto.createHash('sha1').update(pass).digest('hex')
      "password": "hashed password"
    }
  }
}


/**
 * Advanced config
 */
// you can specify listen address (or simply a port)
//listen: localhost:4873,
// specify your application root path (to relative storage)
//self_path: '/home/sinopia',
// Log parameters
// type: file | stdout | stderr
// level: trace | debug | info | http (default) | warn | error | fatal
//
// parameters for file: name is filename
//  {type: 'file', path: 'sinopia.log', level: 'debug'},
//
// parameters for stdout and stderr: format: json | pretty
//  {type: 'stdout', format: 'pretty', level: 'debug'},
/*
logs: [
  {type: stdout, format: pretty, level: http}
  //{type: file, path: sinopia.log, level: info}
  ],
 */

// you can specify proxy used with all requests in wget-like manner here
// (or set up ENV variables with the same name)
//http_proxy: http://something.local/
//https_proxy: https://something.local/
//no_proxy: localhost,127.0.0.1
```