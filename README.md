<img src="https://travis-ci.org/postmanlabs/sails-mysql-transactions.svg?branch=master" align="right" />

# Sails MySQL Transactional ORM

`sails-mysql-transaction` is a Sails ORM Adapter for MySQL with transaction support.

This adapter essentially __wraps__ around the popular `sails-mysql` adapter and provides additional API to perform 
operations that ties around a database transaction.

## Installation

1. Add `sails-mysql-transactions` to your application’s `package.json`. Do not run install directly if `sails` is not 
already installed in your package.


2. If you already have `sails-mysql` installed, it might interfere with operations of this module. Remove it from your 
`package.json` and uninstall the same using `npm remove sails-mysql`.

3. This package installs successfully only when sails is already installed in the package. If the package is already
installed, then simply run `npm install sails-mysql-transactions --save`, otherwise run `npm install` and it will take
care of rest.

### Installation Notes:

This package overwrites the `waterline` module inside Sails with a fork of Waterline maintained by Postman. As such, 
if you ever re-install or update sails, ensure you re-install this adapter right after it. 

Do check SailsJS compatibility list before upgrading your Sails version while already using this adapter.

## Quick Start

The integration test Sails App located in `tests/integration/app` directory of this repository has a fully functional
installation. Simply run `npm install` within `test/integration/app` directory.

### Sails config/local.js

```js
module.exports = {
  /* your other config stay as is */
  
  connections: {
		mySQLT: {
			adapter: 'sails-mysql-transactions',
			host: '{{your-db-host}}',
			user: '{{your-db-username}}',
			password: '{{your-db-password}}',
			database: '{{your-db-tablename}}',
			rollbackTimeout: 30000 // msec
		}
	},

	models: {
		connection: 'mySQLT',
		migrate: 'safe'
	}
}
```

### Add transactionId column to all models

```js
module.exports = {
  schema: true,
  autosubscribe: false,
  attributes: {
    property_one: {
      type: 'string'
    },
    property_two: {
      type: 'boolean',
      defaultsTo: false
    },

    transactionId: {
      type: 'string'
    }
  }
};
```

### Use Transaction in your controllers

```javascript
var Transaction = require('sails-mysql-transactions').Transaction;

module.exports = {
  create: function (req, res) {
    // start a new transaction
    Transaction.start(function (err, transaction) {
      if (err) {
        // the first error might even fail to return a transaction object, so double-check.
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      OneModel.transact(transaction).create(req.params.all(), function (err, modelInstance) {
        if (err) {
          transaction.rollback();
          return res.serverError(err);
        }

        transaction.commit();
        return res.json(modelInstance);
      });
    });
  }
};
```

### List of available transactional operations:

```javascript
route = function (req, res) {
	Transaction.start(function (err, transaction) {
		OneModel.transact(transaction).create(/* ... */);
		OneModel.transact(transaction).update(/* ... */);
		OneModel.transact(transaction).find(/* ... */);
		OneModel.transact(transaction).findOrCreate(/* ... */);
		OneModel.transact(transaction).findOne(/* ... */);
		OneModel.transact(transaction).destroy(/* ... */);
	});
};
```

Other than those, `update`, `save` and association operations on instance methods work within transaction provided they
were either stemmed from the same transaction or wrapped (`transaction.wrap(isntance)`) by a transaction.

### Exceptions where transactions may fail

In cases where you are performing model instance opertaions such as `save`, `destroy`, etc on instances that has been
stemmed from a `.populate`, transaction might fail. In such scenarios, performing a `transaction.wrap(instance);` before
doing instance operations should fix such errors.

## Contributing

Contribution is accepted in form of Pull Requests that passes Travis CI tests. You should install this repository using
`npm install -d` and run `npm test` locally before sending Pull Request.