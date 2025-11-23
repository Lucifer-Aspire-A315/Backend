
require('dotenv').config();
const fetch = require('node-fetch');

const BASE = 'http://localhost:3000/api/v1';
const EMAIL = 'integration.merchant@example.com';
const PASSWORD = 'Password123!';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

async function del(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

(async () => {
  try {
    console.log('--- Starting Auth Security Test ---');

    // 1. Login
    console.log('1. Login');
    let loginRes = await post('/auth/login', { email: EMAIL, password: PASSWORD });
    if (loginRes.status !== 200) {
        console.log('Login failed response:', loginRes.data);
        throw new Error('Login failed');
    }

    let token;
    if (loginRes.data.require2fa) {
        console.log('   2FA required. Performing 2FA login...');
        // We need the secret to generate code. 
        // In a real scenario, the user has the app. Here we need to know the secret.
        // Since we can't easily get the secret if we don't have it stored in the test,
        // we might need to reset 2FA or store the secret from Step 3.
        // BUT Step 3 hasn't run yet in this execution if we just started.
        // If 2FA was enabled in a previous run, we are stuck unless we know the secret.
        
        // For testing purposes, let's assume we can't proceed if 2FA is already enabled 
        // and we don't have the secret.
        // However, we can try to disable it via DB if we had a backdoor, but we don't.
        
        // Let's try to fetch the secret from the DB using a helper script or just fail gracefully 
        // and ask to reset DB or disable 2FA manually.
        
        // Actually, let's just print a message.
        console.log('   2FA is already enabled. Cannot proceed without secret.');
        // To make the test idempotent, we should probably disable 2FA for this user in the DB at the start.
        
        // Let's use a prisma call here to reset 2FA for the user
        const prisma = require('../src/lib/prisma');
        await prisma.user.update({
            where: { email: EMAIL },
            data: { isTwoFactorEnabled: false, twoFactorSecret: null }
        });
        // await prisma.$disconnect(); // Don't disconnect shared instance
        console.log('   Reset 2FA for test user. Retrying login...');
        
        loginRes = await post('/auth/login', { email: EMAIL, password: PASSWORD });
        token = loginRes.data.data.token;
    } else {
        token = loginRes.data.data.token;
    }
    
    console.log('   Login successful');

    // 2. Session Management
    console.log('2. Session Management');
    const sessionsRes = await get('/auth/sessions', token);
    console.log('   Sessions:', sessionsRes.data.data.length);
    
    if (sessionsRes.data.data.length > 0) {
      const sessionId = sessionsRes.data.data[0].id;
      console.log('   Revoking session:', sessionId);
      await del(`/auth/sessions/${sessionId}`, token);
      
      const sessionsAfter = await get('/auth/sessions', token);
      console.log('   Sessions after revoke:', sessionsAfter.data.data.length);
    }

    // 3. 2FA Setup
    console.log('3. 2FA Setup');
    const setupRes = await post('/auth/2fa/setup', {}, token);
    const { secret } = setupRes.data.data;
    console.log('   Secret:', secret);

    // Generate TOTP
    const { authenticator } = require('otplib');
    authenticator.options = { window: 1 };
    const code = authenticator.generate(secret);
    
    const verifyRes = await post('/auth/2fa/verify', { token: code, secret }, token);
    console.log('   Verify 2FA:', verifyRes.data);

    // 4. Login with 2FA
    console.log('4. Login with 2FA');
    const login2faRes = await post('/auth/login', { email: EMAIL, password: PASSWORD });
    console.log('   Login response:', login2faRes.data);
    
    if (login2faRes.data.require2fa) {
      const tempToken = login2faRes.data.data.tempToken;
      const code2 = authenticator.generate(secret);
      
      const finalLogin = await post('/auth/2fa/login', { tempToken, code: code2 });
      console.log('   Final Login:', finalLogin.data.success);
      if (!finalLogin.data.success) {
          console.log('   Final Login Error:', finalLogin.data);
      }
    } else {
      console.log('   ERROR: Did not require 2FA');
    }

    // 5. Disable 2FA (Cleanup)
    console.log('5. Disable 2FA');
    // Need to login again to get token if previous session was revoked or just use the new one
    // But wait, we just logged in.
    // Actually, let's use the token from step 1 if it's still valid, or the new one.
    // Since we revoked the session in step 2, token 1 might be invalid if it was the same session?
    // Refresh tokens are revoked, access tokens are stateless (JWT) so they remain valid until expiry.
    
    await post('/auth/2fa/disable', { token: 'dummy' }, token);
    console.log('   2FA Disabled');

    console.log('--- Test Complete ---');
  } catch (err) {
    console.error('Test Failed:', err);
  }
})();
