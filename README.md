Node Duplicate Req
==================

A lightweight api side duplicate check

Installation
--------------

```npm install node-duplicate-req --save```

Requirements
--------------

In order for it to work it must be placed after request body parser.
Redis must be installed

Usage
-----
Basic example
```javascript
var redis = require('redis');
var redisClient = redis.createClient();
var options = {
    prefix: 'dupCheck-',
    keyValue: 'req.user.id',
    ttl: 30
}
var dupCheck = require('node-duplicate-req')(redisClient, options);
var dupCheckMiddleware = dupCheck.middleware(function( err, req, res, next){
     if(err){
         logger.error(err);
     }
     else{
         res.send( 409, { errors: [ 'Duplicate request detected' ] } );
         logger.info( 'duplicate', 'Duplicate request detected');
     }
} );
var users = require('../controllers/users');
server.post('/users', dupCheckMiddleware, users.create);
```
**NOTE:** Above example you can pass in an options object at instantiation for shared options between all middleware.
You can also pass in an options object when building the middleware for options specific to that endpoint (below).
```javascript
var redis = require('redis');
var redisClient = redis.createClient();
var options = {
    keyValue: 'req.user.id',
    ttl: 30
}
var dupCheck = require('node-duplicate-req')(redisClient, options);
var dupCheckMiddleware = dupCheck.middleware({ prefix: 'userDupCheck-', ignoreProperties: [ 'user.age', 'user.notes'] },function( err, req, res, next, duplicate){
     if(err){
         logger.error(err);
     }
     else{
         res.send( 409, { errors: [ 'Duplicate request detected' ] } );
         logger.info( 'duplicate', 'Duplicate request detected');
     }
} );
var users = require('../controllers/users');
server.post('/users', dupCheckMiddleware, users.create);
```
**NOTE:** if no options are passed defaults will be used. Also callback will only be called if there is an error or a duplicate was found
```javascript
var dupCheck = require('node-duplicate-req')(redisClient);
var dupCheckMiddleware = dupCheck.middleware(function( err, req, res, next){
    if(err){
      logger.error(err);
    }
    else{
      res.send( 409, { errors: [ 'Duplicate request detected' ] } );
      logger.info( 'duplicate', 'Duplicate request detected');
    }
});
```
Don't want to deny requests that are duplicate? Not sure why, but go ahead:
```javascript
var dupCheck = require('node-duplicate-req')(redisClient);
var dupCheckMiddleware = dupCheck.middleware(function( err, req, res, next){
    if(err){
      logger.error(err);
    }
    else{
      res.send( 409, { errors: [ 'Duplicate request detected' ] } );
      logger.info( 'duplicate', 'Duplicate request detected');
      return next();
    }
});
```
options
---------

| Property | DataType | Default | Description |
|----------|----------|---------|-------------|
| ttl      | Number   | 60 | How many seconds you want it to live in the redis database |
| keyValue | String   | req.authorization.credentials + method and route| The key to save in the redis database |
| prefix   | String   | '' | prefix to be included with each redis entry |
| ignoreEmptyBody | Boolean | true | When set to true it does not save empty object in redis database |
| ignoreProperties | Array | [] | Properties you want ignored from req object, default empty array. Give absolute path to property |
