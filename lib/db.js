var mysql = require('mysql');

module.exports = {
    createSource: function (config) {
      // If the config says pooling is enabled, we simply create a pool and return
      if (config.pool) {
        return mysql.createPool(config);
      }
      // rewrite / reduce config for pool-less connections
      else {
        config = {
          host: config.host,
            user: config.user,
          password: config.password,
          database: config.database,
          multipleStatements: true,
        };
      }

      // otherwise, we create an object that mimics the api of pool, but returns new connections instead of
      // from a pool
      return {
        getConnection: function (callback) {
          var conn,
              error;

          try {
            conn = mysql.createConnection(config);

            // override the `release` function to allow release to act as `end` and as such mimic the pool
            // api.
            conn._release = conn.release;
            conn.release = conn.end;
          }
          catch (err) {
            error = err;
          }

          callback(error, conn);
        },

        end: function () {

        }
      };
    }
};
