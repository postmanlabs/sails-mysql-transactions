/**
 * Collection.js
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
    requests: {
      collection: 'Request',
      via: 'collection'
    },
    transactionID: {
      type: 'string'
    }
  },

  createInstance: function (user, cb) {
    Collection.create({
      name: 'collection:' + user.id
    }, function (err, collection) {
      if (err) { return cb(err); }

      user.collections.add(collection.id);
      user.save(function (err, user) {
        if (err) { return cb(err); }

        Request.createInstance(user, collection, cb);
      });
    });
  }
};

