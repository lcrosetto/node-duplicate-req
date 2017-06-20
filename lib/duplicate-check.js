var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );
var Logger = require( './logger' );
var fs = require( 'fs' );
var _this = this;

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
    var path = options.logPath;
    if( !_.isEmpty( path ) && fs.existsSync( path ) ){
        this.logger = new Logger( path );
    }
    else{
        throw new Error( 'Log path does not exist' );
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
        var allowOneKey;
        var redisKey = '';
        var hash;
        try{
            hash = _this.buildHash( req, options );
            allowOneKey = req.route.method + '-' + req.route.path + '-' + eval( options.keyProperty );
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
        _this.raiseFlag( allowOneKey, function( err ){
            if( !!err ){
                return _this.handleError( req, next, allowOneKey, err );
            }
            _this.checkHash( redisKey, hash, allowOneKey, function( error, isDuplicate ){
                if( !!error ){
                    return _this.handleError( req, next, allowOneKey, error );
                }
                else if( isDuplicate ){
                    _this.redisClient.del( allowOneKey );
                    _this.logger.log( 'info', { url: req.href(), request: req.params, message: 'Duplicate request detected' } );
                    return res.send( 409, { errors: [ 'Duplicate request detected' ] } );
                }
                else{
                    _this.setHash( redisKey, hash, options.ttl, next );
                    _this.redisClient.del( allowOneKey );
                }
            } );
        } );
    }
};

DuplicateCheck.prototype.handleError = function( req, next, allowOneKey, err ){
    this.redisClient.del( allowOneKey );
    this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
    return next();
}

DuplicateCheck.prototype.raiseFlag = function( key, cb ){
    return _this.redisClient.getset( key, true, function( err, previousRes ){
        if( !!err ){
            cb( err );
        }
        else if( previousRes ){
            _this.wait( key, cb );
        }
        else{
            cb( null );
        }
    } );
};

DuplicateCheck.prototype.checkHash = function( redisKey, hash, allowOneKey, cb ){
    _this.redisClient.get( redisKey, function( err, redisRes ){
        if( !!err ){
            cb( err, null );
        }
        else if( hash === redisRes ){
            cb( null, true );
        }
        else{
            cb( null, false );
        }
    } );
};

DuplicateCheck.prototype.wait = function( key, cb ){
    process.nextTick( function(){
        _this.raiseFlag( key, cb );
    } );
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
        _this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
        throw err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( redisKey, hash, ttl, next ){
    if( hash ){
        _this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                throw new Error( 'Could not set hash to redis database' )
            }
            _this.redisClient.expire( redisKey, ttl );
            return next();
        } );
    }
    else{
        return next();
    }
};

module.exports = DuplicateCheck;
