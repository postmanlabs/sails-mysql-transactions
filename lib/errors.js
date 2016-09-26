/**
 * This file contains all error messages intended to be used by sails-mysql-transactions
 * @module transaction-errors
 */
var util = require('./util'),
    AdapterError; // constructor
/**
 * @constructor
 * @inherits Error
 */
AdapterError = function (message) {
    if (!(this instanceof AdapterError)) {
        return new AdapterError(message);
    }
    Error.captureStackTrace(this, this.constructor);
    arguments.length && (this.message = message);
    this.name = 'AdapterError';
};

AdapterError.prototype = new Error();
AdapterError.prototype.constructor = AdapterError;

util.extend(AdapterError, {
    MEDIATOR_INVALID_MODEL: 'Invalid model forwarded to transaction.',
    MEDIATOR_INVALID_TXN: 'Invalid transaction parameters.',

    TRANSACTION_NOT_SETUP: 'Transaction.setup() has not been called. Missing ORM registration?',
    TRANSACTION_CONNECTION_OVERLAP: 'Multiple connections got associated with a single transaction. Nasty!',
    TRANSACTION_UNINITIATED: 'Transaction was used without doing Transaction.start();',
    TRANSACTION_UNINITIATED_COMM: 'Transaction commit failed since transaction has either expired or not started',
    TRANSACTION_UNINITIATED_ROLL: 'Transaction rollback failed since transaction has either expired or not started',
    TRANSACTION_MULTI_DB_CONNECTION_ATTEMPTED: 'Transaction attempted for multiple databases',
    TRANSACTION_NOT_IDENTIFIED: 'Unable to locate the connection for which to transact',
    TRANSACTION_CONFIG_NOT_FOUND: 'Database has no transaction configuration',
    TRANSACTION_ID_NOT_FOUND: 'No transaction id was associated',
    TRANSACTION_NOT_ASSOCIATED: 'No associated transaction found with the connection',

    REPLICATION_NO_SOURCE: 'Replication source not found'
});

module.exports = AdapterError;
