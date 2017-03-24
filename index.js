module.exports = {
    createMiddleware: function( redisClient, options ){
        return require( './lib/duplicate-check.js' )( redisClient, options );
    }
};