var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );
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
    this.options.infoLogFunc = options.infoLogFunc || false;
    this.options.errorLogFunc = options.errorLogFunc || false;
    this.options.ovrLogFunc = options.ovrLogFunc || false;
    this.options.customDupMsg = options.customDupMsg || 'Duplicate request detected';
    this.options.customErrMsg = options.customErrMsg || 'Internal server error has occurred';
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
        if( req.headers.hasOwnProperty( 'X-Override-DupCheck' ) ){
            if( !_.isEmpty( _this.options.ovrLogFunc ) ){
                _this.options.ovrLogFunc( req );
            }
            return next();
        }
        else{
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
                if( !_.isEmpty( _this.options.errorLogFunc ) ){
                    _this.options.errorLogFunc( err );
                }
                return res.send( 500, { errors: [ _this.options.customErrMsg ] } );
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
                        if( !_.isEmpty( _this.options.infoLogFunc ) ){
                            _this.options.infoLogFunc( req );
                        }
                        return res.send( 409, { errors: [ _this.options.customDupMsg ] } );
                    }
                    else{
                        _this.setHash( redisKey, hash, options.ttl, next );
                        _this.redisClient.del( allowOneKey );
                    }
                } );
            } );
        }
    }
};

DuplicateCheck.prototype.handleError = function( req, next, allowOneKey, err ){
    this.redisClient.del( allowOneKey );
    if( !_.isEmpty( _this.options.errorLogFunc ) ){
        _this.options.errorLogFunc( err, req );
    }
    return next();
};

DuplicateCheck.prototype.raiseFlag = function( key, cb ){
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
        if( !_.isEmpty( _this.options.errorLogFunc ) ){
            _this.options.errorLogFunc( err, req );
        }
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( redisKey, hash, ttl, next ){
    if( hash ){
        this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                if( !_.isEmpty( _this.options.errorLogFunc ) ){
                    _this.options.errorLogFunc( err, null );
                }
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
