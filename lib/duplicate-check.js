var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );

function DuplicateCheck( redisClient, options ){
    if( !options ){
        options = {}
    }
    this.redisClient = redisClient;
    this.options = {};
    this.options.ttl = options.ttl || 60;
    this.options.keyProperty = options.keyProperty || 'req.authorization.credentials';
    this.options.prefix = options.prefix || '';
    this.options.ignoreEmptyBody = options.ignoreEmptyBody || true;
    this.options.ignoreProperties = options.ignoreProperties || [];
}

DuplicateCheck.prototype.middleware = function( options ){
    if( !options ){
        options = this.options;
    }
    else{
        options = {
            ttl: options.ttl || this.options.ttl,
            keyProperty: options.keyProperty || this.options.keyProperty,
            prefix: options.prefix || this.options.prefix,
            ignoreEmptyBody: options.ignoreEmptyBody || this.options.ignoreEmptyBody,
            ignoreProperties: options.ignoreProperties || this.options.ignoreProperties
        }
    }

    return function( req, res, next ){
        if( !eval( options.keyProperty ) || ( typeof eval( options.keyProperty ) === 'object' ) ){
            res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            throw new Error( 'Key property needed to store in redis' )
        }
        try{
            var redisKey = '';
            if( options.prefix ){
                redisKey += options.prefix
            }
            redisKey += eval( options.keyProperty );
            redisKey += '-' + req.route.method + '-' + req.route.path;
        }
        catch( err ){
            res.send( 500, { errors: [ 'Invalid options.keyProperty' ] } );
            throw new Error( 'Key property needed to store in redis' );
        }
        this.redisClient.get( redisKey, function( err, redisRes ){
            if( !!err ){
                res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                throw err;
            }
            else{
                if( this.buildHash( req, options ) === redisRes ){
                    return res.send( 409, { errors: [ 'Duplicate request body detected' ] } );
                }
                else{
                    this.setHash( req, res, next, redisKey, options );
                }
            }
        }.bind( this ) );
    }.bind( this )
};

DuplicateCheck.prototype.buildHash = function( req, options ){
    var request;
    var string;

    if( !_.isEmpty( req.params.body ) ){
        request = _.cloneDeep( req.params.body );
    }
    else{
        request = {};
    }

    if( options.ignoreProperties.length > 0 ){
        options.ignoreProperties.forEach( function( item ){
            eval( 'delete request.' + item );
        } );
    }

    if( _.isEmpty( request ) && options.ignoreEmptyBody ){
        return '';
    }

    try{
        string = JSON.stringify( request );
    }
    catch( err ){
        return err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( req, res, next, redisKey, options ){
    var hash = this.buildHash( req, options );

    if( !!hash ){
        this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                throw new Error( 'Could not set hash to redis database' )
            }
            this.redisClient.expire( redisKey, options.ttl );
            return next();
        }.bind( this ) );
    }
    else{
        return next();
    }
};

module.exports = DuplicateCheck;