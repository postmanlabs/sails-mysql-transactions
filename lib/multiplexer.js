var util = require('./util'),

    Multiplexer; // fn

Multiplexer = function (sourceName) {
    return sourceName;
};

util.extend(Multiplexer, {
    setup: function () {},
    teardown: function () {}
});

util.extend(Multiplexer.prototype, {
    id: function () {},
    toString: function () {},

    wrap: function (obj) {
        return obj;
    }
});

module.exports = Multiplexer;
