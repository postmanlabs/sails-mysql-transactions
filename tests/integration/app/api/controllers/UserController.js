/**
 * UserController
 *
 * @description :: Server-side logic for managing users
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var Transaction = require('sails-mysql-transactions').Transaction;

module.exports = {
  analytics_readonly: function (req, res) {
    User.readonly('set1').count(function (err, count) {
      if (err) {
        return res.serverError(err);
      }
      res.json({
        users: count
      });
    });
  },

  analytics: function (req, res) {
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      User.transact(transaction).count(function (err, userCount) {
        if (err) {
          return transaction.rollback(function () {
            res.serverError(err);
          });
        }

        Collection.transact(transaction).count(function (err, collectionCount) {
          if (err) { return transaction.rollback(function () { res.serverError(err); }); }

          transaction.commit(function (err) {
            if (err) { return res.serverError(err); }
            res.json({
              count: {
                users: userCount,
                collections: collectionCount
              }
            });
          });
        });
      });

    });
  },

  retrieve: function (req, res) {
    User.readonly('set1').findOne(req.param('id')).exec(function (err, user) {
      if (err) {
        return res.serverError(err);
      }
      res.json(user);
    });
  },

  /**
   * 1. Create user
   * 2. Create a collection that belongs to the user
   * 3. Create a request that belongs to the collection
   * @param req
   * @param res
   * @returns {Object} object containing user, collection and request
   */
  create: function (req, res) {

    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      User.transact(transaction).findOrCreate(req.param('id'), req.params.all(), function (err, user) {
        if (err) {
          transaction.rollback();
          return res.serverError(err);
        }

        Collection.transact(transaction).create({
          user: user,
          name: 'collection: ' + user.id
        }, function (err, collection) {
          if (err) {
            transaction.rollback();
            return res.serverError(err);
          }

          Request.transact(transaction).create({
            name: 'request: ' + user.id + ' - ' + collection.id,
            user: user
          }, function (err, request) {

            if (err) {
              transaction.rollback();
              return res.serverError(err);
            }

            collection.requests.add(request.id);
            collection.save(function (err, collection) {
              if (err) {
                transaction.rollback();
                return res.serverError(err);
              }

              transaction.commit(function (err) {
                if (err) {
                  return transaction.serverError(err);
                }

                return res.json({
                  user: user,
                  collection: collection,
                  request: request
                });
              });
            });
          });
        });
      });
    });
  },

  /**
   * Create without transactions, till the save method works as part of the transaction
   * @param req
   * @param res
   */
  create_direct: function (req, res) {
    User.create(req.params.all(), function (err, user) {
      if (err) {
        return res.serverError(err);
      }

      Collection.create({
        user: user,
        name: 'collection:' + user.id
      }, function (err, collection) {
        if (err) {
          return res.serverError(err);
        }

        Request.create({
          name: 'request:' + user.id + ':' + collection.id,
          user: user
        }, function (err, request) {
          if (err) {
            return res.serverError(err);
          }

          collection.requests.add(request.id);
          collection.save(function (err, collection) {
            if (err) {
              return res.serverError(err);
            }

            return res.json({
              user: user,
              collection: collection,
              request: request
            })
          });
        });
      });
    });
  },

  update: function (req, res) {
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }
      User.transact(transaction).update(req.param('id'), req.params.all(), function (err, users) {
        if (err) {
          transaction.rollback();
          return res.serverError(err);
        }

        User.transact(transaction).findOne(users[0].id)
          .populateSome({
            collections: {
              select: ['name']
            },
            teams: {
              select: ['mascot', 'name']
            }
          })
          .exec(function (err, user) {
            if (err) {
              transaction.rollback();
              return res.serverError(err);
            }

            async.each(user.collections, function (collection, cb) {
              Request.transact(transaction).update({collection: collection.id}, {updated: true}).exec(function (err) {
                if (err) {
                  transaction.rollback();
                  return cb(err);
                }
                transaction.wrap(collection);
                collection.name += ' - updated';
                collection.save(cb);

              });
            }, function (err) {
              if (err) {
                transaction.rollback();
                return res.serverError(err);
              }

              transaction.commit();

              return res.json(user);
            });
          });
      });
    });
  },

  update_direct: function (req, res) {
    User.update(req.param('id'), req.params.all(), function (err, users) {
      if (err) {
        return res.serverError(err);
      }

      User.findOne(users[0].id)
        .populate('collections')
        .exec(function (err, user) {
          if (err) {
            return res.serverError(err);
          }

          async.each(user.collections, function (collection, cb) {
            if (err) { return cb(err); }
            Request.update({collection: collection.id}, {updated: true}).exec(function (err, requests) {
              if (err) { return cb(err); }

              collection.name += ' - updated';

              collection.save(function (err, collection) {
                return cb(err);
              });
            });
          }, function (err) {
            if (err) {
              return res.serverError(err);
            }

            return res.json(user);
          });
        });
    });
  },

  /**
   * Written with promises just for some variety
   * @param req
   * @param res
   */
  destroy: function (req, res) {
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      User.transact(transaction)
        .findOne(req.param('id'))
        .populate('collections')
        .then(function (user) {
          var requests = Request.transact(transaction).find({
            collection: _.pluck(user.collections, 'id')
          }).then(function (requests) {
            return requests;
          });

          var collections = _.cloneDeep(user.collections);
          return [_.omit(user, 'collections'), collections, requests];
        })
        .spread(function (user, collections, requests) {
          Promise.all([
            user.destroy(),
            Collection.transact(transaction).destroy(_.pluck(collections, 'id')),
            Request.transact(transaction).destroy(_.pluck(requests, 'id'))
          ]).then(function () {
            transaction.commit();
            return res.json({});
          });
        })
        .catch(function (err) {
          if (err) {
            transaction.rollback();
            return res.serverError(err);
          }
        });
    });
  },

  destroy_direct: function (req, res) {
    User
      .findOne(req.param('id'))
      .populate('collections')
      .then(function (user) {
        var requests = Request.find({
          collection: _.pluck(user.collections, 'id')
        }).then(function (requests) {
          return requests;
        });

        var collections = _.cloneDeep(user.collections);
        return [_.omit(user, 'collections'), collections, requests];
      })
      .spread(function (user, collections, requests) {
        Promise.all([
          user.destroy(),
          Collection.destroy(_.pluck(collections, 'id')),
          Request.destroy(_.pluck(requests, 'id'))
        ]).then(function () {
          return res.json({});
        });
      })
      .catch(function (err) {
        if (err) {
          return res.serverError(err);
        }
      });
  }
};

