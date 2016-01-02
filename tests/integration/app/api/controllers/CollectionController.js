/**
 * CollectionController
 *
 * @description :: Server-side logic for managing collections
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {
  retrieve: function (req, res) {
    Collection.findOne({
      select: ['name'],
      where: {id: req.param('id')}
    })
    .populate('user', {select: ['name']})
    .populate('requests', {select: ['name', 'collection', 'id']})
    .exec(function (err, collection) {
      if (err) {
        return res.serverError(err);
      }
      res.json(collection);
    });
  },
};

