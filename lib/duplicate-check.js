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
        this.logger = new Logger( path ) ;
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
        var redisKey;
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

        try{
            this.raiseFlag( allowOne, function(){
                this.checkHash( redisKey, hash, allowOne, function( err, bool ){
                    if( !!err ){
                        this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
                        throw new Error( 'Key property needed to store in redis' );
                    }
                    else if( bool ){
                        this.logger.log( 'info', { url: req.href(), request: req.params, message: 'Duplicate request has been detected' } );
                        res.send( 409, { errors: [ 'Duplicate request has been detected' ] } );
                    }
                    else{
                        this.setHash( redisKey, hash, options.ttl, next );
                    }
                }.bind( this ) );
            }.bind( this ) );
        }
        catch( err ){
            this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
            this.redisClient.del( allowOne );
            res.send( 500, { errors: [ 'Internal server error has occurred' ] } );
            return next();
        }
    }.bind( this )
};

DuplicateCheck.prototype.raiseFlag = function( key, cb ){
    this.redisClient.getset( key, true, function( err, previousRes ){
        if( !!err ){
            this.logger.log( 'error', { url: req.href(), request: req.params, message: err } );
            throw new Error( 'Error occurred while trying to set key in redis' );
        }
        else if( previousRes ){
            this.wait( key, cb );
        }
        else{
            cb();
        }
    }.bind( this ) );
};

DuplicateCheck.prototype.checkHash = function( redisKey, hash, allowOne, cb ){
    this.redisClient.get( redisKey, function( err, redisRes ){
        if( !!err ){
            this.redisClient.del( allowOne );
            cb( err, null );
        }
        else if( hash === redisRes ){
            this.redisClient.del( allowOne );
            cb( null, true );
        }
        else{
            this.redisClient.del( allowOne );
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
