(async () => {
  try {
    console.log('Testing kvstore...');
    const kv = require('../src/lib/kvstore');

    console.log('isRedis:', kv.isRedis());

    console.log('Initial get foo:', await kv.get('foo'));
    console.log('incr foo (ttl 3s):', await kv.incr('foo', 3));
    console.log('incr foo:', await kv.incr('foo'));
    console.log('get foo:', await kv.get('foo'));

    console.log('set bar=42 (ttl 2s):', await kv.set('bar', 42, 2));
    console.log('get bar:', await kv.get('bar'));

    console.log('Waiting 3 seconds to test TTL...');
    await new Promise((r) => setTimeout(r, 3000));

    console.log('get bar after 3s:', await kv.get('bar'));
    console.log('get foo after 3s:', await kv.get('foo'));

    console.log('del foo:', await kv.del('foo'));
    console.log('get foo after del:', await kv.get('foo'));

    console.log('kvstore test completed.');
  } catch (err) {
    console.error('kvstore test failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  }
})();
