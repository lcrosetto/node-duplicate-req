var md5 = require( 'md5' );

module.exports = function( redisClient, options ){
    var defualtOptions = {
        ttl: options.ttl || 60,
        keyValue: options.keyValue || 'req.authorization.credentials'
    };
    function _buildHash( req ){
        console.log( req.params );
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
        return string;
    }

    function _setHash( req, res, next, redisKey ){
        var string = _buildHash( req );

        redisClient.set( redisKey, md5( string ), function( err ){
            if( !!err ){
                res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            }

            redisClient.expire( redisKey, defualtOptions.ttl );
            return next();
        } );
    }

    return {
        findHash: function( req, res, next ){
            if( eval( defualtOptions.keyValue ) ){
                var redisKey = eval( defualtOptions.keyValue );
            }
            else{
                res.send( 400, { errors: [ 'Cannot pass undefined or null as the key value' ] } );
            }
            console.log( 'this is the redis key', redisKey );
            redisClient.get( redisKey, function( err, redisRes ){
                if( !!err ){
                    res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                }
                else if( !redisRes ){
                    _setHash( req, res, next, redisKey );
                }
                else{
                    var string = _buildHash( req );
                    if( md5( string ) === redisRes ){
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