'use strict';

var extend = require('extend-shallow');
var isObject = require('isobject');

module.exports = function sort(arr, config) {
  if (!Array.isArray(arr)) {
    throw new TypeError('expected an array');
  }

  if (arr.length === 1) {
    return arr;
  }

  if (!isObject(config)) {
    throw new TypeError('expected config to be an object');
  }

  if (typeof config.prop !== 'string') {
    throw new TypeError('expected config.prop to be a string (the key to sort by)');
  }

  if (!Array.isArray(config.values)) {
    throw new TypeError('expected config.values to be an array of strings');
  }

  var opts = extend({normalize: normalize}, config);
  var res = new Array(opts.values.length);
  var rest = [];

  var normalized = opts.values.map(function(ele) {
    return opts.normalize(ele);
  });

  // this is a bit faster than sort
  for (var i = 0; i < arr.length; i++) {
    var ele = arr[i];
    if (!isObject(ele)) {
      throw new TypeError('expected an array of objects');
    }

    var val = ele[opts.prop];
    var idx = normalized.indexOf(opts.normalize(val));
    if (idx !== -1) {
      res.splice(idx, 1, ele);
    } else {
      rest.push(ele);
    }
  }

  return res.concat(rest).filter(Boolean);
};

function normalize(str) {
  return str.replace(/[\s\W]/g, '').toLowerCase();
}
