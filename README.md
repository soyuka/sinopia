It's a fork with some adjustments to use it as an express sub router, all the credits to https://github.com/rlidwka/sinopia/


Sinopia is a private/caching npm repository server.

It allows you to have a local npm registry with zero configuration. You don't have to install and replicate an entire CouchDB database. Sinopia keeps its own small database and, if a package doesn't exist there, it asks npmjs.org for it keeping only those packages you use.

<p align="center"><img src="https://f.cloud.github.com/assets/999113/1795553/680177b2-6a1d-11e3-82e1-02193aa4e32e.png"></p>

## Use cases

1. Use private packages.

   If you want to use all benefits of npm package system in your company without sending all code to the public, and use your private packages just as easy as public ones.

   See [using private packages](#using-private-packages) section for details.

2. Cache npmjs.org registry.

   If you have more than one server you want to install packages on, you might want to use this to decrease latency
   (presumably "slow" npmjs.org will be connected to only once per package/version) and provide limited failover (if npmjs.org is down, we might still find something useful in the cache).

   See [using public packages](#using-public-packages-from-npmjsorg) section for details.

3. Override public packages.

   If you want to use a modified version of some 3rd-party package (for example, you found a bug, but maintainer didn't accepted pull request yet), you can publish your version locally under the same name.

   See [override public packages](#override-public-packages) section for details.

## Installation

```bash
# installation and starting (application will create default
# config in config.yaml you can edit later)
$ npm install -g sinopia
$ sinopia

# npm configuration
$ npm set registry http://localhost:4873/

# if you have any restricted packages, you should add this:
$ npm set always-auth true

# if you use HTTPS, add an appropriate CA information
# ("null" means get CA list from OS)
$ npm set ca null
```

### Docker

A Sinopia docker image [is available](https://index.docker.io/u/keyvanfatehi/docker-sinopia/)

### Chef

A Sinopia Chef cookbook [is available at Opscode community](http://community.opscode.com/cookbooks/sinopia) source: https://github.com/BarthV/sinopia-cookbook

### Puppet

A Sinopia puppet module [is available at puppet forge](http://forge.puppetlabs.com/saheba/sinopia) source: https://github.com/saheba/puppet-sinopia

## Configuration

When you start a server, it auto-creates a config file that adds one user (password is printed to stdout only once).

## Adding a new user

There is no utility to add a new user but you can at least use node on the command-line to generate a password. You will need to edit the config and add the user manually.

Start node and enter the following code replacing 'newpass' with the password you want to get the hash for.
```bash
$ node
> crypto.createHash('sha1').update('newpass').digest('hex')
'6c55803d6f1d7a177a0db3eb4b343b0d50f9c111'
> [CTRL-D]
```


## Using private packages

You can add users and manage which users can access which packages.

It is recommended that you define a prefix for your private packages, for example "local", so all your private things will look like this: `local-foo`. This way you can clearly separate public packages from private ones.

## Using public packages from npmjs.org

If some package doesn't exist in the storage, server will try to fetch it from npmjs.org. If npmjs.org is down, it serves packages from cache pretending that no other packages exist. Sinopia will download only what's needed (= requested by clients), and this information will be cached, so if client will ask the same thing second time, it can be served without asking npmjs.org for it.

Example: if you successfully request express@3.0.1 from this server once, you'll able to do that again (with all it's dependencies) anytime even if npmjs.org is down. But say express@3.0.0 will not be downloaded until it's actually needed by somebody. And if npmjs.org is offline, this server would say that only express@3.0.1 (= only what's in the cache) is published, but nothing else.

## Override public packages

If you want to use a modified version of some public package `foo`, you can just publish it to your local server, so when your type `npm install foo`, it'll consider installing your version.

There's two options here:

1. You want to create a separate fork and stop synchronizing with public version.

   If you want to do that, you should modify your configuration file so sinopia won't make requests regarding this package to npmjs anymore. Add a separate entry for this package to *config.yaml* and remove `npmjs` from `proxy_access` list and restart the server.

   When you publish your package locally, you should probably start with version string higher than existing one, so it won't conflict with existing package in the cache.

2. You want to temporarily use your version, but return to public one as soon as it's updated.

   In order to avoid version conflicts, you should use a custom pre-release suffix of the next patch version. For example, if a public package has version 0.1.2, you can upload 0.1.3-my-temp-fix. This way your package will be used until its original maintainer updates his public package to 0.1.3.

## Compatibility

Sinopia aims to support all features of a standard npm client that make sense to support in private repository. Unfortunately, it isn't always possible.

Basic features:

- Installing packages (npm install, npm upgrade, etc.) - supported
- Publishing packages (npm publish) - supported

Advanced package control:

- Unpublishing packages (npm unpublish) - not yet supported, should be soon
- Tagging (npm tag) - not yet supported, should be soon
- Deprecation (npm deprecate) - not supported

User management:

- Registering new users (npm adduser {newuser}) - not supported, sinopia uses its own acl management system
- Transferring ownership (npm owner add {user} {pkg}) - not supported, sinopia uses its own acl management system

Misc stuff:

- Searching (npm search) - not supported
- Starring (npm star, npm unstar) - not supported, doesn't make sense in private registry

## Storage

No CouchDB here. This application is supposed to work with zero configuration, so filesystem is used as a storage.

If you want to use a database instead, ask for it, we'll come up with some kind of a plugin system.

## Similar existing things

- npm + git (I mean, using git+ssh:// dependencies) - most people seem to use this, but it's a terrible idea... *npm update* doesn't work, can't use git subdirectories this way, etc.
- [reggie](https://github.com/mbrevoort/node-reggie) - this looks very interesting indeed... I might borrow some code there.
- [shadow-npm](https://github.com/dominictarr/shadow-npm), [public service](http://shadow-npm.net/) - it uses the same code as npmjs.org + service is dead
- [gemfury](http://www.gemfury.com/l/npm-registry) and others - those are closed-source cloud services, and I'm not in a mood to trust my private code to somebody (security through obscurity yeah!)
- npm-registry-proxy, npm-delegate, npm-proxy - those are just proxies...
- Is there something else?

