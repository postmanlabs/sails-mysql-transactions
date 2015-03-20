/**
 * The Mediator module contains the api and the wrapper function that accepts a model and a transaction to allow easy
 * transactional operation on a particular model with a particular transaction.
 *
 * @module Mediator
 * @requires util
 */
var util = require('./util'),
  Mediator; // fn

/**
 * The mediator allows one to forward a Sails model and an instance of transaction in order to retrieve an instance that
 * provides easy model operation API using a particular transaction.
 *
 * @param {object} model
 * @param {Transaction} transaction
 * @constructor
 */
Mediator = function (model, transaction) {
  // do not allow forgetful call to mediator without instantiating it.
  if (!(this instanceof Mediator)) {
    throw new Error('sails-mysql-transaction error: Mediator is always expected to be instantiated using new keyword.');
  }

  // ensure that a model and transaction has been forwarded to the mediator.
  if (!model || !transaction) {
    throw new Error('sails-mysql-transaction error: Invalid transaction forwarded to the Mediator.');
  }

  // save reference to model and transaction
  this._model = model;
  this._transaction = transaction;
};

util.extend(Mediator.prototype, /** @lends Mediator.prototype */ {
  create: function (values, cb) {
    var self = this;

    return this._model.create(this._transaction.wrap(values), function (err, results) {
      self._transaction.wrap(results);
      cb && cb(err, results);
    });
  }
});

module.exports = Mediator;
