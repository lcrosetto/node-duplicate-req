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

```javascript
var dupCheck = require('node-duplicate-req')( redisClient ) ;

var dupCheckMiddleware = dupCheck.middleware( { ttl: 30, keyValue: 'req.user.id', ignoreProperties[ 'user.age', 'user.notes' } );

server.post( '/users', dupCheckMiddleware );
```
first create an instance of node-duplicate-req by passing in redisClient, then create the middleware using options object, if
you just want the defaults pass in empty object. Defaults are at the bottom of the readme

```javascript
var dupCheckMiddleware = dupCheck.middleware( {} );
```

options
---------

| Property | DataType | Default | Description |
|----------|----------|---------|-------------|
| ttl      | Number | 60 | How long you want it to live in the redis database |
| keyValue | String | req.authorization.credentials | The key to save in the redis database |
| prefix   | String | ''      | prefix to be included with each redis entry |
| ignoreEmptyBody | Boolean | true | When set to true it does not save empty object in redis database |
| ignoreProperties | Array | [] | Properties you want ignored from req object, default empty array. Give absolute path to property |