/* eslint-disable */
// Manual polyfill for Node.js 'util' module in Edge Runtime

const promisify = function (fn) {
  return fn;
};
// Critical: explicit custom symbol
promisify.custom = Symbol.for('nodejs.util.promisify.custom');

const types = {
  isDate: (d) => d instanceof Date,
  isRegExp: (r) => r instanceof RegExp,
  isNativeError: (e) => e instanceof Error,
};

const inspect = (v) => (v && v.toString ? v.toString() : String(v));

const inherits = (ctor, superCtor) => {
  if (superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true,
      },
    });
  }
};

module.exports = {
  promisify,
  types,
  inspect,
  inherits,
  debuglog: () => () => {},
  deprecate: (fn) => fn,
  format: (...args) => args.join(' '),
  // Add direct exports for destructuring access if needed
  TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : null,
  TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : null,
};

// Also attach to exports directly for default import compatibility
module.exports.default = module.exports;
