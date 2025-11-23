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
  name: 'Dashboard Admin',
  email: `dash_admin_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'ADMIN',
};

const TEST_CUSTOMER = {
  name: 'Dashboard Customer',
  email: `dash_cust_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'CUSTOMER',
};

async function runTest() {
  try {
    console.log('🚀 Starting Dashboard Module Deep Dive Test...');

    // --- Setup: Create Users ---
    console.log('\n1. Creating Users...');
    
    // Admin
    const adminRes = await request(`${BASE_URL}/auth/signup`, 'POST', { ...TEST_ADMIN, role: 'CUSTOMER' });
    const adminId = adminRes.data.data.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN', isEmailVerified: true } });
    const adminLogin = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const adminToken = adminLogin.data.data.token;
    console.log('✅ Admin created');

    // Customer
    const custRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_CUSTOMER);
    const custId = custRes.data.data.user.id;
    await prisma.user.update({ where: { id: custId }, data: { isEmailVerified: true } });
    const custLogin = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_CUSTOMER.email, password: TEST_CUSTOMER.password });
    const custToken = custLogin.data.data.token;
    console.log('✅ Customer created');

    // --- Step 2: Admin Dashboard ---
    console.log('\n2. Admin Dashboard...');
    const adminDash = await request(`${BASE_URL}/dashboard`, 'GET', null, adminToken);
    console.log('Admin Stats:', JSON.stringify(adminDash.data.data.users, null, 2));
    if (adminDash.data.data.users.ADMIN >= 1) {
      console.log('✅ Admin stats correct');
    } else {
      throw new Error('Admin stats incorrect');
    }

    // --- Step 3: Customer Dashboard (Empty) ---
    console.log('\n3. Customer Dashboard (Empty)...');
    const custDashEmpty = await request(`${BASE_URL}/dashboard`, 'GET', null, custToken);
    // Note: If previous tests left data, this might not be null. 
    // We should check structure rather than strict null if DB isn't reset.
    // But for a new user, it should be null.
    if (custDashEmpty.data.data.activeLoan === null) {
      console.log('✅ Customer dashboard handles no loans');
    } else {
      console.log('Active Loan found (unexpected for new user):', custDashEmpty.data.data.activeLoan);
      // If we are reusing DB, maybe this user got a loan assigned? 
      // No, we just created them.
      throw new Error('Customer dashboard should be empty');
    }

    // --- Step 4: Create Loan & Check Dashboard ---
    console.log('\n4. Create Loan & Check Dashboard...');
    // Create Loan Type first
    const loanType = await prisma.loanType.create({
      data: {
        name: `Dash Loan ${timestamp}`,
        interestRate: 10,
        minAmount: 1000,
        maxAmount: 50000,
        minTenure: 6,
        maxTenure: 24
      }
    });

    // Create Loan
    await prisma.loan.create({
      data: {
        applicantId: custId,
        loanTypeId: loanType.id,
        amount: 5000,
        status: 'SUBMITTED'
      }
    });

    const custDash = await request(`${BASE_URL}/dashboard`, 'GET', null, custToken);
    if (custDash.data.data.activeLoan && custDash.data.data.activeLoan.amount == 5000) {
      console.log('✅ Customer dashboard shows active loan');
    } else {
      console.log('Dashboard Data:', JSON.stringify(custDash.data, null, 2));
      throw new Error('Customer dashboard missing active loan');
    }

    console.log('\n🎉 Dashboard Module Deep Dive Completed!');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
