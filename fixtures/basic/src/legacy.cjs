'use strict';
// Legacy CommonJS entry kept for an old cron job. Fixture data only: never run.
const { average } = require('./utils/math');

function loadWith(require) {
  // This `require` is the parameter above, not CommonJS, so it is not a dependency.
  return require('./config');
}

module.exports = { average, loadWith };
