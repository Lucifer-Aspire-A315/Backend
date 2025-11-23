require('dotenv').config();
const fetch = require('node-fetch');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/v1`;

// Helper to delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  try {
    console.log('--- Starting Refresh Token Test ---');

    // 1. Login
    console.log('1. Logging in...');
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testuser@example.com', password: 'password123' }),
    });
    const loginData = await loginRes.json();
    
    if (!loginData.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }

    const accessToken = loginData.data.token;
    const refreshToken = loginData.data.refreshToken;

    console.log('Login successful.');
    console.log('Access Token:', accessToken.substring(0, 20) + '...');
    console.log('Refresh Token:', refreshToken.substring(0, 20) + '...');

    if (!refreshToken) {
      throw new Error('No refresh token received!');
    }

    // 2. Refresh Token
    console.log('\n2. Refreshing token...');
    const refreshRes = await fetch(`${BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshData = await refreshRes.json();

    if (!refreshData.success) {
      throw new Error(`Refresh failed: ${JSON.stringify(refreshData)}`);
    }

    const newAccessToken = refreshData.data.token;
    const newRefreshToken = refreshData.data.refreshToken;

    console.log('Refresh successful.');
    console.log('New Access Token:', newAccessToken.substring(0, 20) + '...');
    console.log('New Refresh Token:', newRefreshToken.substring(0, 20) + '...');

    if (accessToken === newAccessToken) {
      console.warn('Warning: Access token did not change (it might if payload is identical and no iat check, but usually it changes)');
    }
    if (refreshToken === newRefreshToken) {
      throw new Error('Refresh token did not rotate!');
    }

    // 3. Try to use old refresh token (should fail)
    console.log('\n3. Testing old refresh token (should fail)...');
    const oldRefreshRes = await fetch(`${BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refreshToken }),
    });
    
    if (oldRefreshRes.status === 401) {
      console.log('Success: Old refresh token rejected.');
    } else {
      const oldRefreshData = await oldRefreshRes.json();
      console.error('Failure: Old refresh token was accepted!', oldRefreshData);
    }

    // 4. Logout
    console.log('\n4. Logging out...');
    const logoutRes = await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: newRefreshToken }),
    });
    const logoutData = await logoutRes.json();
    console.log('Logout response:', logoutData);

    // 5. Try to use revoked refresh token (should fail)
    console.log('\n5. Testing revoked refresh token (should fail)...');
    const revokedRefreshRes = await fetch(`${BASE}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: newRefreshToken }),
    });

    if (revokedRefreshRes.status === 401) {
      console.log('Success: Revoked refresh token rejected.');
    } else {
      const revokedData = await revokedRefreshRes.json();
      console.error('Failure: Revoked refresh token was accepted!', revokedData);
    }

    console.log('\n--- Test Complete ---');

  } catch (error) {
    console.error('Test Failed:', error);
  }
}

run();
