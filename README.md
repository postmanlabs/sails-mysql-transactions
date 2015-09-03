<img src="https://travis-ci.org/postmanlabs/sails-mysql-transactions.svg?branch=master" align="right" />

# Sails MySQL Transactional ORM with replication support

`sails-mysql-transaction` is a Sails ORM Adapter for MySQL with transaction and replication cluster support.

This adapter essentially __wraps__ around the popular `sails-mysql` adapter and provides additional API to perform 
operations that ties around a database transaction. It also provides to read from a cluster of read-replicas in a
load-balanced fashion.

## Installation

1. Add `sails-mysql-transactions` to your application’s `package.json`. Do not run install directly if `sails` is not 
already installed in your package.


2. If you already have `sails-mysql` installed, it might interfere with operations of this module. Remove it from your 
`package.json` and uninstall the same using `npm remove sails-mysql`.

3. This package installs successfully only when sails is already installed in the package. If the package is already
installed, then simply run `npm install sails-mysql-transactions --save`, otherwise run `npm install` and it will take
care of rest.

## Safe install using postinstall script

If `npm install` seems erratic to install dependencies in order, you could add the following in your `package.json` as 
a [postinstall script of npm](https://docs.npmjs.com/misc/scripts). This would ensure that this module is installed after 
sails has been completely installed. Note that in this method, you would not need to add `sails-mysql-transactions` as a 
dependency in your package.json

```
{
  "scripts": {
    "postinstall": "npm install sails-mysql-transactions"
  }
}
```

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

      transactionConnectionLimit: 10,
      rollbackTransactionOnError: true,

      /* this section is needed only if replication feature is required */
      replication: {
        enabled: true,
        inheritMaster: true,
        canRetry: true,
        removeNodeErrorCount: 5,
        restoreNodeTimeout: 1000 * 60 * 5,
        defaultSelector: 'RR', // 'RANDOM' or 'ORDER'
        sources: { 
          readonly: {
            enabled: true,
            host: '{{replica-1-host}}',
            user: '{{replica-1-user}}',
            password: '{{replica-1-password}}'
          }
        }
      }
		}
	},

	models: {
		connection: 'mySQLT'
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

        // using transaction to update another model and using the promises architecture
        AnotherModel.transact(transaction).findOne(req.param('id')).exec(function (err, anotherInstance) {
          if (err) {
            transaction.rollback();
            return res.serverError(err);
          }

          // using update and association changes
          modelInstance.someAssociatedModel.remove(req.param('remove_id'));

          // standard .save() works when in transaction
          modelInstance.save(function (err, savedModel) {
            if (err) {
              transaction.rollback();
              return res.serverError(err);
            }

            // finally commit the transaction before sending response
            transaction.commit();
            return res.json({
              one: savedModel,
              another: anotherInstance
            });
          });
        });
      });
    });
  }
};
```

#### List of available transactional operations:

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
were either stemmed from the same transaction or wrapped (`transaction.wrap(instance)`) by a transaction.


### Exceptions where transactions may fail

In cases where you are performing model instance opertaions such as `save`, `destroy`, etc on instances that has been
stemmed from a `.populate`, transaction might fail. In such scenarios, performing a `transaction.wrap(instance);` before
doing instance operations should fix such errors.

If you want to selectively intercept errors from this module, compare using `instanceof Transaction.AdapterError`.


## Support for Read Replicas

When one or more read replica sources are provded, the following API can be used to access data from one of the defined
replication source databases. This distributes your database workloads across multiple systems.

Readonly still works without read replica using the normal non-transactional connection set.

```javascript
route = function (req, res) {
  OneModel.readonly().find();
  OneModel.readonly().findOne();
};
```


## Contributing

Contribution is accepted in form of Pull Requests that passes Travis CI tests. You should install this repository using
`npm install -d` and run `npm test` locally before sending Pull Request.