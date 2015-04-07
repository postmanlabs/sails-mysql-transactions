/**
 * The Mediator module contains the api and the wrapper function that accepts a model and a transaction to allow easy
 * transactional operation on a particular model with a particular transaction.
 *
 * @module Mediator
 * @requires util
 */
var FN = 'function',
    util = require('./util'),
    errors = require('./errors'),
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
        throw errors.MEDIATOR_INSTANTIATION;
    }

    // ensure that a model and transaction has been forwarded to the mediator.
    if (!model || !transaction || !((typeof transaction.id === FN) && transaction.id())) {
        throw errors.MEDIATOR_INVALID_CONSTRUCTION;
    }

    // save reference to model and transaction
    this._model = model;
    this._transaction = transaction;
};

/**
 * All the mediator functions have almost similar algorithmic structure. They receive the usual parameter that their
 * model counterpart would accept and then call the original function and pass on the transaction Id associated with the
 * mediator instance.
 *
 * All the functions also needs to check whether the usage is callback style or promise style and call the model
 * counterparts accordingly.
 */
util.extend(Mediator.prototype, /** @lends Mediator.prototype */ {
    create: function (values, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.create(values, undefined, self._transaction.id()), self._transaction);
        }

        // wrap the values with the transaction id before sending to `.create` of model.
        // @todo perhaps tId could be passed on to waterline create via a direct param
        return self._model.create(values, function (err, result) {
            return callback(err, self._transaction.wrap(result));
        }, self._transaction.id());
    },

    update: function (criteria, values, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.update(criteria, values, undefined, self._transaction.id()),
                self._transaction);
        }

        // inject transaction id in values
        // @todo - is there no other way than injecting to values? what if pass direct to update?
        return self._model.update(criteria, values, function (err, result) {
            return callback(err, self._transaction.wrap(result));
        }, self._transaction.id());
    },

    // @todo - perhaps tId could be passed on to waterline destroy via a direct param
    destroy: function (criteria, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.destroy(criteria, undefined, self._transaction.id()),
                self._transaction);
        }

        // we need to inject the transaction id as part of destruction.
        // since in case of destroy we are not expecting a return result, we do not need to wrap them and as such, we
        // do not need to separately treat callback and promise architecture.
        return self._model.destroy(criteria, callback, self._transaction.id());
    },

    findOrCreate: function (criteria, values, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.findOrCreate(criteria, values, undefined, self._transaction.id()),
                self._transaction);
        }

        // in this case, the model's `findOrCreate` function accepts tId as a parameter.
        return self._model.findOrCreate(criteria, values, function (err, result) {
            return callback(err, self._transaction.wrap(result));
        }, self._transaction.id());
    },

    findOne: function (criteria, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.findOne(criteria, undefined, self._transaction.id()),
                self._transaction);
        }

        // in this case, the model's `findOne` function accepts tId as a parameter.
        return self._model.findOne(criteria, function (err, result) {
            return callback(err, self._transaction.wrap(result));
        }, self._transaction.id());
    },

    // @todo trap when criteria is blank
    find: function (criteria, options, callback) {
        var self = this;

        // find accepts polymorhic arguments. anything function is treated as callback. we too need to do this check
        // here (even while this is done in model.find) so that we test the correct callback parameter while choosing
        // the defer or non-defer path.
        if (typeof criteria === FN) {
            callback = criteria;
            criteria = options = null;
        }

        if (typeof options === FN) {
            callback = options;
            options = null;
        }

        if (typeof callback !== FN) {
            return Mediator.redeffer(self._model.find(criteria, options, undefined, self._transaction.id()),
                self._transaction);
        }

        return self._model.find(criteria, options, function (err, result) {
            return callback(err, self._transaction.wrap(result));
        }, self._transaction.id());
    }
});

util.extend(Mediator, /** @lends Mediator */ {
    /**
     * This function accepts a deffer and a transaction object. It returns the same deffer object, but its `exec`
     * function gets overridden to wrap the results before executing the exec callback.
     *
     * @private
     * @param {deffer} defer
     * @param {Transaction} _transaction
     * @returns {deffer}
     */
    redeffer: function (defer, _transaction) {
        defer.exec = function (callback) {
            defer.constructor.prototype.exec.call(defer, function (err, result) {
                callback && callback(err, _transaction.wrap(result));
            });
        };
        return defer;
    }
});

module.exports = Mediator;
