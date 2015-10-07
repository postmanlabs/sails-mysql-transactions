/**
 * User.js
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
    admin: {
      type: 'boolean',
      defaultsTo: false
    },
    collections: {
      collection: 'Collection',
      via: 'user'
    },
    teams: {
      collection: 'Team',
      via: 'members'
    }
  }
};

