const { server, EXECUTION_STATUSES, dailyFocusQueue } = require('./server-build44');

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const APP_VERSION = require('./package.json').version;
  const { requireValidAuthConfig } = require('./server');
  const access = requireValidAuthConfig();
  server.listen(PORT, '0.0.0.0', () => console.log(`Atlas ${APP_VERSION} is running on port ${PORT} (${access.enabled ? 'access protected' : 'local/unlocked'})`));
}

module.exports = { server, EXECUTION_STATUSES, dailyFocusQueue };
