/** @type {import('.')} */
let binding;

try {
  binding = require('./server-native.node');
} catch {
  // Keep optional arch-specific fallbacks hidden from bundler static analysis.
  const req = module.require.bind(module);
  binding =
    process.arch === 'arm64'
      ? req('./server-native.arm64.node')
      : process.arch === 'arm'
        ? req('./server-native.armv7.node')
        : req('./server-native.x64.node');
}

module.exports = binding;
