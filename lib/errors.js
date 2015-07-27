/**
 * This file contains all error messages intended to be used by sails-mysql-transactions
 * @module transaction-errors
 */
var errors,
    key;

errors = {
    MEDIATOR_INVALID_MODEL: 'Invalid model forwarded to transaction.',
    MEDIATOR_INVALID_TXN: 'Invalid transaction parameters.',

    TRANSACTION_NOT_SETUP: 'Transaction.setup() has not been called. Missing ORM registration?',
    TRANSACTION_CONNECTION_OVERLAP: 'Multiple connections got associated with a single transaction. Nasty!',
    TRANSACTION_UNINITIATED: 'Transaction was used without doing Transaction.start();',

    REPLICATION_NO_SOURCE: 'Replication source not found'
};

for (key in errors) {
    errors[key] = new Error('sails-mysql-transactions error: ' + errors[key]);
}

module.exports = errors;
