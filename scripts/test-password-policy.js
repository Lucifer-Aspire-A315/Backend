require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/v1`;

async function testSignup(password, description) {
  const user = {
    name: 'Policy Test',
    email: `policy-${Date.now()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: password,
    role: 'CUSTOMER',
  };

  try {
    const res = await fetch(`${BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    const data = await res.json();

    if (res.ok) {
      console.log(`[PASS] ${description}: Accepted (Expected: ${description.includes('Valid') ? 'Yes' : 'No'})`);
      if (!description.includes('Valid')) console.error('  -> ERROR: Should have failed!');
    } else {
      console.log(`[FAIL] ${description}: Rejected (Expected: ${description.includes('Valid') ? 'Yes' : 'No'})`);
      if (description.includes('Valid')) console.error('  -> ERROR: Should have passed!', data);
      else console.log('  -> Reason:', data.message || data.validationErrors?.[0]?.message);
    }
  } catch (error) {
    console.error('Request failed', error);
  }
}

async function run() {
  console.log('--- Testing Password Policy ---');
  
  await testSignup('short', 'Short password (<8)');
  await testSignup('lowercaseonly1', 'No uppercase');
  await testSignup('UPPERCASEONLY1', 'No lowercase');
  await testSignup('NoNumber!', 'No number');
  await testSignup('NoSpecialChar1', 'No special char');
  await testSignup('ValidPass1!', 'Valid password');
}

run();
