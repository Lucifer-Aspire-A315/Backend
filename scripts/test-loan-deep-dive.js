require('dotenv').config();
const fetch = require('node-fetch');
const prisma = require('../src/lib/prisma');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary for test script
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  console.log('--- Deep Dive Analysis of Loan Module ---');
  
  let adminToken, merchantToken;
  let loanTypeId;
  let bankId;
  let loanId;

  try {
    // 1. Setup: Ensure we have an Admin and a Merchant
    // We'll use existing ones or create them if needed. 
    // For this script, I'll assume the standard test users exist or I'll create them.
    
    // Create Admin (if not exists) - actually we can't easily create admin via API usually.
    // Let's assume we have a seed admin or use a direct DB insert.
    // For now, let's try to login as 'admin@fintech.com' (common seed).
    // If that fails, we'll create one directly in DB.
    
    const adminEmail = `admin-test-${Date.now()}@test.com`;
    const merchantEmail = `merchant-test-${Date.now()}@test.com`;
    const customerEmail = `customer-test-${Date.now()}@test.com`;
    const password = 'Password@123';
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);

    // Create Admin
    const adminUser = await prisma.user.create({
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

    // Create Merchant
    const merchantUser = await prisma.user.create({
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

    // Create Customer
    const customerUser = await prisma.user.create({
      data: {
        name: 'Test Customer',
        email: customerEmail,
        phone: `77${Date.now().toString().slice(-8)}`,
        passwordHash: hash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        isEmailVerified: true,
        customerProfile: {
          create: {
            address: '123 Test St'
          }
        }
      }
    });
    console.log('Created Customer:', customerEmail);

    // Login
    const adminLogin = await login(adminEmail, password);
    adminToken = adminLogin.token;
    
    const merchantLogin = await login(merchantEmail, password);
    merchantToken = merchantLogin.token;

    // 2. Admin Creates a Bank
    console.log('\n--- Step 1: Admin Creates Bank ---');
    const bankRes = await fetch(`${BASE}/admin/banks`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ name: `Test Bank ${Date.now()}` })
    });
    const bankData = await bankRes.json();
    if (!bankData.success) throw new Error(`Create Bank Failed: ${JSON.stringify(bankData)}`);
    bankId = bankData.data.id;
    console.log('Bank Created:', bankData.data.name);

    // Create Banker linked to this Bank
    const bankerEmail = `banker-test-${Date.now()}@test.com`;
    const bankerUser = await prisma.user.create({
      data: {
        name: 'Test Banker',
        email: bankerEmail,
        phone: `66${Date.now().toString().slice(-8)}`,
        passwordHash: hash,
        role: 'BANKER',
        status: 'ACTIVE',
        isEmailVerified: true,
        bankerProfile: {
          create: {
            bankId: bankId,
            branch: 'Main Branch',
            pincode: '123456'
          }
        }
      }
    });
    console.log('Created Banker:', bankerEmail);
    const bankerLogin = await login(bankerEmail, password);
    const bankerToken = bankerLogin.token;

    // 3a. Admin Creates Loan Type with INVALID Schema (Should Fail)
    console.log('\n--- Step 2a: Admin Creates Loan Type with INVALID Schema (Should Fail) ---');
    const invalidSchemaRes = await fetch(`${BASE}/loan-types`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `Broken Loan ${Date.now()}`,
        description: 'This should fail',
        bankIds: [bankId],
        schema: { type: 'invalid_type_here' } // Invalid JSON Schema
      })
    });
    const invalidSchemaData = await invalidSchemaRes.json();
    if (invalidSchemaRes.status === 400 && invalidSchemaData.message.includes('Invalid JSON Schema')) {
      console.log('✅ Loan Type creation correctly failed due to invalid schema.');
    } else {
      console.log('❌ Loan Type creation SHOULD have failed but passed:', invalidSchemaData);
    }

    // 3. Admin Creates Loan Type with Custom Schema and Required Documents
    console.log('\n--- Step 2: Admin Creates Loan Type with Custom Schema and Required Documents ---');
    // We define a schema that requires 'annualRevenue' (number) and 'businessAge' (number)
    const customSchema = {
      type: 'object',
      properties: {
        annualRevenue: { type: 'number', minimum: 100000 },
        businessAge: { type: 'integer', minimum: 1 }
      },
      required: ['annualRevenue', 'businessAge']
    };

    const loanTypeRes = await fetch(`${BASE}/loan-types`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `SME Loan ${Date.now()}`,
        description: 'Loan for small businesses',
        bankIds: [bankId],
        schema: customSchema,
        requiredDocuments: ['BANK_STATEMENT']
      })
    });
    const loanTypeData = await loanTypeRes.json();
    if (!loanTypeData.success) throw new Error(`Create LoanType Failed: ${JSON.stringify(loanTypeData)}`);
    loanTypeId = loanTypeData.data.id;
    console.log('Loan Type Created:', loanTypeData.data.name);
    console.log('Schema:', JSON.stringify(loanTypeData.data.schema));
    console.log('Required Documents:', loanTypeData.data.requiredDocuments);

    // 4. Merchant Applies for Loan (Validation Failure Test)
    console.log('\n--- Step 3: Merchant Applies - Missing Required Fields ---');
    const failRes = await fetch(`${BASE}/loan/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`
      },
      body: JSON.stringify({
        loanTypeId,
        amount: 50000,
        tenorMonths: 12,
        applicant: { type: 'merchant' },
        metadata: {
          annualRevenue: 50000 // Missing businessAge, and revenue < 100000 (if min was checked)
        }
      })
    });
    const failData = await failRes.json();
    if (failRes.status === 400) {
      console.log('Validation correctly failed:', failData.message || failData.error);
    } else {
      console.error('Validation SHOULD have failed but passed:', failData);
    }

    // 5. Merchant Applies for Loan (Fake Document - Should Fail)
    console.log('\n--- Step 4a: Merchant Applies - Fake Document (Should Fail) ---');
    const fakeDocRes = await fetch(`${BASE}/loan/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`
      },
      body: JSON.stringify({
        loanTypeId,
        amount: 150000,
        tenorMonths: 12,
        applicant: { type: 'merchant' },
        metadata: {
          annualRevenue: 200000,
          businessAge: 3
        },
        documents: [
          {
            public_id: 'fake-public-id-' + Date.now(),
            secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            filename: 'bank_statement.pdf',
            type: 'BANK_STATEMENT',
            bytes: 1024
          }
        ]
      })
    });
    const fakeDocData = await fakeDocRes.json();
    if (fakeDocRes.status === 400 && fakeDocData.message.includes('Invalid documents')) {
      console.log('✅ Document verification correctly failed for fake ID.');
    } else {
      console.log('❌ Document verification SHOULD have failed but passed:', fakeDocData);
    }

    // 5b. Merchant Applies for Loan (Real Document - Should Success)
    console.log('\n--- Step 4b: Merchant Applies - Real Document (Should Success) ---');
    
    // Upload a real file to Cloudinary to get a valid public_id
    // We MUST simulate the new naming convention: {userId}/{folder}/{id}
    const merchantId = merchantUser.id;
    
    let realPublicId;
    try {
      // Upload with the correct prefix
      const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
        public_id: `${merchantId}/test_uploads/${Date.now()}`
      });
      realPublicId = uploadResult.public_id;
      console.log('Uploaded test file to Cloudinary:', realPublicId);
    } catch (e) {
      console.warn('Skipping real document test - Cloudinary upload failed (check env vars):', e.message);
    }

    if (realPublicId) {
      const successRes = await fetch(`${BASE}/loan/apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${merchantToken}`
        },
        body: JSON.stringify({
          loanTypeId,
          amount: 150000,
          tenorMonths: 12,
          applicant: { type: 'merchant' },
          metadata: {
            annualRevenue: 200000,
            businessAge: 3
          },
          documents: [
            {
              public_id: realPublicId,
              secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
              filename: 'bank_statement.pdf',
              type: 'BANK_STATEMENT',
              bytes: 1024
            }
          ]
        })
      });
      const successData = await successRes.json();
      if (!successData.success) throw new Error(`Apply Loan Failed: ${JSON.stringify(successData)}`);
      loanId = successData.data.id;
      console.log('Loan Applied Successfully:', loanId);
      console.log('Metadata Stored:', successData.data.metadata);
      console.log('Documents Stored:', successData.data.documents?.length || 0);
    } else {
      console.log('Skipping success test due to upload failure.');
    }

    // 5c. Merchant Applies with Someone Else's Document (Should Fail)
    console.log('\n--- Step 4c: Merchant Applies - Stolen Document (Should Fail) ---');
    // We upload a file with a DIFFERENT user ID prefix
    let stolenPublicId;
    try {
      const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
        public_id: `some-other-user-id/test_uploads/${Date.now()}`
      });
      stolenPublicId = uploadResult.public_id;
    } catch (e) { console.warn('Skipping stolen doc test'); }

    if (stolenPublicId) {
       const stolenRes = await fetch(`${BASE}/loan/apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${merchantToken}`
        },
        body: JSON.stringify({
          loanTypeId,
          amount: 150000,
          tenorMonths: 12,
          applicant: { type: 'merchant' },
          metadata: { annualRevenue: 200000, businessAge: 3 },
          documents: [{
            public_id: stolenPublicId,
            secure_url: '...',
            filename: 'stolen.pdf',
            type: 'BANK_STATEMENT',
            bytes: 1024
          }]
        })
      });
      const stolenData = await stolenRes.json();
      if (stolenRes.status === 400 && stolenData.message.includes('do not belong to you')) {
        console.log('✅ Ownership check correctly failed for stolen document.');
      } else {
        console.log('❌ Ownership check SHOULD have failed but passed:', stolenData);
      }
    }

    // 5d. Merchant Applies with Mixed Documents (Merchant + Customer) - Should Success
    console.log('\n--- Step 4d: Merchant Applies - Mixed Documents (Merchant + Customer) ---');
    
    let merchantDocId, customerDocId;
    try {
      // Upload Merchant Doc
      const mUpload = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
        public_id: `${merchantUser.id}/test_uploads/m_${Date.now()}`
      });
      merchantDocId = mUpload.public_id;

      // Upload Customer Doc
      const cUpload = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
        public_id: `${customerUser.id}/test_uploads/c_${Date.now()}`
      });
      customerDocId = cUpload.public_id;
      
      console.log('Uploaded Merchant Doc:', merchantDocId);
      console.log('Uploaded Customer Doc:', customerDocId);

    } catch (e) { console.warn('Skipping mixed doc test - upload failed', e.message); }

    if (merchantDocId && customerDocId) {
      const mixedRes = await fetch(`${BASE}/loan/apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${merchantToken}`
        },
        body: JSON.stringify({
          loanTypeId,
          amount: 200000,
          tenorMonths: 24,
          applicant: { 
            type: 'existing',
            customerId: customerUser.id 
          },
          metadata: { annualRevenue: 300000, businessAge: 5 },
          documents: [
            {
              public_id: merchantDocId,
              secure_url: '...',
              filename: 'merchant_doc.pdf',
              type: 'BANK_STATEMENT',
              bytes: 1024
            },
            {
              public_id: customerDocId,
              secure_url: '...',
              filename: 'customer_doc.pdf',
              type: 'BANK_STATEMENT',
              bytes: 1024
            }
          ]
        })
      });
      
      const mixedData = await mixedRes.json();
      if (mixedData.success) {
        console.log('✅ Mixed ownership check passed (Merchant + Customer docs accepted).');
        loanId = mixedData.data.id; // Update loanId for verification step
      } else {
        console.log('❌ Mixed ownership check FAILED:', mixedData);
      }
    }

    // 6. Verify Data in DB
    console.log('\n--- Step 5: Verifying Data in DB ---');
    const dbLoan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { documents: true }
    });
    
    console.log('DB Loan Metadata:', dbLoan.metadata);
    console.log('DB Loan Documents:', dbLoan.documents.length);
    
    if (dbLoan.metadata.annualRevenue === 200000) {
      console.log('✅ Metadata stored correctly.');
    } else {
      console.log('❌ Metadata mismatch.');
    }

    if (dbLoan.documents.length === 1 && dbLoan.documents[0].type === 'BANK_STATEMENT') {
      console.log('✅ Document stored correctly.');
    } else {
      console.log('❌ Document storage failed.');
    }

    // 7. Check for Missing Features (Document Validation)
    console.log('\n--- Step 6: Checking for Missing Features (Document Validation) ---');
    console.log('Attempting to apply WITHOUT documents (Should Fail)...');
    
    const noDocRes = await fetch(`${BASE}/loan/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`
      },
      body: JSON.stringify({
        loanTypeId,
        amount: 150000,
        tenorMonths: 12,
        applicant: { type: 'merchant' },
        metadata: {
          annualRevenue: 200000,
          businessAge: 3
        },
        documents: [] // No documents
      })
    });
    
    const noDocData = await noDocRes.json();
    if (noDocRes.status === 400 && noDocData.message.includes('Missing required documents')) {
      console.log('✅ Loan application correctly failed due to missing documents.');
    } else {
      console.log('❌ Loan application SHOULD have failed but passed or failed with wrong error:', noDocData);
    }

    // 8. Assign Banker & Approve Loan (Verify Interest Rate)
    console.log('\n--- Step 7: Assign Banker & Approve Loan (Verify Interest Rate) ---');
    if (loanId) {
      // Assign Banker
      const assignRes = await fetch(`${BASE}/loan/${loanId}/assign`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}` // Admin assigns banker
        },
        body: JSON.stringify({ bankerId: bankerUser.id })
      });
      const assignData = await assignRes.json();
      if (!assignData.success) console.log('❌ Assign Banker Failed:', assignData);
      else console.log('✅ Banker Assigned.');

      // Approve Loan with Interest Rate
      const approveRes = await fetch(`${BASE}/loan/${loanId}/approve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bankerToken}`
        },
        body: JSON.stringify({ 
          notes: 'Looks good',
          interestRate: 15.5 
        })
      });
      const approveData = await approveRes.json();
      
      if (approveData.success && approveData.data.status === 'APPROVED') {
        console.log('✅ Loan Approved.');
        
        // Verify Interest Rate in DB
        const approvedLoan = await prisma.loan.findUnique({ where: { id: loanId } });
        if (Number(approvedLoan.interestRate) === 15.5) {
          console.log('✅ Interest Rate correctly stored as 15.5%');
        } else {
          console.log('❌ Interest Rate mismatch:', approvedLoan.interestRate);
        }

        // 9. Cancel Loan (Verify Cancellation allowed in APPROVED state)
        console.log('\n--- Step 8: Cancel Loan (Verify Cancellation allowed in APPROVED state) ---');
        const cancelRes = await fetch(`${BASE}/loan/${loanId}/cancel`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${merchantToken}`
          },
          body: JSON.stringify({ reason: 'Changed my mind' })
        });
        const cancelData = await cancelRes.json();
        
        if (cancelData.success && cancelData.data.status === 'CANCELLED') {
          console.log('✅ Loan Cancelled successfully from APPROVED state.');
        } else {
          console.log('❌ Loan Cancellation Failed:', cancelData);
        }

      } else {
        console.log('❌ Loan Approval Failed:', approveData);
      }
    }
  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    // Cleanup
    console.log('\n--- Cleanup ---');
    if (loanId) {
        await prisma.auditLog.deleteMany({ where: { loanId } });
        await prisma.document.deleteMany({ where: { loanId } });
        await prisma.loan.deleteMany({ where: { loanTypeId } });
    }
    if (loanTypeId) await prisma.loanType.delete({ where: { id: loanTypeId } });
    if (bankId) {
      // Remove bank relation from bankers if any (none here)
      await prisma.bankerProfile.deleteMany({ where: { bankId } });
      await prisma.bank.delete({ where: { id: bankId } });
    }
    if (adminToken) await prisma.user.delete({ where: { email: `admin-test-${Date.now()}@test.com` } }).catch(() => {}); // cleanup might fail due to dynamic email
    // Better cleanup:
    // We created users with specific emails, let's delete them.
    // But we need their IDs.
    // Since we are in a script, we can just let the DB be or try to clean up by email pattern if needed.
    // For now, minimal cleanup is fine as it's a dev env.
    
    await prisma.$disconnect();
  }
}

run();
