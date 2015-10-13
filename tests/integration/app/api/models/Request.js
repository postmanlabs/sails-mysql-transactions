/**
 * Request.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/#!documentation/models
 */

module.exports = {
  schema: true,
  autosubscribe: false,
  attributes: {
    name: {
      type: 'string'
    },
    user: {
      model: 'User'
    },
    collection: {
      model: 'Collection'
    },
    transactionId: {
      type: 'string'
    }
  },

  createInstance: function (user, collection, cb) {
    Request.create({
      name: 'request:' + user.id + ':' + collection.id,
      user: user
    }, function (err, request) {
      if (err) { return cb(err); }

      collection.requests.add(request.id);
      collection.save(function (err, collection) {
        if (err) { return cb(err); }

        cb(null, collection);
      });
    });
  }
};

