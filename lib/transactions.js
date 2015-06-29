var util = require('./util'),
    errors = require('./errors'),
    db = require('./db'),
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
            if (!Transaction.db) {
                callback(errors.TRANSACTION_NOT_SETUP);
            }

            if (!connection) {
                Transaction.db.getConnection(function (error, conn) {
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
    this.start(callback);
};

// Add static functions to the Transaction constructor.
util.extend(Transaction, /** @lends Transaction */ {
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
        // at this stage, the `db` variable should not exist. expecting fresh setup or post teardown setup.
        if (this.db) {
            // @todo - emit wrror event instead of console.log
            console.log('Warn: duplicate setup of connection found in Transactions.setup');
        }

        // clone the configuration
        config = util.clone(config);
        delete config.replication;

        // allow special transaction related config
        util.each(config, function (value, name, config) {
            if (!/^transaction.+/g.test(name)) { return; }

            // remove transaction config prefix
            var baseName = name.replace(/^transaction/g, '');
            baseName = baseName.charAt(0).toLowerCase() + baseName.slice(1);

            delete config[name];
            config[baseName] = value;
        });

        this.db = db.createSource(config);
    },

    /**
     * This function needs to be called at the end of app-lifecycle to ensure all db connections are closed.
     */
    teardown: function () {
        // just to be sure! clear all items in the connections object. they should be cleared by now
        util.each(this.connections, function (value, prop, conns) {
            try {
                value.release();
            }
            catch (e) { } // nothing to do with error
            delete conns[prop];
        });

        // now execute end on the db. will end pool if pool, or otherwise will execute whatever `end` that has been
        // exposed by db.js
        if (this.db) {
            this.db.end();
            this.db = null;
        }
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
        // it is expected that user starts a transaction before acting upon it. but if the user hasn't, we cannot throw
        // error. we should raise a warning.
        if (!this.connection()) {
            throw errors.TRANSACTION_UNINITIATED;
        }

        return util.wrapquery(query, this.id());
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
