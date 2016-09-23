var util = require('./util'),
    AdapterError = require('./errors'),
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
    /**
     * Store the transaction ID
     * @memberOf Transaction.prototype
     * @type {String}
     * @private
     *
     * @note usually _id is set by connect and removed by disconnect, however since for some actions, we need the ID
     * before we have connection, we initially set it to a value.
     */
    this._id = util.uid();

    /**
     * Store the connection associated with this transaction.
     * @memberOf Transaction.prototype
     * @type {mysql.Connection}
     *
     * @note Initialisation sets this to null. Need to .connect() to set these
     * @private
     */
    this._connection = null;

    /**
     * Store the name of the connection DB (in case multiple db is used)
     * @memberOf Transaction.prototype
     * @type {String}
     *
     * @note Initialisation sets this to null. Need to .connect() to set these
     * @private
     */
    this._connectionName = null;

    callback(null, this);
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
     * Stores all database connection sources.
     * @private
     *
     * @type {object}
     */
    databases: {},

    /**
     * Start a new transaction.
     *
     * @param {function} callback - receives (`error`, `{Transaction#}`)
     */
    start: function (callback) {
        return (new Transaction(callback));
    },

    /**
     * For first run, the transactions environment needs to be setup. Without that, it is not possible to procure new
     * database connections.
     */
    setup: function (config) {
        // at this stage, the `db` variable should not exist. expecting fresh setup or post teardown setup.
        if (Transaction.databases[config.identity]) {
            // @todo - emit wrror event instead of console.log
            console.log('Warn: duplicate setup of connection found in Transactions.setup');
            this.teardown();
        }

        var _db;

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

        _db = db.createSource(config);

        // Save a few configurations
        _db && (_db.transactionConfig = {
            rollbackOnError: config.rollbackTransactionOnError
        });

        Transaction.databases[config.identity] = _db;
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

        // now execute end on the databases. will end pool if pool, or otherwise will execute whatever
        // `end` that has been exposed by db.js
        util.each(Transaction.databases, function (value, prop, databases) {
            value.end();
            databases[prop] = null;
        });
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
     * Update the internal cache to associate a connection with a particular transaction id
     * @private
     *
     * @param {mysql.Connection} connection
     * @param {string} uid
     * @param {Object} config
     */
    associateConnection: function (connection, uid, config) {
        if (!uid) {
            // @todo throw error if association ID is absent
        }

        if (!config) {
            // @todo throw error if configuration is absent
        }

        if (connection.transactionId && Transaction.connections[connection.transactionId]) {
            throw new AdapterError(AdapterError.TRANSACTION_CONNECTION_OVERLAP);
        }

        // save all much needed info with the connection itself. remember to delete during disassociation
        connection.transactionId = uid;
        connection.transactionConfig = config;

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
        connection.transactionId = null;
        connection.transactionConfig = null;
    }
});

util.extend(Transaction.prototype, /** @lends Transaction.prototype */ {
    /**
     * Returns the transaction id associated with this transaction instance. If the transaction is not connected,
     * it creates a new ID and caches it if things are not connected
     *
     * @returns {string}
     */
    id: function () {
        var connection = this.connection();

        // if a connection is defined, get the ID from connection
        if (connection) {
            if (!connection.transactionId) {
                // @todo throw error if connection is associated but has no id. that would be weird.
            }

            return (this._id = connection.transactionId); // save it just in case, during return
        }

        // at this point if we do not have an id, we know that we will need to return a dummy one
        return this._id || (this._id = util.uid());
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
        return this._connection;
    },

    /**
     * Creates a connection if not already connected.
     *
     * @private
     * @returns {mysql.Connection}
     */
    connect: function (connectionName, callback) {
        var self = this,
            _db = Transaction.databases[connectionName],
            transactionId;

        // validate db setup prior to every connection. this ensures nothing goes forward post teardown
        if (!_db) {
            callback(new AdapterError(AdapterError.TRANSACTION_NOT_SETUP));
        }

        // validate connection name
        if (!connectionName) {
            callback(new AdapterError(AdapterError.TRANSACTION_NOT_IDENTIFIED));
        }

        // if this transaction is already connected, then continue
        if (self.connection()) {
            // @todo implement error check when multi-db conn is atempted
            // // callback with error if connection name and current connection mismatch
            // if (connectionName !== self.connection().identity) {
            //     callback(new AdapterError(AdapterError.TRANSACTION_MULTI_DB_CONNECTION_ATTEMPTED));
            // }

            callback(undefined, self.connection());
            return;
        }

        // at this point, it seems like thet connection has not been setup yet, so we setup one and then move forward
        transactionId = self.id(); // this will return and cache a new transaction ID if not already present

        // set the actual connection name
        self._connectionName = connectionName;

        _db.getConnection(function (error, conn) {
            if (!error) {
                self._connection = conn; // save reference
                Transaction.associateConnection(conn, transactionId, _db.transactionConfig); // @note disassociate on dc
            }

            callback(error, self._connection);
        });
    },

    /**
     * Clears the internal reference of the connection with this transaction
     *
     * @private
     */
    disconnect: function () {
        this._connection = null;
        this._id = null;
        this._connectionName = null;
    },

    /**
     * Start a new transaction.
     *
     * @param connectionName
     * @param callback
     */
    start: function (connectionName, callback) {
        var self = this,
            conn = self.connection();

        // if not yet connected, spawn new connection and initiate transaction
        if (!conn) {
            self.connect(connectionName, function (error, conn) {
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

        // if transaction is attempted across multiple connections, return an error
        if (connectionName !== self._connectionName) {
            return callback(new AdapterError(AdapterError.TRANSACTION_MULTI_DB_CONNECTION_ATTEMPTED));
        }

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
     */
    wrap: function (query) {
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

            // if failure to issue commit or release, then rollback
            if (error && conn.transactionConfig.rollbackOnError) {
                return conn.rollback(function () {
                    // disassociate the connection from transaction and execute callback
                    Transaction.disassociateConnection(conn);
                    callback && callback(error);
                });
            }

            // disassociate the connection from transaction and execute callback
            Transaction.disassociateConnection(conn);
            callback && callback(error);
        }) : (callback && callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED_COMM)));
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
        }) : (callback && callback(new AdapterError(AdapterError.TRANSACTION_UNINITIATED_ROLL)));
    },

    toString: function () {
        return '[object Transaction:' + (this.connection() && this.connection().transactionId || 'disconnected') + ']';
    }
});

module.exports = Transaction;
