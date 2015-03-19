var util = require('./util'),
  _ = require('lodash'),
  arrProtoSlice = Array.prototype.slice,
  Transaction = require('./transactions'),

  sailsmysql = require('sails-mysql'),
  adapter = util.clone(sailsmysql);

/**
 * The adapter override matrix. This object defines how to handle each individual properties of the mySql adapter.
 * @type {object}
 *
 * @note
 * Object structure within each override are as follows
 * ```
 * 'overrideFunctionName': {
 *   conn: {number} - the argument index where the adapter expects connection parameter
 *   criteria: {number=} - the argument index of a criteria object in the original adapter
 *   probe: {number=} - in case transaction is tied up with values, which argument to probe
 * }
 * ```
 */
util.each({
  addAttribute: {
    conn: 5
  },
  create: {
    probe: 2,
    //criteria: 2, // @todo - analyze. criteria works for add member and probe works for create user
    conn: 4
  },
  count: {
    criteria: 2,
    conn: 4
  },
  createEach: {
    conn: 4
  },
  describe: {
    conn: 3
  },
  define: {
    conn: 4
  },
  drop: {
    conn: 4
  },
  find: {
    conn: 4
  },
  join: {
    criteria: 2,
    conn: 4
  },
  query: {
    conn: 5
  },
  stream: {
    conn: 4
  },
  update: {
    conn: 5,
    probe: 3
  },
  destroy: {
    criteria: 2,
    conn: 4
  }
}, function (override, prop) {
  var _super = adapter[prop];

  // function that sniffs transactions and puts it in place of connection obj
  adapter[prop] = function (connectionName, collectionName) {
    // if connection is already present in arguments, we do not need to extract anything.
    if (!_.isUndefined(arguments[override.conn])) {
      return _super.apply(this, arguments);
    }

    var args = arrProtoSlice.call(arguments),
        id;

    if (override.hasOwnProperty('probe')) {
      id = args[override.probe].transactionID;
    }
    else if (override.hasOwnProperty('criteria')) {
      id = Transaction.extractIdFromCriteria(args[override.criteria]);
    }
    else {
      id = Transaction.sniff(args, 'adapter.' + prop);
    }

    if (Transaction.retrieveConnection(id)) {
      args[override.conn] = Transaction.retrieveConnection(id);
    }

    return _super.apply(this, args);
  };
});


util.extend(adapter, {
  identity: 'sails-mysql-transactions',
  Transaction: Transaction,

  registerConnection: function (config, collections, cb) {
    // setup the transactions class with adapter config
    Transaction.setup(config);

    // Call the core registration function.
    return sailsmysql.registerConnection.apply(this, arguments);
  },

  teardown: function () {
    return sailsmysql.teardown.apply(this, arguments);
  },

  startTransaction: function (connectionName, collectionName, cb) {

    if (typeof cb !== 'function') {
      // @todo defer here
      return;
    }

    new Transaction(function (error, transaction) {
      return cb.apply(this, arguments);
    });
  }
});

adapter.sniff = function() {
  return Transaction.sniff.apply(Transactions, arguments);
};

module.exports = adapter;
