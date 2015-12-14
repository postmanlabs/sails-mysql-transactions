/**
 * CollectionController
 *
 * @description :: Server-side logic for managing collections
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {
  retrieve: function (req, res) {
    Collection.findOne(req.param('id')).populate('user', {select: ['id']}).exec(function (err, collection) {
      if (err) {
        return res.serverError(err);
      }
      res.json(collection);
    });
  },
};

