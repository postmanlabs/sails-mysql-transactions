var winston = require('winston');

module.exports = {

  // Your SSL certificate and key, if you want to be able to serve HTTP responses
  // over https:// and/or use websockets over the wss:// protocol
  // (recommended for HTTP, strongly encouraged for WebSockets)
  //
  // In this example, we'll assume you created a folder in your project, `config/ssl`
  // and dumped your certificate/key files there:
  // ssl: {
  //   ca: require('fs').readFileSync(__dirname + './ssl/my_apps_ssl_gd_bundle.crt'),
  //   key: require('fs').readFileSync(__dirname + './ssl/my_apps_ssl.key'),
  //   cert: require('fs').readFileSync(__dirname + './ssl/my_apps_ssl.crt')
  // },
  // ssl: {
  //   key: require('fs').readFileSync(__dirname + '/ssl/sync_ssl.key'),
  //   cert: require('fs').readFileSync(__dirname + '/ssl/sync_ssl.crt')
  // },

  // The `port` setting determines which TCP port your app will be deployed on
  // Ports are a transport-layer concept designed to allow many different
  // networking applications run at the same time on a single computer.
  // More about ports: http://en.wikipedia.org/wiki/Port_(computer_networking)
  //
  // By default, if it's set, Sails uses the `PORT` environment variable.
  // Otherwise it falls back to port 1337.
  //
  // In production, you'll probably want to change this setting
  // to 80 (http://) or 443 (https://) if you have an SSL certificate

  port: process.env.PORT || 1337,

  // The runtime "environment" of your Sails app is either 'development' or 'production'.
  //
  // In development, your Sails app will go out of its way to help you
  // (for instance you will receive more descriptive error and debugging output)0
  //
  // In production, Sails configures itself (and its dependencies) to optimize performance.
  // You should always put your app in production mode before you deploy it to a server-
  // This helps ensure that your Sails app remains stable, performant, and scalable.
  //
  // By default, Sails sets its environment using the `NODE_ENV` environment variable.
  // If NODE_ENV is not set, Sails will run in the 'development' environment.

  environment: process.env.NODE_ENV || 'development',

  connections: {
    mySQLT: {
      adapter: 'sails-mysql-transactions',
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'sails_transactions',

      queryCaseSensitive: true,
      transactionConnectionLimit: 20,
      rollbackTransactionOnError: false,

      replication: {
        enabled: true,
        inheritMaster: true,

        sources: {
          set1: {
            enabled: false,
            host: 'localhost',
            user: 'root',
            password: ''
          },
          set2: {
            host: 'localhost',
            user: 'root',
            password: ''
          }
        }
      }
    }
  },

  models: {
    connection: 'mySQLT',
    migrate: 'drop'
  },

  log: {
    'level': 'info',
    'custom': new (winston.Logger)({
      'transports': [
        new (winston.transports.Console)({
          'level': 'verbose',
          'colorize': true,
          'timestamp': true,
          'json': false
        })
      ]
    })
  }

};
