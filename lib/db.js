/**
 * This module interfaces with mysql and exposes database connectivity for rest of transaction module. This module
 * also strives to unify the API that is needed to access pooled vs unpooled db connections.
 *
 * @module db
 */
var mysql = require('mysql'),
    AdapterError = require('./errors'),
    db;

db = {
    /**
     * this source is designed to not return any connection and instead
     * pass error to callback.
     *
     * @type {object}
     */
    oneDumbSource: function () {
        return {
            getConnection: function (callback) {
                callback && callback(new AdapterError(AdapterError.NO_SOURCE));
            },
            end: function () {}
        };
    },

    /**
     * Create a cluster of pools
     *
     * @param  {object} config
     * @return {mySQL.PoolCluster}
     */
    createCluster: function (config) {
        var peerNames = Object.keys(config.sources || (config.sources = {})),
            poolCluster;

        // return undefined if there is no peer config
        if (peerNames.length > 0) {
            poolCluster = mysql.createPoolCluster(config);

            peerNames.forEach(function (peerName) {
                var peerConfig = config.sources[peerName];

                // do not add this peer if it has enabled: false marked in config
                if (!peerConfig || peerConfig.enabled === false) {
                    return;
                }

                // add this peer to cluster
                poolCluster.add(peerName, peerConfig);
            });
        }

        return poolCluster || db.oneDumbSource;
    },
    /**
     * Create db connection source based on configuration parameter provided.
     *
     * @param {object} config mySQL config
     * @returns {mySQL.Source}
     */
    createSource: function (config) {
        // If the config says pooling is enabled, we simply create a pool and return
        if (config.pool) {
            return mysql.createPool(config);
        }

        // otherwise, we create an object that mimics the api of pool, but returns new connections instead of
        // from a pool
        return {
            getConnection: function (callback) {
                var conn,
                    error;

                try {
                    conn = mysql.createConnection(config);
                    // override the `release` function to allow release to act as `end` and as such mimic the pool api.
                    conn._release = conn.release;
                    conn.release = conn.end;
                }
                catch (err) {
                    error = err;
                }

                callback(error, conn);
            },

            // poolless connection source does not require to end, but we still expose the API for parity.
            end: function () { }
        };
    }
};

module.exports = db;
