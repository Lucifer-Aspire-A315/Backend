(async () => {
  try {
    const fetch = require('node-fetch');
    for (let i = 1; i <= 6; i++) {
      try {
        const res = await fetch('http://localhost:3000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'int.customer@example.com', password: 'WrongPassword!' }),
        });
        console.log('Attempt', i, 'status', res.status);
        const text = await res.text();
        console.log(text);
      } catch (err) {
        console.error('Attempt', i, 'error', err.message);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    console.error('Fatal error', err.message);
    process.exitCode = 1;
  }
})();
