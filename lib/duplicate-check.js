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
    this.options.infoLogFunc = options.infoLogFunc || function(){
    };
    this.options.errorLogFunc = options.errorLogFunc || function(){
    };
    this.options.ovrLogFunc = options.ovrLogFunc || function(){
    };
    this.options.dupMsg = options.dupMsg || 'Duplicate request detected';
    this.options.errMsg = options.errMsg || 'Internal server error has occurred';
}

DuplicateCheck.prototype.middleware = function( options ){
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
            ignoreProperties: options.ignoreProperties || this.options.ignoreProperties,
            infoLogFunc: options.infoLogFunc || function(){
            },
            errorLogFunc: options.errorLogFunc || function(){
            },
            ovrLogFunc: options.ovrLogFunc || function(){
            },
            dupMsg: options.dupMsg || 'Duplicate request detected',
            errMsg: options.errMsg || 'Internal server error has occurred'
        }
    }

    return function( req, res, next ){
        if( req.headers.hasOwnProperty( 'x-override-dupcheck' ) ){
            options.ovrLogFunc( req );
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
                options.errorLogFunc( err );
                return res.status( 500 ).send( { errors: [ options.errMsg ] } );
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
                        options.infoLogFunc( req );
                        return res.status( 409 ).send( { errors: [ options.dupMsg ] } );
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
    this.options.errorLogFunc( err, req );
    return next();
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
    var _this = this;
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
        options.errorLogFunc( err, req );
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( redisKey, hash, ttl, next ){
    var _this = this;
    if( hash ){
        this.redisClient.set( redisKey, hash, function( err ){
            if( !!err ){
                _this.options.errorLogFunc( err );
                return next();
            }
            else{
                _this.redisClient.expire( redisKey, ttl );
                return next();
            }
        } );
    }
    else{
        return next();
    }
};

module.exports = DuplicateCheck;
