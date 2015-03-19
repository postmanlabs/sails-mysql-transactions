# Sails MySQL Transactional ORM

`sails-mysql-transaction` is a Sails ORM Adapter for MySQL with transaction support.

This adapter essentially __wraps__ around the popular `sails-mysql` adapter and provides additional API to perform 
operations that ties around a database transaction.

## Installation

1. Add `sails-mysql-transactions` to your application’s `package.json`. Do not run install directly if `sails` is not 
already installed in your package.


2. If you already have `sails-mysql` installed, it might interfere with operations of this module. Remove it from your 
`package.json` and uninstall the same using `npm remove sails-mysql`.

3. This package installs successfully only when sails is already installed in the package. If the package is already installed, then simply run `npm install sails-mysql-transactions --save`, otherwise run `npm install` and it will take 
care of rest.

### Installation Notes:

This package overwrites the `waterline` module inside Sails with a fork of Waterline maintained by Postman. As such, 
if you ever re-install or update sails, ensure you re-install this adapter right after it. 

Do check SailsJS compatibility list before upgrading your Sails version while already using this adapter.

## Using this adapter

The integration test Sails App located in `tests/integration` directory of this repository has a fully functional
installation.

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
			database: '{{your-db-tablename}}'
		}
	},

	models: {
		connection: 'mySQLT',
		migrate: 'drop'
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

### Use Transactions in your controllers

```javascript
var Transaction = require('sails-mysql-transactions').Transaction;

module.exports = {
  create: function (req, res) {
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      OneModel.create(transaction.wrap(req.params.all()), function (err, modelInstance) {
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

### Using transaction specific API (proposed)

```javascript
route = function (req, res) {
	Transaction.start(function (err, transaction) {
		OneModel.transact(transaction).create(/* ... */);
		OneModel.transact(transaction).update(/* ... */);
		OneModel.transact(transaction).find(/* ... */);
		OneModel.transact(transaction).findOne(/* ... */);
	});
};