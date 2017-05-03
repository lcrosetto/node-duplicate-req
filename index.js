var DuplicateCheck = require( './lib/duplicate-check.js' );
module.exports = function( redisClient, options ){
    return new DuplicateCheck( redisClient, options );
};