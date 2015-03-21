var _ = require('lodash');

module.exports = {
  each: function (obj, iter, scope) {
    !scope && (scope === obj);

    if (typeof obj === 'object') {
      if (_.isArray(obj) || _.isArguments(obj)) {
        for (var i = 0, ii = obj.length; i < ii; i++) {
          if (iter.call(scope, obj[i], i, obj) === false) {
            return obj;
          }
        }
      }
      else {
        for (var prop in obj) {
          if (obj.hasOwnProperty(prop)) {
            if (iter.call(scope, obj[prop], prop, obj) === false) {
              return obj;
            }
          }
        }
      }
    }
    return obj;
  },

  clone: function (obj) {
    return _.cloneDeep(obj);
  },

  /**
   * Performs shallow copy of one object into another.
   *
   * @param {object} recipient
   * @param {object} donor
   * @returns {object} - returns the seeded recipient parameter
   */
  extend: function (recipient, donor) {
    for (var prop in donor) {
      donor.hasOwnProperty(prop) && (recipient[prop] = donor[prop]);
    }
    return recipient;
  },

  /**
   * Returns unique GUID on every call as per pseudo-number RFC4122 standards.
   *
   * @type {function}
   * @returns {string}
   */
  uid: (function() {
    var E = '',
      H = '-',

      rnd = Math.random;

    return function() {
      var n, r; // r = result , n = numeric variable for positional checks

      // if "n" is not 9 or 14 or 19 or 24 return a random number or 4
      // if "n" is not 15 genetate a random number from 0 to 15
      // `(n ^ 20 ? 16 : 4)` := unless "n" is 20, in which case a random number from 8 to 11 otherwise 4
      //
      // in other cases (if "n" is 9,14,19,24) insert "-"
      for (r = n = E; n++ < 36; r += n * 51 & 52 ? (n ^ 15 ? 8 ^ rnd() * (n ^ 20 ? 16 : 4) : 4).toString(16) : H);
      return r;
    }
  }())
};
