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
var dupCheck = require('node-duplicate-req');

var dupCheckMiddleware = dupCheck.createMiddleware( redisClient, { ttl: 30, keyValue: 'req.user.id' } );
```

Set first argument to redis client, and the second argument is a options object that you can set to a specific "expire" time
and key value you want to use to store in redis; If no keyValue is provided req.authorization.credentials will be used. If no ttl
time is passed, the default ttl time is 60 seconds.

options
---------

| Property | Default | Description |
|----------|---------|-------------|
| ttl      | 60      | How long you want it to live in the redis database |
| keyValue | req.authorization.credentials | The key to save in the redis database |