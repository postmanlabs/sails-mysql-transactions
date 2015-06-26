var _ = require('lodash'),

    nonObjectCriteriaTypes = { // object to validate types of wrapper fn
        string: true,
        number: true,
        boolean: true
    },

    E = '',
    H = '-',
    rnd = Math.random,

    util; // exports

util = {
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
    },

    /**
     * This method allows one to extract transaction id from a critera object. The interesting thing is that it recovers
     * transaction id embedded within nested criteria and joins.
     * @private
     *
     * @param {object|array} criteria
     * @param {object=} [hash] - object to lookup validity of hash. in its absence simple lookup iis made
     * @returns {string}
     */
    unwrapquery: function (criteria, hash) {
        var transactionId;

        // if hash is absent, we have no option but to look for only the transaction key
        if (!hash) {
            return criteria && criteria.transactionId;
        }

        // if criteria is falsy, we have nothing further to work on.
        if (!criteria) {
            return;
        }

        // we do a crude check to see if transaction id has been sent as part of the criteria object.
        if (hash[criteria.transactionId]) {
            // @todo this is brought here because there is an extra transactionId coming from somewhere in the where
            // clause
            if (criteria.where && criteria.where.transactionId) {
                delete criteria.where.transactionId;
            }
            return ((transactionId = criteria.transactionId), (delete criteria.transactionId), transactionId);
        }

        // if the criteria object sent is an array, usually this is a result of recusrion from this
        // function itself, we then try and process every item in the array for existence of transaction id.
        if (Array.isArray(criteria)) {
            criteria.some(function (item) {
                // during recursion we are sure CRC will always pass as that has been ensured by waterline
                // schema.
                return (transactionId = util.unwrapquery(item));
            });
            // if trabsaction id was found in recursive criteria, we return the same, else proceed.
            if (transactionId) {
                return transactionId;
            }
        }

        // if the criteria object is a schema processed dql, we would possibly get the transaction id within the `where`
        // key.
        if (criteria.where && hash[criteria.where.transactionId]) {
            return ((transactionId = criteria.where.transactionId), (delete criteria.where.transactionId),
                transactionId);
        }

        // finally, we try to recurse into finding transaction id within joins
        Array.isArray(criteria.joins) && (transactionId = util.unwrapquery(criteria.joins));

        // finally, we return whatever transaction id we have received. could possibly be `undefined` as well.
        return transactionId;
    }
};

module.exports = util;
