
require('dotenv').config();
const fetch = require('node-fetch');

const BASE = 'http://localhost:3000/api/v1';
const EMAIL = 'integration.merchant@example.com';
const PASSWORD = 'WrongPassword123!';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

(async () => {
  try {
    console.log('--- Starting Lockout Test ---');
    
    // Reset lockout first (optional, but good for idempotency)
    const prisma = require('../src/lib/prisma');
    await prisma.user.update({
        where: { email: EMAIL },
        data: { failedLoginAttempts: 0, lockoutUntil: null }
    });
    console.log('   Reset lockout state');

    for (let i = 1; i <= 7; i++) {
        console.log(`   Attempt ${i}...`);
        const res = await post('/auth/login', { email: EMAIL, password: PASSWORD });
        console.log(`   Status: ${res.status}, Message: ${res.data.message}`);
        
        if (res.status === 423) {
            console.log('   SUCCESS: Account Locked!');
            break;
        }
        if (i === 7 && res.status !== 423) {
            console.log('   FAILURE: Account did not lock after 6 attempts');
        }
    }
    
    // Cleanup
    await prisma.user.update({
        where: { email: EMAIL },
        data: { failedLoginAttempts: 0, lockoutUntil: null }
    });
    console.log('   Cleanup complete');

  } catch (err) {
    console.error('Test Failed:', err);
  }
})();
