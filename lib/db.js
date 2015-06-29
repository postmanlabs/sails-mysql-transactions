/**
 * This module interfaces with mysql and exposes database connectivity for rest of transaction module. This module
 * also strives to unify the API that is needed to access pooled vs unpooled db connections.
 *
 * @module db
 */
var has = 'hasOwnProperty', // for syntactic sugar only

    mysql = require('mysql'),
    errors = require('./errors'),
    db;

db = {
    /**
     * this source is designed to not return any connection and instead
     * pass error to callback.
     *
     * @type {object}
     */
    oneDumbSource: {
        getConnection: function (callback) {
            callback && callback(errors.REPLICATION_NO_SOURCE);
        },
        end: function () {}
    },

    /**
     * Create a ckuster of pools
     *
     * @param  {object} config
     * @return {mySQL.PoolCluster}
     */
    createCluster: function (config, master) {
        var peerNames = Object.keys(config.sources),
            poolCluster;

        // return undefined if there is no peer config or no master config
        if (peerNames.length === 0 || !master) {
            return db.oneDumbSource;
        }

        // if there are more than one config, we would load balance
        (peerNames.length > 1) && (poolCluster = mysql.createPoolCluster({
            canRetry: config[has]('canRetry') ? config.canRetry : true,
            removeNodeErrorCount: config[has]('removeNodeErrorCount') ? config.removeNodeErrorCount : 5,
            restoreNodeTimeout: config[has]('restoreNodeTimeout') ? config.restoreNodeTimeout : (1000 * 60 * 5),
            defaultSelector: config[has]('defaultSelector') ? config.defaultSelector : 'RR'
        }));

        // at this point, more than one config exists and as such, it needs load balancing
        peerNames.forEach(function (peerName) {
            // do not add this peer if it has enabled: false ,arked in config
            if (config.sources[peerName].enabled === false) {
                return;
            }

            var sourceConfig = config.sources[peerName],
                peerConfig = {
                    user: sourceConfig.user,
                    password: sourceConfig.password,
                    port: sourceConfig.port,
                    database: master.database,
                    pool: true,
                    waitForConnections: true,
                    multipleStatements: true
                };

            // allow database name change for debug
            sourceConfig.hasOwnProperty('_database') && (peerConfig.database = sourceConfig._database);

            // if pool cluster is not defined, it implies here that only single connection
            // is needed, so we create one and exit
            poolCluster ? poolCluster.add(peerName, peerConfig) : (poolCluster = db.createSource(peerConfig));
        });

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
