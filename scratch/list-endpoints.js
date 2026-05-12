
const { auth } = require('./src/lib/auth');

async function listEndpoints() {
  console.log('Registered Endpoints:');
  const endpoints = Object.keys(auth.api || {});
  console.log(endpoints.sort().join('\n'));
}

listEndpoints().catch(console.error);
