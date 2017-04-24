var md5 = require( 'md5' );

module.exports = function( redisClient, options ){
    if( !options ){
        options = {};
    }
    var defaultOptions = {
        ttl: options.ttl || 60,
        keyProperty: options.keyProperty || 'req.authorization.credentials',
        prefix: options.prefix || '',
        ignoreEmptyBody: options.ignoreEmptyBody || true
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

        if( Object.keys( request ).length === 0 && defaultOptions.ignoreEmptyBody ){
            return '';
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
        var hash = _buildHash( req );

        if( !!hash ){
            redisClient.set( redisKey, hash, function( err ){
                if( !!err ){
                    res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                }
                redisClient.expire( redisKey, defaultOptions.ttl );
                return next();
            } );
        }
        else{
            return next();
        }
    }

    function findHash( req, res, next ){
        try{
            var redisKey = '';
            if( defaultOptions.prefix ){
                redisKey += defaultOptions.prefix
            }
            redisKey += eval( defaultOptions.keyProperty );
            redisKey += '-' + req.route.method + '-' + req.route.path;
        }
        catch( err ){
            res.send( 400, { errors: [ 'Invalid options.keyProperty' ] } );
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
                    res.send( 409, { errors: [ 'Duplicate request body detected' ] } );
                }
                else{
                    return next();
                }
            }
        } );
    }

    return findHash;
};