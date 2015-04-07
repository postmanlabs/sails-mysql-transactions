/**
 * TeamController
 *
 * @description :: Server-side logic for managing teams. Useful for testing many-to-many associations.
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

var Transaction = require('sails-mysql-transactions').Transaction;

module.exports = {
  create: function (req, res) {

    // start a transaction
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }

      // create a new team instance in a transactional way.
      Team.transact(transaction).findOrCreate(req.param('id'), req.params.all(), function (err, team) {
        if (err) {
          transaction.rollback();
          return res.serverError(err);
        }

        transaction.commit();
        return res.json(team);
      });
    });

    //// Promises are unsupported
    //Transaction.start(function (err, transaction) {
    //  if (err) {
    //    transaction && transaction.rollback()
    //    return res.serverError(err);
    //  }
    //
    //  Team.transact(transaction).create(req.params.all())
    //    .then(function (team) {
    //      transaction.commit();
    //      return res.json(team);
    //    })
    //    .catch(function (err) {
    //      if (err) {
    //        transaction.rollback();
    //        return res.serverError(err);
    //      }
    //    });
    //});
  },

  update: function (req, res) {
      Transaction.start(function (err, transaction) {
          if (err) {
            return res.serverError(err);
          }

          Team.transact(transaction).update(req.param('id'), req.params.all(), function (err, team) {
              if (err) {
                  return transaction.rollback(function (rollErr) {
                      res.serverError((rollErr && (err.rollbackError = rollErr), err));
                  });
              }

              res.json(team);
          });
      });
  },

  create_direct: function (req, res) {
    Team.create(req.params.all(), function (err, team) {
      if (err) {
        return res.serverError(err);
      }

      return res.json(team);
    });
  },


  add_member: function (req, res) {
    Transaction.start(function (err, transaction) {
      if (err) {
        transaction && trans.rollback();
        return res.serverError(err);
      }

      Team.transact(transaction).findOne(req.param('id'))
        .populate('members')
        .exec(function (err, team) {
          if (err) {
            transaction.rollback();
            return res.serverError(err);
          }

          team.members.add(req.param('member_id'));
          team.transactionId = transaction.connection().transactionId;

          team.save(function (err, team) {
            if (err) {
              transaction.rollback();
              return res.serverError(err);
            }

            transaction.commit();
            return res.json(team);
          });
        });
    });
  },

  remove_member: function (req, res) {

    Transaction.start(function (err, transaction) {

      if (err) {
        transaction && transaction.rollback();
        return res.serverError(err);
      }


      Team.transact(transaction)
        .findOne(req.param('id'))
        .populate('members')
        .exec(function (err, team) {
          if (err) {
            transaction.rollback();
            return res.serverError(err);
          }

          team.members.remove(req.param('member_id'));
          team.transactionId = transaction.connection().transactionId;

          team.save(function (err, team) {
            if (err) {
              transaction.rollback();
              return res.serverError(err);
            }

            transaction.commit();
            return res.json(team);
          });
        });
    });
  },

  add_member_direct: function (req, res) {
    Team.findOne(req.param('id')).populate('members').exec(function (err, team) {
      if (err) {
        return res.serverError(err);
      }

      team.members.add(req.param('member_id'));
      team.save(function (err, team) {
        if (err) {
          return res.serverError(err);
        }

        return res.json(team);
      });
    });
  }
};

