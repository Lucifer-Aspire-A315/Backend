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
const TEST_USER = {
  name: 'KYC Test User',
  email: `kyc_test_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'CUSTOMER',
};

const TEST_MERCHANT = {
  name: 'KYC Test Merchant',
  email: `kyc_merchant_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  businessName: 'KYC Merchant Biz',
  role: 'MERCHANT',
};

const TEST_BANKER = {
  name: 'KYC Test Banker',
  email: `kyc_banker_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  bankId: null, // Will be set after bank creation
  branch: 'Main Branch',
  pincode: '123456',
  role: 'BANKER',
};

let userToken, merchantToken, bankerToken;
let userId, merchantId, bankerId;
let kycDocId;

async function runTest() {
  try {
    console.log('🚀 Starting KYC Module Deep Dive Test...');

    // --- Setup: Create Users ---
    console.log('\n1. Creating Users...');
    
    // Create Customer
    const userRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_USER);
    userId = userRes.data.data.user.id;
    // Verify Email
    await prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
    // Login Customer
    const userLoginRes = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_USER.email, password: TEST_USER.password });
    userToken = userLoginRes.data.data.token;
    console.log('✅ Customer created and logged in');

    // Create Merchant
    const merchantRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_MERCHANT);
    merchantId = merchantRes.data.data.user.id;
    // Verify Email
    await prisma.user.update({ where: { id: merchantId }, data: { isEmailVerified: true } });
    // Login Merchant
    const merchantLoginRes = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_MERCHANT.email, password: TEST_MERCHANT.password });
    merchantToken = merchantLoginRes.data.data.token;
    
    // Link Customer to Merchant
    const merchantProfile = await prisma.merchantProfile.findUnique({ where: { userId: merchantId } });
    await prisma.customerProfile.update({
      where: { userId: userId },
      data: { merchantId: merchantProfile.id },
    });
    console.log('✅ Merchant created, logged in, and linked to Customer');

    // Create Bank & Banker
    const bank = await prisma.bank.create({
      data: { name: `KYC Bank ${Date.now()}` },
    });
    TEST_BANKER.bankId = bank.id;
    const bankerRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_BANKER);
    bankerId = bankerRes.data.data.user.id;
    // Verify Email
    await prisma.user.update({ where: { id: bankerId }, data: { isEmailVerified: true } });
    // Approve Banker
    await prisma.bankerProfile.update({ where: { userId: bankerId }, data: { status: 'ACTIVE' } });
    // Login Banker
    const bankerLoginRes = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_BANKER.email, password: TEST_BANKER.password });
    bankerToken = bankerLoginRes.data.data.token;
    console.log('✅ Banker created and logged in');

    // --- Step 2: Customer Uploads KYC ---
    console.log('\n2. Customer Upload Flow...');
    
    // Generate URL
    const genUrlRes = await request(
      `${BASE_URL}/kyc/upload-url`,
      'POST',
      { docType: 'ID_PROOF' },
      userToken
    );
    console.log('✅ Upload URL generated');
    kycDocId = genUrlRes.data.data.kycDocId;
    const publicId = genUrlRes.data.data.publicId;

    // Complete Upload
    await request(
      `${BASE_URL}/kyc/complete-upload`,
      'POST',
      {
        kycDocId,
        publicId,
        fileSize: 1024,
        contentType: 'image/jpeg',
      },
      userToken
    );
    console.log('✅ Upload completed');

    // Check Status
    const statusRes = await request(`${BASE_URL}/kyc/status`, 'GET', null, userToken);
    const doc = statusRes.data.data.documents.find(d => d.id === kycDocId);
    if (doc.status !== 'PENDING') throw new Error(`Expected PENDING, got ${doc.status}`);
    console.log('✅ Document status is PENDING');

    // --- Step 3: Banker Verification ---
    console.log('\n3. Banker Verification Flow...');

    // Get Pending
    const pendingRes = await request(`${BASE_URL}/kyc/pending`, 'GET', null, bankerToken);
    const pendingDoc = pendingRes.data.data.documents.find(d => d.id === kycDocId);
    if (!pendingDoc) throw new Error('Pending document not found in banker list');
    console.log('✅ Banker sees pending document');

    // Verify
    await request(
      `${BASE_URL}/kyc/${kycDocId}/verify`,
      'POST',
      { status: 'VERIFIED', notes: 'Looks good' },
      bankerToken
    );
    console.log('✅ Banker verified document');

    // Check Status again
    const statusRes2 = await request(`${BASE_URL}/kyc/status`, 'GET', null, userToken);
    const doc2 = statusRes2.data.data.documents.find(d => d.id === kycDocId);
    if (doc2.status !== 'VERIFIED') throw new Error(`Expected VERIFIED, got ${doc2.status}`);
    console.log('✅ Document status is VERIFIED');

    // --- Step 4: Merchant Upload on Behalf ---
    console.log('\n4. Merchant Upload On Behalf Flow...');

    // Generate URL on behalf
    const onBehalfUrlRes = await request(
      `${BASE_URL}/kyc/on-behalf/upload-url`,
      'POST',
      { targetUserId: userId, docType: 'ADDRESS_PROOF' },
      merchantToken
    );
    console.log('✅ Merchant generated upload URL for Customer');
    const kycDocId2 = onBehalfUrlRes.data.data.kycDocId;
    const publicId2 = onBehalfUrlRes.data.data.publicId;

    // Complete Upload on behalf
    await request(
      `${BASE_URL}/kyc/on-behalf/complete-upload`,
      'POST',
      {
        kycDocId: kycDocId2,
        publicId: publicId2,
        fileSize: 2048,
        contentType: 'application/pdf',
      },
      merchantToken
    );
    console.log('✅ Merchant completed upload for Customer');

    // --- Step 5: Security Checks ---
    console.log('\n5. Security Checks...');

    // Customer trying to verify own doc
    try {
      await request(
        `${BASE_URL}/kyc/${kycDocId2}/verify`,
        'POST',
        { status: 'VERIFIED' },
        userToken
      );
      throw new Error('Customer should not be able to verify KYC');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Customer cannot verify KYC (403 Forbidden)');
      } else {
        throw error;
      }
    }

    // Merchant trying to upload for unrelated customer
    // Create unrelated customer
    const unrelatedUserRes = await request(`${BASE_URL}/auth/signup`, 'POST', {
        ...TEST_USER, email: `unrelated_${Date.now()}@example.com`, phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`
    });
    const unrelatedUserId = unrelatedUserRes.data.data.user.id;

    try {
        await request(
            `${BASE_URL}/kyc/on-behalf/upload-url`,
            'POST',
            { targetUserId: unrelatedUserId, docType: 'PAN_CARD' },
            merchantToken
        );
        throw new Error('Merchant should not be able to upload for unrelated customer');
    } catch (error) {
        if (error.response?.status === 403) {
            console.log('✅ Merchant cannot upload for unrelated customer (403 Forbidden)');
        } else {
            throw error;
        }
    }

    console.log('\n🎉 KYC Module Deep Dive Passed!');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.response) {
      console.error('Response Data:', error.response.data);
      console.error('Status:', error.response.status);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
