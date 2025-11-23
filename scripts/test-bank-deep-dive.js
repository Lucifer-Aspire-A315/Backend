require('dotenv').config();
const fetch = require('node-fetch');
const prisma = require('../src/lib/prisma');

const BASE = `http://localhost:${process.env.PORT || 3000}/api/v1`;

// Helper to delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return { token: body.data.token, userId: body.data.user.id };
}

async function run() {
  console.log('--- Deep Dive Analysis of Bank Module ---');
  
  let adminToken, merchantToken;
  let bankId;
  let loanTypeId;

  try {
    // 1. Setup: Ensure we have an Admin and a Merchant
    const adminEmail = `admin-bank-test-${Date.now()}@test.com`;
    const merchantEmail = `merchant-bank-test-${Date.now()}@test.com`;
    const password = 'Password@123';
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);

    // Create Admin
    await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: adminEmail,
        phone: `99${Date.now().toString().slice(-8)}`,
        passwordHash: hash,
        role: 'ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true
      }
    });
    console.log('Created Admin:', adminEmail);

    // Create Merchant (Non-Admin)
    await prisma.user.create({
      data: {
        name: 'Test Merchant',
        email: merchantEmail,
        phone: `88${Date.now().toString().slice(-8)}`,
        passwordHash: hash,
        role: 'MERCHANT',
        status: 'ACTIVE',
        isEmailVerified: true,
        merchantProfile: {
          create: {
            businessName: 'Test Biz',
            gstNumber: 'GST123'
          }
        }
      }
    });
    console.log('Created Merchant:', merchantEmail);

    // Login
    const adminLogin = await login(adminEmail, password);
    adminToken = adminLogin.token;
    
    const merchantLogin = await login(merchantEmail, password);
    merchantToken = merchantLogin.token;

    // 2. Admin Creates a Loan Type (Prerequisite)
    console.log('\n--- Step 1: Admin Creates Loan Type ---');
    const loanTypeRes = await fetch(`${BASE}/loan-types`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `Bank Test Loan ${Date.now()}`,
        description: 'Loan for bank testing',
        schema: {},
        requiredDocuments: []
      })
    });
    const loanTypeData = await loanTypeRes.json();
    if (!loanTypeData.success) throw new Error(`Create Loan Type Failed: ${JSON.stringify(loanTypeData)}`);
    loanTypeId = loanTypeData.data.id;
    console.log('Loan Type Created:', loanTypeData.data.name);

    // 3. Admin Creates a Bank
    console.log('\n--- Step 2: Admin Creates Bank ---');
    const bankName = `Deep Dive Bank ${Date.now()}`;
    const bankRes = await fetch(`${BASE}/admin/banks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: bankName,
        loanTypeIds: [loanTypeId]
      })
    });
    const bankData = await bankRes.json();
    
    if (bankData.success) {
      bankId = bankData.data.id;
      console.log('✅ Bank Created Successfully:', bankData.data.name);
      console.log('Linked Loan Types:', bankData.data.loanTypes.length);
    } else {
      console.log('❌ Bank Creation Failed:', bankData);
    }

    // 4. Non-Admin Tries to Create Bank (Should Fail)
    console.log('\n--- Step 3: Non-Admin Tries to Create Bank (Should Fail) ---');
    const failRes = await fetch(`${BASE}/admin/banks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`
      },
      body: JSON.stringify({ name: 'Hacker Bank' })
    });
    if (failRes.status === 403) {
      console.log('✅ Non-Admin blocked correctly.');
    } else {
      console.log('❌ Non-Admin was NOT blocked:', failRes.status);
    }

    // 5. Public List Banks
    console.log('\n--- Step 4: Public List Banks ---');
    const listRes = await fetch(`${BASE}/banks?loanTypeId=${loanTypeId}`);
    const listData = await listRes.json();
    if (Array.isArray(listData) && listData.find(b => b.id === bankId)) {
      console.log('✅ Bank found in public list.');
    } else {
      console.log('❌ Bank NOT found in public list:', listData);
    }

    // 6. Update Bank
    console.log('\n--- Step 5: Admin Updates Bank ---');
    const updateRes = await fetch(`${BASE}/admin/banks/${bankId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `${bankName} Updated`,
        loanTypeIds: [] // Unlink loan types
      })
    });
    const updateData = await updateRes.json();
    if (updateData.success && updateData.data.name.includes('Updated')) {
      console.log('✅ Bank Updated Successfully.');
      if (updateData.data.loanTypes.length === 0) {
        console.log('✅ Loan Types unlinked successfully.');
      } else {
        console.log('❌ Loan Types NOT unlinked.');
      }
    } else {
      console.log('❌ Bank Update Failed:', updateData);
    }

    // 7. Delete Bank
    console.log('\n--- Step 6: Admin Deletes Bank ---');
    const deleteRes = await fetch(`${BASE}/admin/banks/${bankId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (deleteRes.ok) {
      console.log('✅ Bank Deleted Successfully.');
    } else {
      console.log('❌ Bank Deletion Failed:', await deleteRes.json());
    }

    // 8. Verify Deletion
    const verifyRes = await fetch(`${BASE}/banks`);
    const verifyData = await verifyRes.json();
    if (!verifyData.find(b => b.id === bankId)) {
      console.log('✅ Bank verified gone from list.');
    } else {
      console.log('❌ Bank still exists in list.');
    }

    // 9. Create Bank with Invalid Loan Type (Should Fail)
    console.log('\n--- Step 7: Create Bank with Invalid Loan Type (Should Fail) ---');
    const invalidBankRes = await fetch(`${BASE}/admin/banks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `Invalid Bank ${Date.now()}`,
        loanTypeIds: ['invalid-uuid-123']
      })
    });
    const invalidBankData = await invalidBankRes.json();
    if (!invalidBankData.success) {
      console.log('✅ Correctly failed to create bank with invalid loan type.');
      console.log('Error:', invalidBankData.message);
    } else {
      console.log('❌ SHOULD have failed but created bank:', invalidBankData);
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    if (loanTypeId) await prisma.loanType.delete({ where: { id: loanTypeId } }).catch(() => {});
    // Bank is already deleted in step 7
    await prisma.$disconnect();
  }
}

run();
