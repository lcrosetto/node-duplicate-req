var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );
var Logger = require( './logger' );
var fs = require( 'fs' );

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
    var path = options.logPath || __dirname + '/../../../tmp';
    if( fs.existsSync( path ) ){
        this.logger = new Logger( path );
    }
    else{
        throw new Error( 'Log path passed in to node-duplicate-req module does not exist either build a tmp folder on top level of api or pass in correct path' );
    }
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
        var allowOne;
        var redisKey = '';
        var hash;
        try{
            hash = this.buildHash( req, options );
            allowOne = req.route.method + '-' + req.route.path + '-' + eval( options.keyProperty );
            if( options.prefix ){
                redisKey += options.prefix
            }
            redisKey += eval( options.keyProperty );
            redisKey += '-' + req.route.method + '-' + req.href();
        }
        catch( err ){
            res.send( 500, { errors: [ 'Internal server error has occurred' ] } );
            throw new Error( 'Key property needed to store in redis' );
        }
        this.raiseFlag( allowOne, function( err ){
            if( !!err ){
                return this.handleError( req, next, allowOne, err );
            }
            this.checkHash( redisKey, hash, allowOne, function( error, bool ){
                if( !!error ){
                    return this.handleError( req, next, allowOne, error );
                }
                else if( bool ){
                    this.redisClient.del( allowOne );
                    this.logger.log( 'info', { url: req.href(), request: req.params, message: 'Duplicate request has been detected' } );
                    return res.send( 409, { errors: [ 'Duplicate request has been detected' ] } );
                }
                else{
                    this.setHash( redisKey, hash, options.ttl, next );
                    this.redisClient.del( allowOne );
                }
            }.bind( this ) );
        }.bind( this ) );
    }.bind( this )
};

DuplicateCheck.prototype.handleError = function( req, next, allowOne, err ){
    this.redisClient.del( allowOne );
    this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
    return next();
}

DuplicateCheck.prototype.raiseFlag = function( key, cb ){
    return this.redisClient.getset( key, true, function( err, previousRes ){
        if( !!err ){
            cb( err );
        }
        else if( previousRes ){
            this.wait( key, cb );
        }
        else{
            cb( null );
        }
    }.bind( this ) );
};

DuplicateCheck.prototype.checkHash = function( redisKey, hash, allowOne, cb ){
    this.redisClient.get( redisKey, function( err, redisRes ){
        if( !!err ){
            cb( err, null );
        }
        else if( hash === redisRes ){
            cb( null, true );
        }
        else{
            cb( null, false );
        }
    }.bind( this ) );
};

DuplicateCheck.prototype.wait = function( key, cb ){
    process.nextTick( function(){
        this.raiseFlag( key, cb );
    }.bind( this ) );
};

DuplicateCheck.prototype.buildHash = function( req, options ){
    var request;
    var string;

    if( !_.isEmpty( req.body ) ){
        request = _.cloneDeep( req.body );
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
        this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
        throw err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( redisKey, hash, ttl, next ){
    if( hash ){
        this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                throw new Error( 'Could not set hash to redis database' )
            }
            this.redisClient.expire( redisKey, ttl );
            return next();
        }.bind( this ) );
    }
    else{
        return next();
    }
};

module.exports = DuplicateCheck;
