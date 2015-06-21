var nonObjectCriteriaTypes = { // object to validate types
        string: true,
        number: true,
        boolean: true
    },

    util = require('./util'),
    errors = require('./errors'),
    db = require('./db'),
    Mediator = require('./mediator'),
    Transaction; // fn

/**
 * Sails Transaction allows you to pass specific sails actions through common database connection allowing you to
 * leverage mySQL transactions support.
 *
 * @constructor
 * @param {function} callback - receives `error`, `transaction`
 */
Transaction = function (callback) {
    var connection = null;

    util.extend(this, /** @lends Transaction.prototype */ {
        /**
         * Creates a connection if not already connected.
         *
         * @private
         * @returns {mysql.Connection}
         */
        connect: function (callback) {
            // validate db setup prior to every connection. this ensures nothing goes forward post teardown
            if (!Transaction.sources.primary) {
                callback(errors.TRANSACTION_NOT_SETUP);
            }

            if (!connection) {
                Transaction.sources.primary.getConnection(function (error, conn) {
                    if (!error) {
                        connection = conn; // save locally
                        Transaction.associateConnection(conn); // assign a transaction id
                    }
                    callback(error, connection);
                });
            }
            else {
                callback(undefined, connection);
            }
        },

        /**
         * Gets the instance of the db connection associated with this transaction. The connection object is sealed off
         * within the Transaction constructor to avoid any sort of integrity loss while the transaction or the actor is
         * moved along the codebase.
         *
         * @private
         * @returns {mysql.Connection}
         */
        connection: function () {
            return connection;
        },

        /**
         * Clears the internal reference of the connection with this transaction
         *
         * @private
         */
        disconnect: function () {
            if (connection) {
                connection = null;
            }
        }
    });

    // if not yet connected, spawn new connection and initiate transaction
    return this.start(callback);
};

// Add static functions to the Transaction constructor.
util.extend(Transaction, /** @lends Transaction */ {
    /**
     * Mediator allows Model operations to be executed in coherence with a transaction.
     */
    Mediator: Mediator,

    /**
     * Stores all database sources
     */
    sources: {},

    /**
     * Stores all ongoing database connections.
     * @private
     *
     * @type {object<mysql~connection>}
     */
    connections: {},

    /**
     * For first run, the transactions environment needs to be setup. Without that, it is not possible to procure new
     * database connections.
     */
    setup: function (config) {
        var that = this;

        // at this stage, the `db` variable should not exist. expecting fresh setup or post teardown setup.
        if (this.sources.primary) {
            // @todo - emit wrror event instead of console.log
            console.log('Warn: duplicate setup of connection found in Transactions.setup');
            this.teardown();
        }

        // create connections for read-replicas
        util.each(config.replicas, function (replicaConfig, replicaId) {
            that.sources[replicaId] = db.createSource(util.extend(util.clone(replicaConfig), {
                database: config.database,
                adapter: config.adapter
            }));
        });

        // there should not be a database replica-set named `primary`
        if (this.sources.primary) {
            // @todo - emit wrror event instead of console.log
            console.log('Warn: replica set named "primary" will be overridden by main source. Rename it.');
        }

        // create the primary db
        this.sources.primary = db.createSource(config);
    },

    /**
     * This function needs to be called at the end of app-lifecycle to ensure all db connections are closed.
     */
    teardown: function () {
        // just to be sure! clear all items in the connections object. they should be cleared by now
        util.each(this.connections, function (connection, connectionName, conns) {
            try {
                connection.release();
            }
            catch (e) { } // nothing to do with error
            delete conns[connectionName];
        });

        // now execute end on the db. will end pool if pool, or otherwise will execute whatever `end` that has been
        // exposed by db.js
        util.each(this.sources, function (source, sourceName, sources) {
            try {
                source.end();
            }
            catch (e) { } // nothing to do with error
            delete sources[sourceName];
        });
    },

    /**
     * Update the internal cache to associate a connection with a particular transaction id
     * @private
     *
     * @param {mysql.Connection} connection
     */
    associateConnection: function (connection) {
        if (connection.transactionId && Transaction.connections[connection.transactionId]) {
            throw errors.TRANSACTION_CONNECTION_OVERLAP;
        }

        connection.transactionId = util.uid();
        Transaction.connections[connection.transactionId] = connection;
    },

    /**
     * Update internal cache to disassociate a connection from a transaction id
     * @private
     *
     * @param {mysql.Connection} connection
     */
    disassociateConnection: function (connection) {
        delete Transaction.connections[connection.transactionId];
        delete connection.transactionId;
    },

    /**
     * Start a new transaction.
     *
     * @param {function} callback - receives (`error`, `{Transaction#}`)
     */
    start: function (callback) {
        return (new this(callback));
    },

    /**
     * Use this function to extract the underlying db connection from a transaction id.
     * @private
     *
     * @param {object|string} id
     * @returns {object} - mySQL connection object
     */
    retrieveConnection: function (id) {
        return id && (this.connections[id] || this.connections[id.transactionId]) || undefined;
    },

    /**
     * Extract transaction Id from valuesObject passed on to adapter.
     * @private
     *
     * @param {object} object
     * @returns {*}
     */
    probeIdFromValues: function (values) {
        return values && values.transactionId;
    },

    /**
     * This method allows one to extract transaction id from a critera object. The interesting thing is that it recovers
     * transaction id embedded within nested criteria and joins.
     * @private
     *
     * @param {object|array} criteria
     * @returns {string}
     */
    extractIdFromCriteria: function (criteria) {
        var conns = Transaction.connections,
            transactionId;

        // if criteria is fa;sy, we have nothing further to work on.
        if (!criteria) {
            return;
        }

        // we do a crude check to see if transaction id has been sent as part of the criteria object.
        if (conns[criteria.transactionId]) {
            // @todo this is brought here because there is an extra transactionId coming from somewhere in the where
            // clause
            if (criteria.where && criteria.where.transactionId) {
                delete criteria.where.transactionId;
            }
            return ((transactionId = criteria.transactionId), (delete criteria.transactionId), transactionId);
        }

        // if the criteria object sent is an array, usually this is a result of recusrion from this
        // function itself, we then try and process every item in the array for existence of transaction id.
        if (Array.isArray(criteria)) {
            criteria.some(function (item) {
                // during recursion we are sure CRC will always pass as that has been ensured by waterline
                // schema.
                return (transactionId = Transaction.extractIdFromCriteria(item));
            });
            // if trabsaction id was found in recursive criteria, we return the same, else proceed.
            if (transactionId) {
                return transactionId;
            }
        }

        // if the criteria object is a schema processed dql, we would possibly get the transaction id within the `where`
        // key.
        if (criteria.where && conns[criteria.where.transactionId]) {
            return ((transactionId = criteria.where.transactionId), (delete criteria.where.transactionId),
                transactionId);
        }

        // finally, we try to recurse into finding transaction id within joins
        Array.isArray(criteria.joins) && (transactionId = Transaction.extractIdFromCriteria(criteria.joins));

        // finally, we return whatever transaction id we have received. could possibly be `undefined` as well.
        return transactionId;
    }
});

util.extend(Transaction.prototype, /** @lends Transaction.prototype */ {
    /**
     * Start a new transaction.
     *
     * @param callback
     */
    start: function (callback) {
        var self = this,
            conn = this.connection();

        // if not yet connected, spawn new connection and initiate transaction
        if (!conn) {
            this.connect(function (error, conn) {
                if (error) {
                    callback(error, conn);
                    return;
                }
                // now that we have the connection, we initiate transaction. note that this sql_start is part of the new
                // connection branch. it is always highly likely that this would be the program flow. in a very unlikely
                // case the alternate flow will kick in, which is the `conn.query` right after this if-block.
                conn.beginTransaction(function (error) {
                    callback(error, self);
                });
            });

            return; // do not proceed with sql_start if connection wasn't initially present.
        }
        // in the unlikely event that transaction was started while connection was already present, we simply initiate
        // a start of transaction.
        conn.beginTransaction(function (error) {
            // if callback mode is used, then execute it and send self as a parameter to match the new Constructor API.
            callback(error, self);
        });
    },

    /**
     * Use this function on the new instance of the transaction to mark a query as part of this transaction
     *
     * @param {*} query
     * @returns {*}
     *
     * @throws {Error} If failed to query the connection to start a transaction
     * @throws {Error} If query already has a `transactionId` field.
     */
    wrap: function (query) {
        var conn = this.connection();

        if (conn) {
            // if query is string or number, we convert it to an object and store transaction id in them.
            query = nonObjectCriteriaTypes[typeof query] && {
                id: query
            } || query; // else inject transactionId.

            // save transaction id to query and return
            query && (query.transactionId = conn.transactionId);
        }
        // it is expected that user starts a transaction before acting upon it. but if the user hasn't, we cannot throw
        // error. we should raise a warning.
        else {
            throw errors.TRANSACTION_UNINITIATED;
        }

        return query;
    },

    /**
     * Commit the transaction
     * @param {function} callback - receives `error`
     */
    commit: function (callback) {
        var conn = this.connection();

        // prevent new transactions from using this connection.
        this.disconnect();

        // if commit was called with no active conn, it implies, no transact action
        // was called. as such it is an error.
        conn ? conn.commit(function (error) {
            // try releasing the connection.
            // if that fails then treat it as a major error.
            try {
                conn.release();
            }
            // if there was an error during release, set that as the main error.
            catch (err) {
                !error && (error = err);
            }

            if (error) { // if failure to issue commit or release, then rollback
                return conn.rollback(function () {
                    callback && callback(error);
                });
            }

            // disassociate the connection from transaction and execute callback
            Transaction.disassociateConnection(conn);
            callback && callback();
        }) : (callback && callback(errors.TRANSACTION_UNINITIATED));
    },

    /**
     * Rollback the transaction
     * @param {function} callback - receives `error`
     */
    rollback: function (callback) {
        var conn = this.connection();

        // prevent new transactions from using this connection.
        this.disconnect();

        // if commit was called with no active conn, it implies, no transact action
        // was called. as such it is an error.
        conn ? conn.rollback(function (error) {
            // try releasing the connection.
            // if that fails then treat it as a major error.
            try {
                conn.release();
            }
            // if there was an error during release, set that as the main error.
            catch (err) {
                !error && (error = err);
            }

            // disassociate the connection from transaction and execute callback
            Transaction.disassociateConnection(conn);
            callback && callback(error);
        }) : (callback && callback(errors.TRANSACTION_UNINITIATED));
    },

    toString: function () {
        return '[object Transaction:' + (this.connection() && this.connection().transactionId || 'disconnected') + ']';
    },

    /**
     * Returns the transaction id associated with this transaction instance.
     * @returns {string}
     */
    id: function () {
        return this.connection() && this.connection().transactionId || undefined;
    }
});

module.exports = Transaction;
