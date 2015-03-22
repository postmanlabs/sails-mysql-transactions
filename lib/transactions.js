var util = require('./util'),
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
                callback(new Error('Transaction.setup has not been done.'));
            }

            if (!connection) {
                Transaction.db.getConnection(function (error, conn) {
                    if (!error) {
                        connection = conn;
                        conn.transactionId = util.uid(); // assign a transaction id
                        Transaction.connections[conn.transactionId] = connection; // store static reference
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
                delete connection.transactionId;
                delete Transaction.connections[connection.transactionId];
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
    Mediator: require('./transaction-mediator'),

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
        this.db = db.createSource(config);
    },

    /**
     * This function needs to be called at the end of app-lifecycle to ensure all db connections are closed.
     */
    teardown: function () {
        // just to be sure! clear all items in the connections object. they should be cleared by now
        util.each(this.connections, function (value, prop, conns) {
            value.release();
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
     * Start a new transaction.
     *
     * @param {function} callback - receives (`error`, `{Transaction#}`)
     */
    start: function (callback) {
        return (new this(callback));
    },

    /**
     * Use this function to extract the underlying db connection from a transaction id.
     *
     * @param {object|string} id
     * @returns {object} - mySQL connection object
     */
    retrieveConnection: function (id) {
        return id && (this.connections[id] || this.connections[id.transactionId]) || undefined;
    },

    /**
     * Extract transaction Id from valuesObject passed on to adapter.
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
     * @param {[type]} query [description]
     * @returns {[type]} [description]
     *
     * @throws {Error} If failed to query the connection to start a transaction
     * @throws {Error} If query already has a `transactionId` field.
     */
    wrap: function (query) {
        var conn = this.connection();

        if (conn) {
            // save transaction id to query and return
            query.transactionId = conn.transactionId;
        }
        // it is expected that user starts a transaction before acting upon it. but if the user hasn't, we cannot throw
        // error. we should raise a warning.
        // @todo - emit wrror event instead of console.log
        else {
            console.log('Warn: Transaction was executed without doing Transaction.start()');
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
            if (error) { // if failure to issue commit, then rollback
                conn.rollback(function (error) {
                    if (error) {
                        return callback && callback(error);
                    }
                    conn.release(callback);
                });
            }
            else {
                // end the connection post commit if it is not in use
                conn.release();
                callback && setTimeout(callback, 0);
            }
        }) : (callback && callback(new Error('Nothing to commit')));
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
            if (error) {
                return callback && callback(error);
            }
            // end the connection post rollback if it is not in use
            conn.release();
            callback && setTimeout(callback, 0);
        }) : (callback && callback(new Error('Nothing to rollback')));
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

// @todo - this needs to go.
Transaction.sniff = function (args, msg) {
    var out,
        where = '',
        smell = function (item, index) {
            if (!item) {
                return;
            }

            if (item instanceof Transaction) {
                where = 'as instance';
                out = {
                    transactionId: item.connection() && item.connection().transactionId
                };
            }
            else if (item._trans instanceof Transaction) {
                where = 'as child instance';
                out = {
                    transactionId: item._trans.connection() && item._trans.connection().transactionId
                };
            }
            else if (Transaction.connections[item.transactionId]) {
                where = 'as child string';
                out = {
                    transactionId: item.transactionId
                };
            }
            else if (Transaction.connections[item]) {
                where = 'as string';
                out = {
                    transactionId: item + ''
                };
            }

            if (out) {
                if (index !== undefined) {
                    where = where + ' at index ' + index;
                }
                return false;
            }
        };

    smell(args);
    if (out) {
        where = 'straight in object ' + where;
    }
    if (!out) {
        util.each(args, smell);
        if (out) {
            where = 'in argument ' + where;
        }
    }

    msg && console.log('_sniff %s: %s %s', msg, (where ? where : 'odourless'), (Transaction.retrieveConnection(out) ?
    '[object Trasaction:' + Transaction.retrieveConnection(out).transactionId + ']' : 'and disconnected'));
    return out;
};

module.exports = Transaction;
