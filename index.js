var DuplicateCheck = require( './lib/duplicate-check.js' );
module.exports = function( redisClient ){
    return new DuplicateCheck( redisClient );
};