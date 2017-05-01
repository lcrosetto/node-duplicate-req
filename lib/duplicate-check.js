var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );

function DuplicateCheck( redisClient, options ){
    if( !options ){
        options = {};
    }

    this.ttl = options.ttl || 60;
    this.keyProperty = options.keyProperty || 'req.authorization.credentials';
    this.prefix = options.prefix || '';
    this.ignoreEmptyBody = options.ignoreEmptyBody || true;
    this.ignoreProperties = options.ignoreProperties || [];

    this.findHash = function( req, res, next ){
        try{
            var redisKey = '';
            if( this.prefix ){
                redisKey += this.prefix
            }
            redisKey += eval( this.keyProperty );
            redisKey += '-' + req.route.method + '-' + req.route.path;
        }
        catch( err ){
            return res.send( 400, { errors: [ 'Invalid options.keyProperty' ] } );
        }
        redisClient.get( redisKey, function( err, redisRes ){
            if( !!err ){
                return res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            }
            else{
                if( this.buildHash( req ) === redisRes ){
                    return res.send( 409, { errors: [ 'Duplicate request body detected' ] } );
                }
                else{
                    this.setHash( req, res, next, redisKey, redisClient );
                    return next();
                }
            }
        }.bind( this ) );

    }.bind( this )
}

DuplicateCheck.prototype.buildHash = function( req ){
    var request;
    var string;

    if( _.isEmpty( req.params ) ){
        request = req.params.body;
    }
    else{
        request = req.params;
    }

    if( _.isEmpty( request ) && this.ignoreEmptyBody ){
        return '';
    }

    if( this.ignoredProperties.length > 0 ){
        var filteredKeys = Object.keys( request ).filter( function( key ){
            return typeof request[ key ] === 'object';
        } );
        this.ignoredProperties.forEach( function( prop ){
            delete request[ prop ];
            // Deep check
            if( filteredKeys.length > 0 ){
                filteredKeys.forEach( function( key ){
                    delete request[ key ][ prop ];
                } );
            }
        } );
    }

    try{
        string = JSON.stringify( request );
    }
    catch( err ){
        return err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( req, res, next, redisKey, redisClient ){
    var hash = this.buildHash( req );

    if( !!hash ){
        redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                return res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            }
            redisClient.expire( redisKey, this.ttl );
            return next();
        }.bind( this ) );
    }
    else{
        return next();
    }
};

module.exports = DuplicateCheck;