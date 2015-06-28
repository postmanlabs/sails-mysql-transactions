/**
 * This module interfaces with mysql and exposes database connectivity for rest of transaction module. This module
 * also strives to unify the API that is needed to access pooled vs unpooled db connections.
 *
 * @module db
 */
var mysql = require('mysql'),
    errors = require('./errors'),
    db;

db = {
    /**
     * Create a ckuster of pools
     *
     * @param  {object} config
     * @return {mySQL.PoolCluster}
     */
    createCluster: function (config, master) {
        var peerNames = Object.keys(config),
            poolCluster;

        // return undefined if there is no peer config or no master config
        if (peerNames.length === 0 || !master) {
            return {
                getConnection: function (callback) {
                    callback && callback(errors.REPLICATION_NO_SOURCE);
                },
                end: function () {}
            };
        }

        // if there are more than one config, we would load balance
        (peerNames.length > 1) && (poolCluster = mysql.createPoolCluster({
            restoreNodeTimeout: (1000 * 60)
        }));

        // at this point, more than one config exists and as such, it needs load balancing
        peerNames.forEach(function (peerName) {
            var peerConfig = {
                user: config[peerName].user,
                password: config[peerName].password,
                port: config[peerName].port,
                database: master.database,
                pool: true,
                waitForConnections: true
            };

            // if pool cluster is not defined, it implies here that only single connection
            // is needed, so we create one and exit
            poolCluster ? poolCluster.add(peerName, peerConfig) : (poolCluster = db.createSource(peerConfig));
        });

        return poolCluster || {
            getConnection: function (callback) {
                callback && callback(errors.REPLICATION_NO_SOURCE);
            },
            end: function () {}
        };
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

        // rewrite / reduce config for pool-less connections
        config = {
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database,
            multipleStatements: true
        };

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
