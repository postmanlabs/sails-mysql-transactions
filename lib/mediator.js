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
redeffer = function (defer, mediator, nowrap) {
    defer.exec = function (callback) {
        mediator._connect(function (err, transaction) {
            if (err) { return callback(err); }

            var id = transaction.id();

            // do not allow exec if transaction id is undefined
            if (!transaction.connection()) {
                callback && callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
                return;
            }

            defer.constructor.prototype.exec.call(defer, function (/*err, result*/) {
                var args = util.args2arr(arguments);

                !nowrap && (args[1] = util.wrapquery(args[1], id));
                callback && callback.apply(this, args);
            }, id);
        });
    };

    return defer;
};

/**
 * The mediator allows one to forward a Sails model and an instance of transaction in order to retrieve an instance that
 * provides easy model operation API using a particular transaction.
 *
 * @param {object} model
 * @param {string} connectionName
 * @param {Transaction} transaction
 * @constructor
 */
Mediator = function (model, connectionName, transaction) {
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
    this._connectionName = connectionName;
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
    _connect: function (callback) {
        var self = this,
            conn = self._transaction.connection();

        if (conn) {
            return callback(null, self._transaction);
        }

        self._transaction.start(self._connectionName, callback);
    },

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

        // ensure that the transaction has been started
        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (id !== transaction.id()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_ID_INTEGRITY_FAILURE));
            }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            return self._model.query(query, data, callback, id);
        });
    },

    create: function (values, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return redeffer(self._model.create(self._transaction.wrap(values)), self);
        }

        // ensure that the transaction has been started
        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // wrap the values with the transaction id before sending to `.create` of model.
            // @todo perhaps tId could be passed on to waterline create via a direct param
            return self._model.create(transaction.wrap(values), function (/*err, result*/) {
                var args = util.args2arr(arguments);

                args[1] = self._transaction.wrap(args[1]);
                return callback.apply(this, args);
            });
        });
    },

    update: function (criteria, values, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return redeffer(self._model.update(criteria, self._transaction.wrap(values)), self);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // inject transaction id in values
            // @todo - is there no other way than injecting to values? what if pass direct to update?
            return self._model.update(criteria, self._transaction.wrap(values), function (/*err, result, ...*/) {
                var args = util.args2arr(arguments);
                args[1] = self._transaction.wrap(args[1]);
                return callback.apply(this, args);
            });
        });
    },

    // @todo - perhaps tId could be passed on to waterline destroy via a direct param
    destroy: function (criteria, callback) {
        var self = this;

        if (typeof callback !== FN) {
            return redeffer(self._model.destroy(self._transaction.wrap(criteria)), self);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // we need to inject the transaction id as part of destruction.
            // since in case of destroy we are not expecting a return result, we do not need to wrap them and as such,
            // we do not need to separately treat callback and promise architecture.
            // @todo - check whether model.destroy returns any result. currently assumed not.
            return self._model.destroy(self._transaction.wrap(criteria), callback);
        });
    },

    findOrCreate: function (criteria, values, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.findOrCreate(criteria, values, undefined, id), self);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (id !== transaction.id()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_ID_INTEGRITY_FAILURE));
            }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // in this case, the model's `findOrCreate` function accepts tId as a parameter.
            return self._model.findOrCreate(criteria, values, function (/*err, result*/) {
                var args = util.args2arr(arguments);
                args[1] = self._transaction.wrap(args[1]);
                return callback.apply(this, args);
            }, id);
        });
    },

    findOne: function (criteria, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof callback !== FN) {
            return redeffer(self._model.findOne(criteria, undefined, id), self);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (id !== transaction.id()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_ID_INTEGRITY_FAILURE));
            }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // in this case, the model's `findOne` function accepts tId as a parameter.
            return self._model.findOne(criteria, function (/*err, result*/) {
                var args = util.args2arr(arguments);
                args[1] = self._transaction.wrap(args[1]);
                return callback.apply(this, args);
            }, id);
        });
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
            return redeffer(self._model.find(criteria, options, undefined, id), self);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (id !== transaction.id()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_ID_INTEGRITY_FAILURE));
            }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            return self._model.find(criteria, options, function (/*err, result*/) {
                var args = util.args2arr(arguments);
                args[1] = self._transaction.wrap(args[1]);
                return callback.apply(this, args);
            }, id);
        });
    },

    count: function (criteria, callback) {
        var self = this,
            id = self._transaction.id();

        if (typeof criteria === FN) {
            callback = criteria;
            criteria = null;
        }

        if (typeof callback !== FN) {
            return redeffer(self._model.count(criteria, null, undefined, id), self, true);
        }

        self._connect(function (err, transaction) {
            if (err) { return callback(err); }

            if (id !== transaction.id()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_ID_INTEGRITY_FAILURE));
            }

            if (!transaction.connection()) {
                return callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED));
            }

            // in this case, the model's `findOne` function accepts tId as a parameter.
            return self._model.count(criteria, callback, id);
        });
    }
});

module.exports = Mediator;
