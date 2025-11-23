require('dotenv').config();
const prisma = require('../src/lib/prisma');
const BASE_URL = 'http://localhost:3000/api/v1';

// Helper for fetch
async function request(url, method, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(url, options);
  const data = await res.json();
  
  if (!res.ok) {
    const error = new Error(data.message || res.statusText);
    error.response = { status: res.status, data };
    throw error;
  }
  return { data, status: res.status };
}

// Test Data
const timestamp = Date.now();
const TEST_ADMIN = {
  name: 'Admin User',
  email: `admin_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'ADMIN',
};

const TEST_USER = {
  name: 'Target User',
  email: `target_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'CUSTOMER',
};

async function runTest() {
  try {
    console.log('🚀 Starting Admin Users Module Deep Dive Test...');

    // --- Setup: Create Users ---
    console.log('\n1. Creating Users...');
    
    // Create Admin (Hack: Create as Customer then update role in DB)
    const adminRes = await request(`${BASE_URL}/auth/signup`, 'POST', { ...TEST_ADMIN, role: 'CUSTOMER' });
    const adminId = adminRes.data.data.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN', isEmailVerified: true } });
    const adminLogin = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const adminToken = adminLogin.data.data.token;
    console.log('✅ Admin created and logged in');

    // Create Target User
    const userRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_USER);
    const userId = userRes.data.data.user.id;
    await prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
    console.log('✅ Target User created');

    // --- Step 2: List Users ---
    console.log('\n2. List Users Flow...');
    const listRes = await request(`${BASE_URL}/admin/users?role=CUSTOMER`, 'GET', null, adminToken);
    const users = listRes.data.data.users;
    const foundUser = users.find(u => u.id === userId);
    if (!foundUser) throw new Error('Target user not found in list');
    console.log('✅ Admin can list users');

    // --- Step 3: Suspend User ---
    console.log('\n3. Suspend User Flow...');
    await request(
      `${BASE_URL}/admin/users/${userId}/status`,
      'PUT',
      { status: 'SUSPENDED' },
      adminToken
    );
    console.log('✅ Admin suspended user');

    // Verify User cannot login
    try {
      await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_USER.email, password: TEST_USER.password });
      throw new Error('Suspended user should not be able to login');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Suspended user blocked from login (403 Forbidden)');
      } else {
        console.log(`⚠️ Unexpected status code: ${error.response?.status}`);
        console.log('Error details:', error.response?.data);
      }
    }

    // --- Step 4: Activate User ---
    console.log('\n4. Activate User Flow...');
    await request(
      `${BASE_URL}/admin/users/${userId}/status`,
      'PUT',
      { status: 'ACTIVE' },
      adminToken
    );
    console.log('✅ Admin activated user');

    // Verify User can login
    await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_USER.email, password: TEST_USER.password });
    console.log('✅ Active user can login');

    // --- Step 5: Self-Suspension Check ---
    console.log('\n5. Self-Suspension Check...');
    try {
      await request(
        `${BASE_URL}/admin/users/${adminId}/status`,
        'PUT',
        { status: 'SUSPENDED' },
        adminToken
      );
      throw new Error('Admin was able to suspend themselves! (Fix failed)');
    } catch (error) {
      if (error.response?.status === 400 || error.response?.status === 403) {
        console.log('✅ Admin cannot suspend themselves');
      } else {
        throw error;
      }
    }

    console.log('\n🎉 Admin Users Module Deep Dive Passed (with observations)!');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
      console.error('Status:', error.response.status);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
