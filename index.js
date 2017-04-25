var DuplicateCheck = require( './lib/duplicate-check.js' );
module.exports = {
    createMiddleware: function( redisClient, options ){
        return new DuplicateCheck( redisClient, options );
    }
};