/**
 * This file contains all error messages intended to be used by sails-mysql-transactions
 * @module transaction-errors
 */
var errors,
    key,
    TransactionError; // constructor

errors = {
    MEDIATOR_INVALID_MODEL: 'Invalid model forwarded to transaction.',
    MEDIATOR_INVALID_TXN: 'Invalid transaction parameters.',

    TRANSACTION_NOT_SETUP: 'Transaction.setup() has not been called. Missing ORM registration?',
    TRANSACTION_CONNECTION_OVERLAP: 'Multiple connections got associated with a single transaction. Nasty!',
    TRANSACTION_UNINITIATED: 'Transaction was used without doing Transaction.start();',
    TRANSACTION_UNINITIATED_COMM: 'Transaction commit failed since transaction has either expired or not started',
    TRANSACTION_UNINITIATED_ROLL: 'Transaction rollback failed since transaction has either expired or not started',

    REPLICATION_NO_SOURCE: 'Replication source not found'
};

TransactionError = function (message) {
    if (!(this instanceof TransactionError)) {
        return new TransactionError(message);
    }
    Error.prototype.constructor.apply(this, arguments);
    arguments.length && (this.message = message);
    this.name = 'TransactionError';
};

TransactionError.prototype = new Error();
TransactionError.prototype.constructor = TransactionError;

for (key in errors) {
    errors[key] = new TransactionError('sails-mysql-transactions error: ' + errors[key]);
}

// store the root error object
errors.TransactionError = TransactionError;

module.exports = errors;
