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
  name: 'KYC Flaw User',
  email: `kyc_flaw_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'CUSTOMER',
};

async function runTest() {
  try {
    console.log('🚀 Starting KYC Flaw Test...');

    // Create Customer
    const userRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_USER);
    const userId = userRes.data.data.user.id;
    await prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });
    const loginRes = await request(`${BASE_URL}/auth/login`, 'POST', { email: TEST_USER.email, password: TEST_USER.password });
    const token = loginRes.data.data.token;
    console.log('✅ User created and logged in');

    // Generate URL
    const genUrlRes = await request(
      `${BASE_URL}/kyc/upload-url`,
      'POST',
      { docType: 'ID_PROOF' },
      token
    );
    const kycDocId = genUrlRes.data.data.kycDocId;
    const originalPublicId = genUrlRes.data.data.publicId;
    console.log(`✅ Generated URL for publicId: ${originalPublicId}`);

    // Try to complete upload with a FAKE publicId
    const fakePublicId = 'hacker/fake_image';
    
    await request(
      `${BASE_URL}/kyc/complete-upload`,
      'POST',
      {
        kycDocId,
        publicId: fakePublicId,
        fileSize: 1024,
        contentType: 'image/jpeg',
      },
      token
    );
    console.log('✅ Completed upload with FAKE publicId');

    // Check the document in DB
    const doc = await prisma.kYCDocument.findUnique({ where: { id: kycDocId } });
    console.log(`Current Doc URL: ${doc.url}`);

    if (doc.url.includes(fakePublicId)) {
      console.log('❌ FLAW CONFIRMED: System accepted fake publicId!');
    } else {
      console.log('✅ System rejected fake publicId (or ignored it). Fix Verified!');
    }

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
