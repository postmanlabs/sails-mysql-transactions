/**
 * This file contains all error messages intended to be used by sails-mysql-transactions
 * @module transaction-errors
 */
var errors,
    key;

errors = {
    MEDIATOR_INSTANTIATION: 'Mediator is always expected to be instantiated using `new` keyword.',
    MEDIATOR_INVALID_CONSTRUCTION: 'Invalid transaction parameters forwarded to the Mediator.'
};

for (key in errors) {
    errors[key] = new Error('sails-mysql-transactions error: ' + errors[key]);
}

module.exports = errors;
