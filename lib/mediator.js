/**
 * The Mediator module contains the api and the wrapper function that accepts a model and a transaction to allow easy
 * transactional operation on a particular model with a particular transaction.
 *
 * @module Mediator
 * @requires util
 */
var FN = 'function',
    util = require('./util'),
    AdapterError = require('./errors'),
    redeffer, // fn
    Mediator; // constructor

/**
 * This function accepts a deffer and a transaction object. It returns the same deffer object, but its `exec`
 * function gets overridden to wrap the results before executing the exec callback.
 *
 * @param {deffer} defer
 * @param {string} id
 * @param {boolean} nowrap
 * @returns {deffer}
 *
 * @todo remove nowrap when all model methods support transactiin Id in parameters
 */
redeffer = function (defer, id, nowrap) {
    defer.exec = id ? function (callback) {
        defer.constructor.prototype.exec.call(defer, function (/*err, result*/) {
            var args = util.args2arr(arguments);
            !nowrap && (args[1] = util.wrapquery(args[1], id));
            callback && callback.apply(this, args);
        }, id);
    } : function (callback) { // do not allow exec if transaction id is undefined
        callback && callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    };
    return defer;
};

/**
 * The mediator allows one to forward a Sails model and an instance of transaction in order to retrieve an instance that
 * provides easy model operation API using a particular transaction.
 *
 * @param {object} model
 * @param {Transaction} transaction
 * @constructor
 */
Mediator = function (model, transaction) {
    // ensure that a model and transaction has been forwarded to the mediator.
    if (!model) {
        throw new AdapterError(AdapterError.MEDIATOR_INVALID_MODEL);
    }

    if (!transaction) {
        throw new AdapterError(AdapterError.MEDIATOR_INVALID_TXN);
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
    query: function (query, data, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof data === FN && typeof callback !== FN) {
            callback = data;
            data = null;
        }

        if (typeof callback !== FN) {
            return redeffer(self._model.query(query, data, undefined, id), self, true);
        }

        return id ? self._model.query(query, data, function () {
            callback.apply(this, arguments);
        }, id) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    create: function (values, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.create(this._transaction.wrap(values)), id);
        }

        // wrap the values with the transaction id before sending to `.create` of model.
        // @todo perhaps tId could be passed on to waterline create via a direct param
        return id ? self._model.create(this._transaction.wrap(values), function (/*err, result*/) {
            var args = util.args2arr(arguments);
            args[1] = self._transaction.wrap(args[1]);
            return callback.apply(this, args);
        }) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    update: function (criteria, values, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.update(criteria, self._transaction.wrap(values)), id);
        }

        // inject transaction id in values
        // @todo - is there no other way than injecting to values? what if pass direct to update?
        return id ? self._model.update(criteria, self._transaction.wrap(values), function (/*err, result, ...*/) {
            var args = util.args2arr(arguments);
            args[1] = self._transaction.wrap(args[1]);
            return callback.apply(this, args);
        }) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    // @todo - perhaps tId could be passed on to waterline destroy via a direct param
    destroy: function (criteria, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.destroy(self._transaction.wrap(criteria)), id);
        }

        // we need to inject the transaction id as part of destruction.
        // since in case of destroy we are not expecting a return result, we do not need to wrap them and as such, we
        // do not need to separately treat callback and promise architecture.
        // @todo - check whether model.destroy returns any result. currently assumed not.
        return id ? self._model.destroy(self._transaction.wrap(criteria), callback) :
            callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    findOrCreate: function (criteria, values, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.findOrCreate(criteria, values, undefined, id), id);
        }

        // in this case, the model's `findOrCreate` function accepts tId as a parameter.
        return id ? self._model.findOrCreate(criteria, values, function (/*err, result*/) {
            var args = util.args2arr(arguments);
            args[1] = self._transaction.wrap(args[1]);
            return callback.apply(this, args);
        }, id) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    findOne: function (criteria, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.findOne(criteria, undefined, id), id);
        }

        // in this case, the model's `findOne` function accepts tId as a parameter.
        return id ? self._model.findOne(criteria, function (/*err, result*/) {
            var args = util.args2arr(arguments);
            args[1] = self._transaction.wrap(args[1]);
            return callback.apply(this, args);
        }, id) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    // @todo trap when criteria is blank
    find: function (criteria, options, callback) {
        var self = this,
            id = self._transaction.id();

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
            return redeffer(self._model.find(criteria, options, undefined, id), id);
        }

        return id ? self._model.find(criteria, options, function (/*err, result*/) {
            var args = util.args2arr(arguments);
            args[1] = self._transaction.wrap(args[1]);
            return callback.apply(this, args);
        }, id) : callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    },

    count: function (criteria, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof criteria === FN) {
            callback = criteria;
            criteria = null;
        }

        if (typeof callback !== FN) {
            return redeffer(self._model.count(criteria, null, undefined, id), id, true);
        }

        // in this case, the model's `findOne` function accepts tId as a parameter.
        return id ? self._model.count(criteria, callback, id) :
            callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
    }
});

module.exports = Mediator;
