var md5 = require( 'md5' );
var _ = require( 'lodash' );
_.mixin( require( 'lodash-deep' ) );
var Logger = require( './logger' );

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
    if( options.logPath ){
        this.logger = new Logger( options.logPath );
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
    this.global = [];

    return function( req, res, next ){
        var tmpObj = {};
        tmpObj[ 'ttl' ] = options.ttl;
        tmpObj[ 'hash' ] = this.buildHash( req, options );
        tmpObj[ 'reqId' ] = req.id;
        tmpObj[ 'res' ] = res;
        tmpObj[ 'next' ] = next;
        if( !eval( options.keyProperty ) || ( typeof eval( options.keyProperty ) === 'object' ) ){
            res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
            throw new Error( 'Key property needed to store in redis' )
        }

        try{
            tmpObj[ 'allowOne' ] = req.route.method + '-' + req.route.path;
            tmpObj[ 'redisKey' ] = '';
            if( options.prefix ){
                tmpObj[ 'redisKey' ] += options.prefix
            }
            tmpObj[ 'redisKey' ] += eval( options.keyProperty );
            tmpObj[ 'redisKey' ] += '-' + req.route.method + '-' + req.href();
        }
        catch( err ){
            res.send( 500, { errors: [ 'Invalid options.keyProperty' ] } );
            throw new Error( 'Key property needed to store in redis' );
        }

        this.raiseFlag( tmpObj );
    }.bind( this )
};

DuplicateCheck.prototype.raiseFlag = function( tmpObj ){
    this.redisClient.getset( tmpObj.allowOne, true, function( err, previousRes ){
        if( !!err ){
            this.successCallback( err, tmpObj, null );
        }
        else {
            this.successCallback( null, tmpObj, previousRes );
        }
    }.bind( this ) );
};

DuplicateCheck.prototype.successCallback = function( err, tmpObj, response ){
    if( !!err ){
        tmpObj.res.send( 500, { errors: [ 'Invalid options.keyProperty' ] } );
        throw new Error( 'Key property needed to store in redis' );
    }
    else if( response ){
        this.global.push( tmpObj );
    }
    else{
        return this.checkHash( tmpObj );
    }
};

DuplicateCheck.prototype.checkHash = function( tmpObj ){
    this.redisClient.get( tmpObj.redisKey, function( err, redisRes ){
        if( !!err ){
            tmpObj.res.send( 500, { errors: [ 'Invalid options.keyProperty' ] } );
            this.redisClient.del( tmpObj.allowOne );
            throw new Error( 'Key property needed to store in redis' );
        }
        else if( tmpObj.hash === redisRes ){
            this.redisClient.del( tmpObj.allowOne );
            if( this.logger ){
                this.logger.log( 'info', { url: req.href(), request: req.params } );
            }
            return tmpObj.res.send( 409, { errors: [ 'Duplicate request has been detected' ] } );
        }
        else{
            this.setHash( tmpObj );
            this.redisClient.del( tmpObj.allowOne );
            if( !_.isEmpty( this.global ) ){
                this.raiseFlag( this.global.shift() );
            }
        }
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
        return err;
    }
    return md5( string );
};

DuplicateCheck.prototype.setHash = function( tmpObj ){
    if( !!tmpObj.hash ){
        this.redisClient.set( tmpObj.redisKey, tmpObj.hash, function( err ){
            if( !!err ){
                tmpObj.res.send( 500, { errors: [ 'An internal errors has occurred' ] } );
                throw new Error( 'Could not set hash to redis database' )
            }
            this.redisClient.expire( tmpObj.redisKey, tmpObj.ttl );
            return tmpObj.next();
        }.bind( this ) );
    }
    else{
        return tmpObj.next();
    }
};

module.exports = DuplicateCheck;
