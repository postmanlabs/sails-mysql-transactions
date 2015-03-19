/**
 * UserController
 *
 * @description :: Server-side logic for managing users
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var transaction = require('sails-mysql-transactions').Transaction;

module.exports = {
  /**
   * 1. Create user
   * 2. Create a collection that belongs to the user
   * 3. Create a request that belongs to the collection
   * @param req
   * @param res
   * @returns {Object} object containing user, collection and request
   */
  create: function (req, res) {

    User.startTransaction(function (err, trans) {
      if (err) {
        trans.rollback();
        return res.serverError(err);
      }

      User.create(trans.act(req.params.all()), function (err, user) {
        if (err) {
          trans.rollback();
          return res.serverError(err);
        }

        Collection.create(trans.act({
          user: user,
          name: 'collection:' + user.id
        }), function (err, collection) {
          if (err) {
            trans.rollback();
            return res.serverError(err);
          }

          Request.create(trans.act({
            name: 'request:' + user.id + ':' + collection.id,
            user: user
          }), function (err, request) {
            if (err) {
              trans.rollback();
              return res.serverError(err);
            }

            collection.requests.add(request.id);
            console.log('====== save start =======');
            collection.save(function (err, collection) {
              if (err) {
                trans.rollback();
                return res.serverError(err);
              }

              console.log('====== save end =======');
              trans.commit(function (err) {
                if (err) {
                  return res.serverError(err);
                }
                return res.json({
                  user: user,
                  collection: collection,
                  request: request
                });
              });
            }, trans);
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
    transaction.start(function (err, trans) {
      if (err) {
        trans.rollback();
        return res.serverError(err);
      }

      User.update(req.param('id'), trans.act(req.params.all()), function (err, users) {
        if (err) {
          trans.rollback();
          return res.serverError(err);
        }

        User.findOne({
          id: users[0].id
        }, undefined, trans.connection().transactionID)
          .populate('collections')
          .exec(function (err, user) {
            if (err) {
              trans.rollback();
              return res.serverError(err);
            }

            async.each(user.collections, function (collection, cb) {
              if (err) { return cb(err); }
              Request.update({collection: collection.id}, trans.act({updated: true})).exec(function (err, requests) {
                if (err) { return cb(err); }

                collection.name += ' - updated';
                collection.transactionID = trans.connection().transactionID;
                collection.save(function (err, collection) {
                  return cb(err);
                });
              });
            }, function (err) {
              if (err) {
                trans.rollback();
                return res.serverError(err);
              }

              trans.commit();
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
    transaction.start(function (err, trans) {
      if (err) {
        trans.rollback();
        return res.serverError(err);
      }

      User
        .findOne(req.param('id'), undefined, trans.connection().transactionID)
        .populate('collections')
        .then(function (user) {
          var requests = Request.find({
            collection: _.pluck(user.collections, 'id')
          }, undefined, undefined, trans.connection().transactionID)
            .then(function (requests) {
              return requests;
            });

          var collections = _.cloneDeep(user.collections);
          return [_.omit(user, 'collections'), collections, requests];
        })
        .spread(function (user, collections, requests) {
          user.transactionID = trans.connection().transactionID; // @todo - inject

          Request.destroy(trans.act(_.pluck(requests, 'id')))
            .then(function () {
              return Collection.destroy(trans.act(_.pluck(collections, 'id')));
            })
            .then(function () {
              return user.destroy();
            })
            .then(function () {
              trans.commit();
              return res.json({
                deleted: true
              });
            });

          //Promise.all([
          //  Request.destroy(trans.act(_.pluck(requests, 'id'))),
          //  Collection.destroy(trans.act(_.pluck(collections, 'id'))),
          //  user.destroy()
          //])
        })
        .catch(function (err) {
          if (err) {
            trans.rollback();
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

