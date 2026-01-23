/**
 * @file
 * jQuery 4 compatibility shim for legacy libraries.
 *
 * Restores deprecated jQuery methods removed in jQuery 4.0 for backward
 * compatibility with older libraries (waypoints, counterup, etc.)
 */

(function() {
  'use strict';

  // Get jQuery reference safely
  var $ = window.jQuery || window.$;

  // Exit if jQuery is not loaded
  if (!$) {
    return;
  }

  // $.isFunction() was removed in jQuery 4.0
  if (typeof $.isFunction !== 'function') {
    $.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // $.isArray() was removed in jQuery 4.0
  if (typeof $.isArray !== 'function') {
    $.isArray = Array.isArray;
  }

  // $.isNumeric() was removed in jQuery 4.0
  if (typeof $.isNumeric !== 'function') {
    $.isNumeric = function(obj) {
      var type = typeof obj;
      return (type === 'number' || type === 'string') &&
        !isNaN(obj - parseFloat(obj));
    };
  }

  // $.isWindow() was removed in jQuery 4.0
  if (typeof $.isWindow !== 'function') {
    $.isWindow = function(obj) {
      return obj != null && obj === obj.window;
    };
  }

  // $.type() was removed in jQuery 4.0
  if (typeof $.type !== 'function') {
    var class2type = {};
    'Boolean Number String Function Array Date RegExp Object Error Symbol'.split(' ').forEach(function(name) {
      class2type['[object ' + name + ']'] = name.toLowerCase();
    });

    $.type = function(obj) {
      if (obj == null) {
        return obj + '';
      }
      return typeof obj === 'object' || typeof obj === 'function' ?
        class2type[Object.prototype.toString.call(obj)] || 'object' :
        typeof obj;
    };
  }

})();
