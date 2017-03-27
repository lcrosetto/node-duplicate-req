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
        return string;
    }

    function _setHash( req, res, next, redisKey ){
        var string = '';
        if( defaultOptions.prefix ){
            string += defaultOptions.prefix
        }
        string += _buildHash( req );

        redisClient.set( redisKey, md5( string ), function( err ){
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
                var redisKey = eval( defaultOptions.keyValue );
            }
            else{
                res.send( 400, { errors: [ 'Cannot pass undefined or null as the key value' ] } );
            }
            redisClient.select( 1, function(){
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
                            res.send( 409, { errors: [ { message: 'This is a duplicate', body: req, ttl: defaultOptions.ttl / 60 } ] } );
                        }
                        else{
                            return next();
                        }
                    }
                } );
            } );
        }
    }
};