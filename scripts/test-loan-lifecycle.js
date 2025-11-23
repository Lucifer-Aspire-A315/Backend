require('dotenv').config();
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

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
  try {
    console.log('--- Testing Loan Disbursement & Cancellation ---');

    // 1. Setup Users
    // We need a Merchant (to apply), a Banker (to approve/disburse)
    // Assuming we have seed data or can use existing users.
    // For this test, let's assume we have:
    // Merchant: merchant@gap.test / password123
    // Banker: banker@gap.test / password123
    
    // Note: You might need to ensure these users exist or create them.
    // Let's try to use the ones from list-users.js if possible, or just hardcode known test creds.
    // Based on previous context, we have 'testuser@example.com' (Customer).
    // We need a Banker. Let's create one if needed or use existing.
    
    // Let's use the 'create-verified-user.js' logic to ensure we have a banker.
    // Actually, let's just try to login as a banker. If it fails, we'll need to seed.
    
    console.log('1. Logging in as Banker...');
    // We need a banker. Let's assume one exists from seed-integration.js or similar.
    // If not, this test might fail on login.
    // Let's try to find a banker from the DB first using a script? 
    // No, let's just try to login with a known seed banker if available.
    // If not available, I'll create a helper to create a banker.
    
    // Let's create a banker on the fly to be safe.
    const prisma = require('../src/lib/prisma');
    const bcrypt = require('bcryptjs');
    
    const bankerEmail = `banker-test-${Date.now()}@test.com`;
    const bankerPass = 'Password123!';
    const bankerHash = await bcrypt.hash(bankerPass, 10);
    
    // Create Bank
    let bank = await prisma.bank.findFirst();
    if (!bank) {
      bank = await prisma.bank.create({ data: { name: 'Test Bank ' + Date.now() } });
    }

    const bankerUser = await prisma.user.create({
      data: {
        name: 'Test Banker',
        email: bankerEmail,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        passwordHash: bankerHash,
        role: 'BANKER',
        isEmailVerified: true,
        status: 'ACTIVE',
        bankerProfile: {
          create: {
            bankId: bank.id,
            branch: 'Main',
            pincode: '123456',
            status: 'ACTIVE'
          }
        }
      }
    });
    console.log(`Created Banker: ${bankerEmail}`);

    const merchantEmail = `merchant-test-${Date.now()}@test.com`;
    const merchantUser = await prisma.user.create({
      data: {
        name: 'Test Merchant',
        email: merchantEmail,
        phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        passwordHash: bankerHash, // same pass
        role: 'MERCHANT',
        isEmailVerified: true,
        status: 'ACTIVE',
        merchantProfile: {
          create: {
            businessName: 'Test Biz',
            pincode: '123456'
          }
        }
      }
    });
    console.log(`Created Merchant: ${merchantEmail}`);

    // Login
    const bankerAuth = await login(bankerEmail, bankerPass);
    const merchantAuth = await login(merchantEmail, bankerPass);

    // 2. Apply for Loan (Merchant)
    console.log('\n2. Applying for Loan...');
    const loanType = await prisma.loanType.findFirst();
    if (!loanType) throw new Error('No loan types found');

    const applyRes = await fetch(`${BASE}/loan/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantAuth.token}`
      },
      body: JSON.stringify({
        applicant: { type: 'merchant' },
        loanTypeId: loanType.id,
        amount: 50000,
        tenorMonths: 12,
        metadata: {}
      }),
    });
    const applyData = await applyRes.json();
    if (!applyData.success) throw new Error('Loan application failed: ' + JSON.stringify(applyData));
    const loanId = applyData.data.id;
    console.log('Loan Applied:', loanId);

    // 3. Cancel Loan (Merchant) - Test Cancellation
    console.log('\n3. Testing Cancellation...');
    const cancelRes = await fetch(`${BASE}/loan/${loanId}/cancel`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantAuth.token}`
      },
      body: JSON.stringify({ reason: 'Changed my mind' }),
    });
    const cancelData = await cancelRes.json();
    if (!cancelData.success) throw new Error('Cancellation failed: ' + JSON.stringify(cancelData));
    console.log('Loan Cancelled Successfully.');

    // 4. Apply for another loan (to test Disbursement)
    console.log('\n4. Applying for second loan (for disbursement)...');
    const applyRes2 = await fetch(`${BASE}/loan/apply`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantAuth.token}`
      },
      body: JSON.stringify({
        applicant: { type: 'merchant' },
        loanTypeId: loanType.id,
        amount: 50000,
        tenorMonths: 12,
        metadata: {}
      }),
    });
    const applyData2 = await applyRes2.json();
    const loanId2 = applyData2.data.id;
    console.log('Second Loan Applied:', loanId2);

    // 5. Assign Banker
    console.log('\n5. Assigning Banker...');
    const assignRes = await fetch(`${BASE}/loan/${loanId2}/assign`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bankerAuth.token}`
      },
      body: JSON.stringify({ bankerId: bankerAuth.userId }),
    });
    if (!assignRes.ok) throw new Error('Assign failed');
    console.log('Banker Assigned.');

    // 6. Approve Loan (Skip KYC check for now by mocking or ensuring it passes? 
    // The service checks KYC. We might need to hack the DB to set KYC status or mock it.
    // Let's manually update the loan to bypass KYC check for this test script, 
    // OR we can just update the code to allow approval if we are admin? No, service enforces it.
    // Let's manually update the loan status to UNDER_REVIEW and KYC to VERIFIED via Prisma to simulate a passed KYC.
    console.log('Simulating KYC verification...');
    await prisma.loan.update({
      where: { id: loanId2 },
      data: { kycStatus: 'VERIFIED' } // Hack to bypass KYC check in approveLoan? 
      // Wait, approveLoan checks `kycService.isKYCComplete`. 
      // That checks the `KYCDocument` table.
      // We need to insert dummy KYC docs.
    });
    
    // Actually, let's just insert the needed KYC docs.
    // Assuming 'ID_PROOF' and 'ADDRESS_PROOF' are needed.
    await prisma.kYCDocument.createMany({
      data: [
        { userId: merchantAuth.userId, type: 'ID_PROOF', status: 'VERIFIED', url: 'http://dummy' },
        { userId: merchantAuth.userId, type: 'ADDRESS_PROOF', status: 'VERIFIED', url: 'http://dummy' },
        { userId: merchantAuth.userId, type: 'PAN_CARD', status: 'VERIFIED', url: 'http://dummy' },
        { userId: merchantAuth.userId, type: 'BANK_STATEMENT', status: 'VERIFIED', url: 'http://dummy' }
      ]
    });

    console.log('\n6. Approving Loan...');
    const approveRes = await fetch(`${BASE}/loan/${loanId2}/approve`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bankerAuth.token}`
      },
      body: JSON.stringify({ notes: 'Looks good' }),
    });
    const approveData = await approveRes.json();
    if (!approveData.success) {
        console.log('Approval failed details:', approveData);
        throw new Error('Approval failed');
    }
    console.log('Loan Approved.');

    // 7. Disburse Loan
    console.log('\n7. Disbursing Loan...');
    const disburseRes = await fetch(`${BASE}/loan/${loanId2}/disburse`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bankerAuth.token}`
      },
      body: JSON.stringify({ referenceId: 'TXN-123456', notes: 'Sent via NEFT' }),
    });
    const disburseData = await disburseRes.json();
    if (!disburseData.success) throw new Error('Disbursement failed: ' + JSON.stringify(disburseData));
    
    console.log('Loan Disbursed Successfully!');
    console.log('Status:', disburseData.data.status);
    console.log('Metadata:', disburseData.data.metadata);

    // Cleanup
    console.log('Cleaning up...');
    await prisma.auditLog.deleteMany({ where: { loanId: { in: [loanId, loanId2] } } });
    await prisma.loan.deleteMany({ where: { id: { in: [loanId, loanId2] } } });
    
    // Delete profiles and related data first
    await prisma.bankerProfile.deleteMany({ where: { userId: bankerUser.id } });
    await prisma.merchantProfile.deleteMany({ where: { userId: merchantUser.id } });
    await prisma.kYCDocument.deleteMany({ where: { userId: { in: [bankerUser.id, merchantUser.id] } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [bankerUser.id, merchantUser.id] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [bankerUser.id, merchantUser.id] } } });
    
    await prisma.user.delete({ where: { id: bankerUser.id } });
    await prisma.user.delete({ where: { id: merchantUser.id } });
    await prisma.$disconnect();

  } catch (error) {
    console.error('Test Failed:', error);
    process.exit(1);
  }
}

run();
