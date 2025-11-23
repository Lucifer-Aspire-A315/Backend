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
  name: 'LoanType Admin',
  email: `lt_admin_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'ADMIN', // Note: Signup doesn't support ADMIN role usually, we might need to hack it
};

const TEST_MERCHANT = {
  name: 'LoanType Merchant',
  email: `lt_merchant_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  businessName: 'LT Merchant Biz',
  role: 'MERCHANT',
};

async function runTest() {
  try {
    console.log('🚀 Starting Loan Type Module Deep Dive Test...');

    // --- Setup: Create Users ---
    console.log('\n1. Creating Users...');
    
    // Create Merchant (Standard signup)
    const merchantRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_MERCHANT);
    const merchantId = merchantRes.data.data.user.id;
    await prisma.user.update({ where: { id: merchantId }, data: { isEmailVerified: true } });
    const merchantLogin = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_MERCHANT.email, password: TEST_MERCHANT.password });
    const merchantToken = merchantLogin.data.data.token;
    console.log('✅ Merchant created and logged in');

    // Create Admin (Hack: Create as Customer then update role in DB)
    const adminRes = await request(`${BASE_URL}/auth/signup`, 'POST', { ...TEST_ADMIN, role: 'CUSTOMER' });
    const adminId = adminRes.data.data.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN', isEmailVerified: true } });
    const adminLogin = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    const adminToken = adminLogin.data.data.token;
    console.log('✅ Admin created and logged in');

    // --- Step 2: Admin Creates Loan Type ---
    console.log('\n2. Admin Create Loan Type Flow...');
    
    const loanTypeData = {
      name: `Personal Loan ${timestamp}`,
      code: `PL${timestamp}`,
      description: 'Standard personal loan',
      interestRate: 12.5,
      minTenure: 12,
      maxTenure: 60,
      minAmount: 10000,
      maxAmount: 500000,
      requiredDocuments: ['ID_PROOF', 'PAN_CARD'],
      schema: {
        type: 'object',
        properties: {
          salary: { type: 'number', minimum: 10000 }
        }
      }
    };

    const createRes = await request(
      `${BASE_URL}/loan-types`,
      'POST',
      loanTypeData,
      adminToken
    );
    const loanTypeId = createRes.data.data.id;
    console.log('✅ Admin created Loan Type');

    // --- Step 3: RBAC Check (Merchant tries to create) ---
    console.log('\n3. RBAC Check (Merchant Create)...');
    try {
      await request(
        `${BASE_URL}/loan-types`,
        'POST',
        { name: 'Hacker Loan' },
        merchantToken
      );
      throw new Error('Merchant should not be able to create Loan Type');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Merchant cannot create Loan Type (403 Forbidden)');
      } else {
        throw error;
      }
    }

    // --- Step 4: Update Loan Type ---
    console.log('\n4. Admin Update Loan Type...');
    await request(
      `${BASE_URL}/loan-types/${loanTypeId}`,
      'PUT',
      { description: 'Updated description', interestRate: 13.0 },
      adminToken
    );
    console.log('✅ Admin updated Loan Type');

    // --- Step 5: Flaw Check - Interest Rate? ---
    console.log('\n5. Checking for Interest Rate configuration...');
    const getRes = await request(`${BASE_URL}/loan-types/${loanTypeId}`, 'GET', null, adminToken);
    const fetchedType = getRes.data.data;
    
    if (fetchedType.interestRate === undefined) {
      console.log('⚠️  POTENTIAL FLAW: Loan Type does not have a default Interest Rate field.');
    } else {
      console.log(`✅ Loan Type Interest Rate: ${fetchedType.interestRate}`);
      if (Number(fetchedType.interestRate) !== 13.0) {
        console.log(`❌ Interest Rate mismatch! Expected 13.0, got ${fetchedType.interestRate}`);
      }
    }

    // --- Step 6: Delete Loan Type ---
    console.log('\n6. Admin Delete Loan Type...');
    // Check if we can delete a loan type that is in use? (Need to create a loan first to test this properly, skipping for now)
    await request(
      `${BASE_URL}/loan-types/${loanTypeId}`,
      'DELETE',
      null,
      adminToken
    );
    console.log('✅ Admin deleted Loan Type');

    console.log('\n🎉 Loan Type Module Deep Dive Passed (with observations)!');

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
