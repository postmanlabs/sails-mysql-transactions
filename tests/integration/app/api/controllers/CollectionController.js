/**
 * CollectionController
 *
 * @description :: Server-side logic for managing collections
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {
  find: function (req, res) {
    Collection.findOne(req.param('id')).populate('requests').exec(function (err, collection) {
      if (err) {
        return res.serverError(err);
      }

      return res.ok(collection);
    })
  }
};

