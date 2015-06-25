var FN = 'function',

    util = require('./util'),
    db = require('./db'),

    Multiplexer; // constructor

/**
 * Allows one to route different ORM operations to specific database pools.
 * @constructor
 *
 * @param {Waterline.Model} model
 * @param {string} sourceName
 *
 * @throws {Error} If sourceName does not refer to any pool iitialised during ORM setup from `replica` config.
 */
Multiplexer = function (model, sourceName) {
    if (!Multiplexer.sources[sourceName]) {
        throw 'invalid source name'; // @todo: proper error needed.
    }

    this._model = model;
    this._sourceName = sourceName;
};

util.extend(Multiplexer, {
    /**
     * Stores all the pools of sources defined in replica set configuration.
     * @private
     *
     * @type {object}
     */
    sources: {},
    /**
     * Stores all connections based on its universal thread id (source + threadId).
     * @private
     *
     * @type {object}
     */
    connections: {},

    /**
     * Creates ORM setup sequencing for all replica set pools.
     * @param  {object} config
     */
    setup: function (config) {
        if (!config || !config.replication) { return; }

        var that = this,
            replicaConfig = util.clone(config);

        delete replicaConfig.replication;

        // create connections for read-replicas
        util.each(config.replication.sources, function (subConfig, sourceId) {
            that.sources[sourceId] = db.createSource(util.extend(util.clone(replicaConfig), {
                host: subConfig.host,
                user: subConfig.user,
                password: subConfig.password,
                pool: true, // cannot get thread id without pooling
                multipleStatements: true,
                waitForConnections: true
            }));
        });
    },

    /**
     * ORM teardown sequencing for all replica set pools
     */
    teardown: function () {
        // release all pending connections
        util.each(this.connections, function (connection, threadId, connections) {
            try {
                connection.release();
            }
            catch (e) { } // nothing to do with error
            delete connections[threadId];
        });

        // execute end on the db. will end pool if pool, or otherwise will execute whatever `end` that has been
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
     * Retrieves a new connection for initialising queries from the pool specified as parameter.
     *
     * @param  {Multiplexer} instance
     * @param  {function} callback receives `error`, `threadId`, `connection` as parameter
     */
    connect: function (instance, callback) {
        var self = this;

        self.sources[instance._sourceName].getConnection(function (error, connection) {
            if (error) { return callback(error); }

            // give a unique id to the connection and store it if not already
            instance._threadId = instance._sourceName + connection.threadId;
            self.connections[instance._threadId] = connection;

            callback(null, self._threadId, connection);
        });
    },

    disconnect: function (instance) {
        this.connections[instance._threadId].release();
        delete this.connections[instance._threadId];
    },

    /**
     * Returns the corresponding connection associated with a universal thread id.
     *
     * @param  {string} id
     * @returns {mysql.Connection}
     */
    retrieveConnection: function (id) {
        return this.connections[id];
    }
});

util.extend(Multiplexer.prototype, {
    /**
     * Wraps a result with specific thread id for being utilised later as a input to multiplexer instances.
     * @param  {*} query
     * @returns {*} returns the original `query` parameter
     */
    wrap: function (query) {
        if (!Multiplexer.connections[this._threadId]) {
            // @todo: move to errors.js
            throw 'Unable to locate associated connection with query.';
        }

        return util.wrapquery(query, this._threadId);
    },

    /**
     * @param  {object} critera
     * @param  {function} callback
     */
    findOne: function (criteria, callback) {
        var self = this,
            defer;

        if (typeof callback !== FN) {
            defer = self._model.findOne(criteria);

            defer.exec = function (cb) {
                Multiplexer.connect(self, function (error, threadId) {
                    if (error) { return cb(error); }

                    defer.constructor.prototype.exec.call(defer, function (err, result) {
                        Multiplexer.disconnect(self);
                        cb && cb(err, util.wrapquery(result, threadId));
                    }, threadId);
                });
            };

            return defer;
        }

        Multiplexer.connect(self, function (error, threadId) {
            if (error) { return callback(error); }

            // call function of underlying model
            self._model.findOne(criteria, function (err, result) {
                Multiplexer.disconnect(self);
                callback(err, util.wrapquery(result, threadId));
            }, threadId);
        });
    },

    /**
     * @param  {object} criteria
     * @param  {object=} [options] - parameter is optional and can be removed to shift as callback
     * @param  {function} callback
     */
    find: function (criteria, options, callback) {
        var self = this,
            defer;

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
            // throw 'Promises not supported, yet!'; // @todo: implement
            defer = self._model.find(criteria, options);

            defer.exec = function (cb) {
                Multiplexer.connect(self, function (error, threadId) {
                    if (error) { return cb(error); }

                    defer.constructor.prototype.exec.call(defer, function (err, result) {
                        Multiplexer.disconnect(self);
                        cb && cb(err, util.wrapquery(result, threadId));
                    }, threadId);
                });
            };

            return defer;
        }

        Multiplexer.connect(self, function (error, threadId) {
            if (error) { return callback(error); }

            self._model.find(criteria, options, function (err, result) {
                Multiplexer.disconnect(self);
                callback(err, util.wrapquery(result, threadId));
            }, threadId);
        });
    }
});

module.exports = Multiplexer;
