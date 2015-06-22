var FN = 'function',

    util = require('./util'),
    db = require('./db'),

    Multiplexer; // fn

Multiplexer = function (model, sourceName) {
    if (!Multiplexer.sources[sourceName]) {
        throw 'invalid source name'; // @todo: proper error needed.
    }

    this._model = model;
    this._sourceName = sourceName;
};

util.extend(Multiplexer, {
    sources: {},
    connections: {},

    setup: function (config) {
        if (!config) {
            return;
        }

        var that = this;

        // create connections for read-replicas
        util.each(config.replicas, function (subConfig, sourceId) {
            that.sources[sourceId] = db.createSource(util.extend(util.clone(subConfig), {
                database: config.database,
                adapter: config.adapter
            }));
        });
    },

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

    getConnection: function (sourceName, callback) {
        Multiplexer.sources[sourceName].getConnection(function (error, connection) {
            var threadId;

            if (error) {
                return callback(error);
            }

            // give a unique id to the connection and store it if not already
            threadId = sourceName + connection.threadId;
            this.connections[threadId] = connection;

            callback(null, threadId, connection);
        });
    },

    retrieveConnection: function (id) {
        return this.connections[id];
    }
});

util.extend(Multiplexer.prototype, {
    wrap: function (query) {
        if (!Multiplexer.connections[this._threadId]) {
            // @todo: move to errors.js
            throw 'Unable to locate associated connection with query.';
        }

        return util.wrapquery(query, this._threadId);
    },

    findOne: function (criteria, callback) {
        var self = this;

        if (typeof callback !== FN) {
            throw 'Promises not supported, yet!'; // @todo: implement
        }

        Multiplexer.getConnection(function (error, threadId) {
            if (error) { return callback(error); }
            // call function of underlying model
            self._model.findOne(criteria, function (err, result) {
                callback(err, util.wrapquery(result, threadId));
            }, threadId);
        });
    },

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
            throw 'Promises not supported, yet!'; // @todo: implement
        }

        Multiplexer.getConnection(function (error, threadId) {
            if (error) { return callback(error); }
            self._model.find(criteria, options, function (err, result) {
                callback(err, util.wrapquery(result, threadId));
            }, threadId);
        });
    }
});

module.exports = Multiplexer;
