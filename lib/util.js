var _ = require('lodash'),

    nonObjectCriteriaTypes = { // object to validate types of wrapper fn
        string: true,
        number: true,
        boolean: true
    },

    E = '',
    H = '-',
    rnd = Math.random;

module.exports = {
    /**
     * Deep clone an object.
     *
     * @param {object} obj
     * @returns {object}
     */
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
     * Useful function to iterate on array or object with almost same API.
     *
     * @param {object|array} obj
     * @param {function} iter
     * @param {object|function} [scope]
     * @returns {object|array} - the original object passed is returned for chaining.
     */
    each: function (obj, iter, scope) {
        var i,
            ii;

        !scope && (scope === obj);

        // proceed only when object passed is truly an object (array too is an object, in case it wasn't clear.)
        if (typeof obj !== 'object') {
            return obj;
        }

        if (_.isArray(obj) || _.isArguments(obj)) {
            for (i = 0, ii = obj.length; i < ii; i++) {
                if (iter.call(scope, obj[i], i, obj) === false) {
                    return obj;
                }
            }
        }
        else {
            for (i in obj) {
                if (obj.hasOwnProperty(i)) {
                    if (iter.call(scope, obj[i], i, obj) === false) {
                        return obj;
                    }
                }
            }
        }
        return obj;
    },

    /**
     * Returns unique GUID on every call as per pseudo-number RFC4122 standards.
     *
     * @type {function}
     * @returns {string}
     */
    uid: function () {
        var n, r; // r = result , n = numeric variable for positional checks

        // if "n" is not 9 or 14 or 19 or 24 return a random number or 4
        // if "n" is not 15 generate a random number from 0 to 15
        // `(n ^ 20 ? 16 : 4)` := unless "n" is 20, in which case a random number from 8 to 11 otherwise 4
        //
        // in other cases (if "n" is 9,14,19,24) insert "-"
        /* jshint noempty: false */// jscs:disable
        for (r = n = E; n++ < 36; r += n * 51 & 52 ? (n ^ 15 ? 8 ^ rnd() * (n ^ 20 ? 16 : 4) : 4).toString(16) : H) { }
        // jscs:enable
        return r;
    },

    /**
     * This function accepts a deffer and a transaction object. It returns the same deffer object, but its `exec`
     * function gets overridden to wrap the results before executing the exec callback.
     *
     * @param {deffer} defer
     * @param {object} wrapper
     * @returns {deffer}
     */
    redeffer: function (defer, wrapper) {
        defer.exec = function (callback) {
            defer.constructor.prototype.exec.call(defer, function (err, result) {
                callback && callback(err, wrapper.wrap(result));
            });
        };
        return defer;
    },

    /**
     * Use this function on the new instance of the transaction to mark a query as part of this transaction
     *
     * @param {*} query
     * @param {string} cid
     * @returns {*}
     *
     * @throws {Error} If failed to query the connection to start a transaction
     * @throws {Error} If query already has a `transactionId` field.
     */
    wrapquery: function (query, id) {
        // if query is string or number, we convert it to an object and store transaction id in them.
        query = nonObjectCriteriaTypes[typeof query] && {
            id: query
        } || query; // else inject transactionId.

        // save transaction id to query and return
        query && (query.transactionId = id);

        return query;
    }
};
