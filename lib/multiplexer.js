var nonObjectCriteriaTypes = { // object to validate types
        string: true,
        number: true,
        boolean: true
    },

    FN = 'function',

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

    retrieveConnection: function (id) {
        return Multiplexer.connections[id];
    }
});

util.extend(Multiplexer.prototype, {
    _wrap: function (query) {
        var conn = Multiplexer.connections[this._threadId];

        if (conn) {
            // if query is string or number, we convert it to an object and store transaction id in them.
            query = nonObjectCriteriaTypes[typeof query] && {
                id: query
            } || query; // else inject transactionId.

            // save transaction id to query and return
            query && (query.transactionId = conn.threadId2);
        }
        // it is expected that user starts a transaction before acting upon it. but if the user hasn't, we cannot throw
        // error. we should raise a warning.
        else {
            throw 'not ready?'; // @todo: proper error
        }

        return query;
    },

    _connect: function (callback) {
        var self = this;

        Multiplexer.sources[self._sourceName].getConnection(function (error, connection) {
            if (error) {
                return callback(error);
            }

            // give a unique id to the connection and store it if not already
            if (!connection.uthreadId) {
                connection.uthreadId = util.uid();
                self._threadId = connection.uthreadId;
                Multiplexer.connections[connection.uthreadId] = connection;
            }

            callback(null, connection);
        });
    },

    findOne: function (criteria, callback) {
        var self = this;

        self._connect(function (error) {
            if (error) { return callback(error); }
            self._model.findOne(criteria, function (err, result) {
                callback(err, self._wrap(result));
            }, self._threadId);
        });
    },

    // @todo trap when criteria is blank
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

        self._connect(function (error) {
            if (error) { return callback(error); }
            self._model.find(criteria, options, function (err, result) {
                callback(err, self._wrap(result));
            }, self._threadId);
        });
    }
});

module.exports = Multiplexer;
