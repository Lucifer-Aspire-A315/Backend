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
const TEST_CUSTOMER = {
  name: 'Profile Test User',
  email: `profile_test_${timestamp}@example.com`,
  password: 'Password123!',
  phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  role: 'CUSTOMER',
};

async function runTest() {
  try {
    console.log('🚀 Starting Profile Module Deep Dive Test...');

    // --- Setup: Create User ---
    console.log('\n1. Creating Customer...');
    const signupRes = await request(`${BASE_URL}/auth/signup`, 'POST', TEST_CUSTOMER);
    const userId = signupRes.data.data.user.id;
    console.log('✅ Customer created');

    // Manually verify email
    await prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true }
    });
    console.log('✅ Customer email verified (DB Hack)');

    // Login to get token
    const loginRes = await request(`${BASE_URL}/auth/login`, 'POST', {
      email: TEST_CUSTOMER.email,
      password: TEST_CUSTOMER.password
    });
    const token = loginRes.data.data.token;
    console.log('✅ Customer logged in, token received');

    // --- Step 2: Get Initial Profile ---
    console.log('\n2. Get Initial Profile...');
    const profileRes = await request(`${BASE_URL}/profile`, 'GET', null, token);
    console.log('✅ Profile fetched:', profileRes.data.data.user.email);

    // --- Step 3: Update Allowed Fields (Address) ---
    console.log('\n3. Update Address (Allowed Field)...');
    const updateRes = await request(`${BASE_URL}/profile`, 'PUT', {
      address: '123 Test St',
      pincode: '123456'
    }, token);
    
    // Check new response structure: data.profile.address
    if (updateRes.data.data.profile.address === '123 Test St') {
      console.log('✅ Address updated successfully');
    } else {
      console.log('Response:', JSON.stringify(updateRes.data, null, 2));
      throw new Error('Address update failed');
    }

    // --- Step 4: Try to Update User Model Fields (Name) ---
    console.log('\n4. Try to Update Name (User Model Field)...');
    // Now this SHOULD work
    const nameUpdateRes = await request(`${BASE_URL}/profile`, 'PUT', {
      name: 'Updated Name',
      address: '456 New St'
    }, token);

    if (nameUpdateRes.data.data.user.name === 'Updated Name') {
      console.log('✅ Name updated successfully (Fixed!)');
    } else {
      console.log('⚠️  Name NOT updated (Fix failed)');
    }

    // --- Step 5: Validation Check (Invalid Pincode) ---
    console.log('\n5. Validation Check (Invalid Pincode)...');
    try {
      await request(`${BASE_URL}/profile`, 'PUT', {
        pincode: 'INVALID_PIN' // Should fail
      }, token);
      console.log('⚠️  Invalid pincode accepted (Validation failed)');
    } catch (error) {
      if (error.response && error.response.status === 400) {
         console.log('✅ Invalid pincode rejected');
      } else {
         console.log(`⚠️ Unexpected error: ${error.message}`);
      }
    }

    // --- Step 6: Change Password ---
    console.log('\n6. Change Password...');
    const newPassword = 'NewPassword123!';
    await request(`${BASE_URL}/auth/change-password`, 'POST', {
      oldPassword: TEST_CUSTOMER.password,
      newPassword: newPassword
    }, token);
    console.log('✅ Password changed successfully');

    // Verify login with new password
    const loginNewRes = await request(`${BASE_URL}/auth/login`, 'POST', {
      email: TEST_CUSTOMER.email,
      password: newPassword
    });
    if (loginNewRes.data.success) {
      console.log('✅ Login with new password successful');
    } else {
      throw new Error('Login with new password failed');
    }

    // --- Step 7: Avatar Update ---
    console.log('\n7. Avatar Update...');
    const avatarUrl = 'https://res.cloudinary.com/demo/image/upload/v1234567890/sample.jpg';
    const avatarRes = await request(`${BASE_URL}/profile`, 'PUT', {
      avatar: avatarUrl
    }, token);
    
    if (avatarRes.data.data.user.avatar === avatarUrl) {
      console.log('✅ Avatar updated successfully');
    } else {
      console.log('Response:', JSON.stringify(avatarRes.data, null, 2));
      throw new Error('Avatar update failed');
    }

    // --- Step 8: Delete Account ---
    console.log('\n8. Delete Account...');
    await request(`${BASE_URL}/profile`, 'DELETE', null, token);
    console.log('✅ Account deleted successfully');

    // Verify login fails
    try {
      await request(`${BASE_URL}/auth/login`, 'POST', {
        email: TEST_CUSTOMER.email,
        password: newPassword
      });
      throw new Error('Login should fail after account deletion');
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403 || error.response.status === 404)) {
        console.log('✅ Login blocked for deleted account');
      } else {
        console.log(`⚠️ Unexpected error status: ${error.response?.status}`);
        console.log('Error details:', error.response?.data);
      }
    }

    console.log('\n🎉 Profile Module Deep Dive Completed!');

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
