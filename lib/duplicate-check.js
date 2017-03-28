var md5 = require( 'md5' );

module.exports = function( redisClient, options ){
    if( !options ){
        options = {};
    }
    var defaultOptions = {
        ttl: options.ttl || 60,
        keyValue: options.keyValue || 'req.authorization.credentials',
        prefix: options.prefix || ''
    };
    function _buildHash( req ){
        var request;
        var string;

        if( req.params.body === Object && Object.keys( req.params.body ).length > 0 ){
            request = req.params.body;
        }
        else{
            request = req.params;
        }

        try{
            string = JSON.stringify( request );
        }
        catch( err ){
            return err;
        }
        return md5( string );
    }

    function _setHash( req, res, next, redisKey ){
        redisClient.set( redisKey, _buildHash( req ), function( err ){
            if( !!err ){
                res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            }
            redisClient.expire( redisKey, defaultOptions.ttl );
            return next();
        } );
    }

    return {
        findHash: function( req, res, next ){
            if( eval( defaultOptions.keyValue ) ){
                var redisKey = '';
                if( defaultOptions.prefix ){
                    redisKey += defaultOptions.prefix
                }
                redisKey += eval( defaultOptions.keyValue );
            }
            else{
                res.send( 400, { errors: [ 'Cannot pass undefined or null as the key value' ] } );
            }
            redisClient.get( redisKey, function( err, redisRes ){
                if( !!err ){
                    res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                }
                else if( !redisRes ){
                    _setHash( req, res, next, redisKey );
                }
                else{
                    if( _buildHash( req ) === redisRes ){
                        res.send( 409, { errors: [ 'This is a duplicate' ] } );
                    }
                    else{
                        return next();
                    }
                }
            } );
        }
    }
};