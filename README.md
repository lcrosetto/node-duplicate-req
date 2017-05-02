Node Duplicate Req
==================

A lightweight api side duplicate check

Installation
--------------

```npm install node-duplicate-req```

Requirements
--------------

In order for it to work it must be placed after request body parser.

Usage
-----
First require package and instantiate it with redisClient
```javascript
var dupCheck = require('node-duplicate-req')( redisClient );
```
You can also pass in an options object at instantiation for shared options between all middleware
NOTE: if no options are passed defaults will be used.
```javascript
var dupCheck = require('node-duplicate-req')( redisClient, { keyProperty: req.user.id, ttl: 30 } );
```
Then create the middleware you want to use, here you can also pass in an options object that will only be used for this specific endpoint.
```javascript
var userDupCheckMiddleware = dupCheck.middleware( { ignoreProperties[ 'user.age', 'user.notes' } );
server.post( '/users', dupCheckMiddleware );
```
Or create middleware without option, Defaults are at the bottom of the readme
```javascript
var dupCheckMiddleware = dupCheck.middleware( {} );
```

options
---------

| Property | DataType | Default | Description |
|----------|----------|---------|-------------|
| ttl      | Number | 60 | How long you want it to live in the redis database |
| keyValue | String | req.authorization.credentials + method and route| The key to save in the redis database |
| prefix   | String | '' | prefix to be included with each redis entry |
| ignoreEmptyBody | Boolean | true | When set to true it does not save empty object in redis database |
| ignoreProperties | Array | [] | Properties you want ignored from req object, default empty array. Give absolute path to property |