require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/v1`;

async function run() {
  console.log('--- Testing Account Lockout ---');
  const email = 'testuser@example.com'; // Use the verified user we created
  const password = 'wrongpassword';

  console.log(`Attempting to lock account: ${email}`);

  for (let i = 1; i <= 6; i++) {
    console.log(`Attempt ${i}...`);
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await res.json();
    
    if (res.status === 423) {
      console.log('[PASS] Account is locked (423 Locked)');
      console.log('Message:', data.message);
      return;
    } else if (res.status === 401) {
      console.log('  -> Failed login (401 Unauthorized) - Expected');
    } else {
      console.log(`  -> Unexpected status: ${res.status}`, data);
    }
  }

  console.error('[FAIL] Account was not locked after 5 attempts!');
}

run();
