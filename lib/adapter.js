var util = require('./util'),
    AdapterError = require('./errors'),
    _ = require('lodash'),
    arrProtoSlice = Array.prototype.slice,
    Transaction = require('./transactions'),
    Mediator = require('./mediator'),
    Multiplexer = require('./multiplexer'),

    sailsmysql = require('../sails-mysql/lib/adapter.js'),
    adapter = util.clone(sailsmysql);

/**
 * The adapter override matrix. This object defines how to handle each individual properties of the mySql adapter.
 * @type {object}
 *
 * @note
 * Object structure within each override are as follows
 * ```
 * 'overrideFunctionName': {
 *   conn: {number} - the argument index where the adapter expects connection parameter
 *   criteria: {number=} - the argument index of a criteria object in the original adapter
 *   probe: {number=} - in case transaction is tied up with values, which argument to probe
 * }
 * ```
 *
 * @note - untapped original adapter functions
 * - addAttributes: conn=5
 * - describe: conn=3
 * - define: conn=4
 * - drop: conn=4
 */
util.each({
    create: {
        probe: 2,
        criteria: 2, // @todo - analyze. criteria works for add member and probe works for create user
        conn: 4
    },
    count: {
        criteria: 2,
        conn: 4
    },
    createEach: { // unused
        criteria: 2,
        conn: 4
    },
    find: {
        criteria: 2,
        conn: 4
    },
    join: {
        criteria: 2,
        conn: 4
    },
    query: { // unused
        criteria: 2,
        probe: 3,
        conn: 5
    },
    stream: { // unused
        criteria: 2,
        conn: 4
    },
    update: {
        conn: 5,
        probe: 3
    },
    destroy: {
        criteria: 2,
        conn: 4
    }
}, function (override, prop) {
    var _super = adapter[prop];

    // function that sniffs transactions and puts it in place of connection obj
    adapter[prop] = function (connectionName, collectionName) {
        var args = arrProtoSlice.call(arguments),
            id;

        // if connection is already present in arguments, we do not need to extract anything.
        if (!_.isUndefined(args[override.conn])) {
            if (_.isString(args[override.conn])) {
                id = args[override.conn];
                id = Transaction.retrieveConnection(id) || Multiplexer.retrieveConnection(id);
                id && (args[override.conn] = id);
            }
            return _super.apply(this, args);
        }

        if (override.hasOwnProperty('probe')) {
            id = util.unwrapquery(args[override.probe]);
            // @todo - temporarily remove transactionId from probe having criteria field of joinTables
            if (id && override.hasOwnProperty('criteria') && /.+__.+/.test(collectionName)) {
                delete args[override.probe].transactionId;
            }
        }
        else if (override.hasOwnProperty('criteria')) {
            // @todo: combine connections bucket for a single pass
            id = util.unwrapquery(args[override.criteria], Transaction.connections) ||
                util.unwrapquery(args[override.criteria], Multiplexer.connections);
        }
        else {
            // if no extraction method is provided, use arg beyond last one.
            id = util.unwrapquery(args[override.conn + 1]);
        }

        // assuming that we have retrieved the id, we pass it on to Transaction system to get the original db
        // connection associated with this adapter request.
        if (Transaction.retrieveConnection(id)) {
            args[override.conn] = Transaction.retrieveConnection(id);
        }
        else if (Multiplexer.retrieveConnection(id)) {
            args[override.conn] = Multiplexer.retrieveConnection(id);
        }

        return _super.apply(this, args);
    };
});

util.extend(adapter, {
    identity: 'sails-mysql-transactions',
    AdapterError: AdapterError,
    Transaction: Transaction,

    defaults: util.extend(util.clone(adapter), {
        pool: true,
        waitForConnections: true,
        rollbackTransactionOnError: true,
        transactionConnectionLimit: 5,

        queryCaseSensitive: false,

        replication: {
            enabled: false,
            inheritMaster: true,
            canRetry: true,
            removeNodeErrorCount: 5,
            restoreNodeTimeout: (1000 * 60 * 5),
            defaultSelector: 'RR',
            sources: {}
        }
    }),

    /**
     * Register this adapter when Sails boots up. This additionally initialises the transactional db connection source
     * and then goes on to execute the original adapter registration.
     * @private
     *
     * @param config
     * @param collections
     * @param cb
     * @returns {*}
     */
    registerConnection: function (config) {
        // setup the transactions class with adapter config
        Transaction.setup(config);
        Multiplexer.setup(config);

        // Call the core registration function.
        return sailsmysql.registerConnection.apply(this, arguments);
    },

    /**
     * The teardown of this adapter executes teardown of transactions and then goes on to perform whatever original
     * adapter teardown was supposed to do.
     * @private
     */
    teardown: function () {
        Transaction.teardown();
        Multiplexer.teardown();

        return sailsmysql.teardown.apply(this, arguments);
    },

    /**
     * This allows one to exercise transaction scoped Model API.
     *
     * @param {string} connectionName
     * @param {string} collectionName
     * @param {Transaction} transaction
     * @returns {Transaction.Mediator}
     */
    transact: function (connectionName, collectionName, transaction) {
        return (new Mediator(this, transaction));
    },

    /**
     * This allows one to exercise connection scoped Model API.
     *
     * @returns {Transaction.Multiplexer}
     */
    readonly: function () {
        return (new Multiplexer(this));
    },

    /**
     * This allows one to create a model instance.
     *
     * @param {string} connectionName
     * @param {string} collectionName
     * @param {Object} obj
     * @param {Function} cb
     * @returns {Object} Model Instance
     */
    fromObject: function (connectionName, collectionName, obj, cb) {
        if (_.isObject(obj)) {
            try {
                var modelInstance = new this._model(obj);
                return cb(null, modelInstance);
            }
            catch (err) {
                return cb(err, null);
            }
        }
    }
});

module.exports = adapter;
