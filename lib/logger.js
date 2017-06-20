var winston = require( 'winston' );
var moment = require( 'moment-timezone' );
var _ = require( 'lodash' );

function ScriptLogger( filename ){

    this.logger = new (winston.Logger)( {
        transports: [
            new winston.transports.Console(),
            new winston.transports.File( {
                filename: filename + '/dup-check.log.' + moment().format( 'YYYY-MM-DD' ),
                maxsize: 1000000000,
                json: false,
                timestamp: false,
                handleExceptions: true,
                exitOnError: false
            } )
        ]
    } );

    this.hasLogged = false;
}

ScriptLogger.prototype.log = function( logLevel, msg ){
    var logMessage = moment().format( 'YYYY-MM-DD HH:mm:ss' );
    if( _.isObject( msg ) ){
        msg = JSON.stringify( msg );
    }
    logMessage += ' ' + msg;

    this.logger.log( logLevel, logMessage );
    this.hasLogged = true;
};

ScriptLogger.prototype.processExit = function( code ){
    if( this.hasLogged ){
        this.logger.transports.file.flush();
        this.logger.transports.file.on( 'flush',
            function(){
                process.exit( code );
            }
        );
    }
    else{
        process.exit( code );
    }
};

module.exports = ScriptLogger;