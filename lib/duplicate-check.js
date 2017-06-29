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

DuplicateCheck.prototype.middleware = function( options, cb ){
    var _this = this;
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
        try{
            var allowOneKey;
            var redisKey = '';
            allowOneKey = req.route.method + '-' + req.route.path + '-' + eval( options.keyProperty );
            if( options.prefix ){
                redisKey += options.prefix
            }
            redisKey += eval( options.keyProperty );
            redisKey += '-' + req.route.method + '-' + req.href();
        }
        catch( err ){
            throw err;
        }
        _this.raiseFlag( allowOneKey, function( err ){
            if( !!err ){
                return cb( err, req, res, next, false );
            }
            var hash = _this.buildHash( req, options );
            _this.checkHash( redisKey, hash, allowOneKey, function( error, isDuplicate ){
                if( !!error ){
                    return cb( err, req, res, next, false );
                }
                else if( isDuplicate ){
                    _this.redisClient.del( allowOneKey );
                    return cb( null, req, res, next, true );
                }
                else{
                    _this.setHash( redisKey, hash, options.ttl, function( e ){
                        if( e ){
                            return cb( e, req, res, next, false )
                        }
                        return next();
                    } );
                    _this.redisClient.del( allowOneKey );
                }
            } );
        } );
    }
};

DuplicateCheck.prototype.raiseFlag = function( key, cb ){
    var _this = this;
    return this.redisClient.getset( key, true, function( err, previousRes ){
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
    } );
};

DuplicateCheck.prototype.wait = function( key, cb ){
    var _this = this;
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
        this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
        throw err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( redisKey, hash, ttl, cb ){
    var _this = this;
    if( hash ){
        this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                return cb( err );
            }
            _this.redisClient.expire( redisKey, ttl );
            return cb( null );
        } );
    }
    else{
        return cb( null );
    }
};

module.exports = DuplicateCheck;
