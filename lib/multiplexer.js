var FN = 'function',

    util = require('./util'),
    db = require('./db'),

    DEFAULT_REPL_SOURCE_CFG = {
        enabled: true,
        canRetry: true,
        removeNodeErrorCount: 5,
        restoreNodeTimeout: (1000 * 60 * 5),
        defaultSelector: 'RR'
    },

    redeffer, // fn
    Multiplexer; // constructor

/**
 * Internal function that allows to use promises model on model functions
 *
 * @param  {Deffer} defer
 * @param  {Multiplexer} multiplexer
 * @param  {boolean} nowrap
 *
 * @todo remove nowrap when all model methods support transactiin Id in parameters
 */
redeffer = function (defer, multiplexer, nowrap) {
    defer.exec = function (callback) {
        multiplexer._connect(function (error, threadId) {
            if (error) { return callback(error); }

            defer.constructor.prototype.exec.call(defer, function (/*err, result*/) {
                multiplexer._disconnect(threadId);
                var args = util.args2arr(arguments);
                !nowrap && (args[1] = util.wrapquery(args[1], threadId));
                callback && callback.apply(this, args);
            }, threadId);
        });
    };

    return defer;
};

/**
 * Allows one to route different ORM operations to specific database pools.
 * @constructor
 *
 * @param {Waterline.Model} model
 *
 * @throws {Error} If sourceName does not refer to any pool iitialised during ORM setup from `replica` config.
 */
Multiplexer = function (model) {
    this._model = model;
};

util.extend(Multiplexer, {
    /**
     * @type {boolean} flag to check whether replication is to be used or not
     * @private
     */
    _replication: false,

    /**
     * Stores all the pools of sources defined in replica set configuration.
     * @private
     *
     * @type {object}
     */
    source: db.oneDumbSource,
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
        if (!config) { return; }

        var replConfig,
            peerNames,

            sanitisePeerConfig; // fn

        // set default for configuration objects and also clone them
        // ---------------------------------------------------------

        // clone and set defaults for the configuration variables.
        config = util.clone(config); // clone config. do it here to clone replication config too
        replConfig = util.fill(config.replication || {
            enabled: false // blank config means replication disabled
        }, DEFAULT_REPL_SOURCE_CFG); // extract repl config from main config
        !replConfig.sources && (replConfig.sources = {}); // set default to no source if none specified
        delete config.replication; // we remove the recursive config from main config clone.

        // in case sources exist (almost unlikely, end them)
        this.source && this.source.end();
        this.source = db.oneDumbSource;

        // replication explicitly disabled or no peers defined. we do this after ending any ongoing sources
        this._replication = !!replConfig.enabled;
        if (this._replication === false) {
            return;
        }

        // create default connection parameters for cluster
        // ------------------------------------------------

        // get the list of peer names defined in sources and setup the config defaults for peer sources
        peerNames = _.filter(Object.keys(replConfig.sources) || [], function (peer) { // remove all disabled peers
            return (peer = replConfig.sources[peer]) && (peer.enabled !== false);
        });

        sanitisePeerConfig = function (peerConfig) {
            return util.fill(util.extend(peerConfig, {
                database: peerConfig._database || config.database, // force db name to be same
                pool: true,
                waitForConnections: true,
                multipleStatements: true
            }), (replConfig.inheritMaster === true) && config);
        };

        // depending upon the number of peers defined, create simple connection or clustered connection
        // --------------------------------------------------------------------------------------------

        // nothing much to do, if there are no replication source defined
        if (peerNames.length === 0) {
            sails && sails.log.info('smt is re-using master as readonly source');
            // if it is marked to inherit master in replication, we simply create a new source out of the master config
            if (replConfig.inheritMaster === true) {
                this.source = db.createSource(sanitisePeerConfig({}));
            }
            return;
        }

        // for a single peer, the configuration is simple, we do not need a cluster but a simple pool
        if (peerNames.length === 1) {
            sails && sails.log.info('smt is using 1 readonly source - ' + peerNames[0]);
            // ensure that the single source's config is taken care of by setting the default and if needed inheriting
            // from master
            this.source = db.createSource(sanitisePeerConfig(replConfig.sources[peerNames[0]]));
            return;
        }

        // iterate over all sources and normalise and validate their configuration
        util.each(replConfig.sources, sanitisePeerConfig);
        sails && sails.log.info('smt is using ' + peerNames.length + ' readonly sources - ' + peerNames.join(', '));

        // create connections for read-replicas and add it to the peering list
        this.source = db.createCluster(replConfig);
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
        try {
            this.source && this.source.end();
        }
        catch (e) { } // nothing to do with error
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
     * Retrieves a new connection for initialising queries from the pool specified as parameter.
     *
     * @param  {function} callback receives `error`, `threadId`, `connection` as parameter
     */
    _connect: function (callback) {
        var self = this;

        Multiplexer.source.getConnection(function (error, connection) {
            if (error) { return callback(error); }

            // give a unique id to the connection and store it if not already
            self._threadId = util.uid();
            Multiplexer.connections[self._threadId] = connection;

            callback(null, self._threadId, connection);
        });
    },

    /**
     * Release the connection associated with this multiplexer
     * @param {string} threadId
     */
    _disconnect: function (threadId) {
        Multiplexer.connections[threadId] && Multiplexer.connections[threadId].release();
        delete Multiplexer.connections[threadId];
    },

    /**
     * Wraps a result with specific thread id for being utilised later as a input to multiplexer instances.
     * @param  {*} query
     * @returns {*} returns the original `query` parameter
     */
    wrap: function (query) {
        return this._threadId && util.wrapquery(query, this._threadId) || query;
    },

    /**
     * @param  {object} critera
     * @param  {function} callback
     */
    findOne: function (criteria, callback) {
        var self = this;

        // if no replica is defined then we use original transaction-less connection
        if (!Multiplexer._replication) {
            return self._model.findOne.apply(self._model, arguments);
        }

        if (typeof callback !== FN) {
            return redeffer(self._model.findOne(criteria), self);
        }

        self._connect(function (error, threadId) {
            if (error) { return callback(error); }

            // call function of underlying model
            self._model.findOne(criteria, function (/*err, result*/) {
                self._disconnect(threadId);
                var args = util.args2arr(arguments);
                args[1] = util.wrapquery(args[1], threadId);
                callback && callback.apply(this, args);
            }, threadId);
        });
    },

    /**
     * @param  {object} criteria
     * @param  {object=} [options] - parameter is optional and can be removed to shift as callback
     * @param  {function} callback
     */
    find: function (criteria, options, callback) {
        var self = this;

        // if no replica is defined then we use original transaction-less connection
        if (!Multiplexer._replication) {
            return self._model.find.apply(self._model, arguments);
        }

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
            return redeffer(self._model.find(criteria, options), self);
        }

        self._connect(function (error, threadId) {
            if (error) { return callback(error); }

            self._model.find(criteria, options, function (/*err, result*/) {
                var args = util.args2arr(arguments);
                args[1] = util.wrapquery(args[1], threadId);
                callback && callback.apply(this, args);
            }, threadId);
        });
    },

    /**
     * @param  {object} critera
     * @param  {function} callback
     */
    count: function (criteria, callback) {
        var self = this;

        // if no replica is defined then we use original transaction-less connection
        if (!Multiplexer._replication) {
            return self._model.count.apply(self._model, arguments);
        }

        if (typeof criteria === FN) {
            callback = criteria;
            criteria = null;
        }

        if (typeof callback !== FN) {
            return redeffer(self._model.count(criteria, null), self, true);
        }

        self._connect(function (error, threadId) {
            if (error) { return callback(error); }

            // call function of underlying model
            self._model.count(criteria, function (/*err, result*/) {
                var args = util.args2arr(arguments);
                callback && callback.apply(this, args); // no need to wrap query since result is an integer
            }, threadId);
        });
    }
});

module.exports = Multiplexer;
