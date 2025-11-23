require('dotenv').config();
const prisma = require('../src/lib/prisma');
const userService = require('../src/services/userService');
const loanService = require('../src/services/loanService');
const dashboardService = require('../src/services/dashboardService');
const notificationService = require('../src/services/notificationService');

// Helper to generate unique data
const timestamp = Date.now();
const unique = (prefix) => `${prefix}-${timestamp}`;
const uniqueEmail = (prefix) => `${prefix}-${timestamp}@smoke.test`;
const uniquePhone = () => `9${Math.floor(Math.random() * 1000000000)}`;

async function main() {
  console.log('🚀 STARTING COMPREHENSIVE SMOKE TEST 🚀');
  console.log('========================================');

  let adminUser, bankerUser, merchantUser, customerUser;
  let bank, loanType;
  let loanId;

  try {
    // ----------------------------------------------------------------
    // STEP 1: SETUP INFRASTRUCTURE (Admin, Bank, LoanType)
    // ----------------------------------------------------------------
    console.log('\n[STEP 1] Setting up Infrastructure...');

    // 1.1 Create Admin
    const adminResult = await userService.createUserWithProfile({
      name: 'Smoke Admin',
      email: uniqueEmail('admin'),
      phone: uniquePhone(),
      password: 'password123',
      role: 'ADMIN',
    });
    adminUser = adminResult.user;
    console.log(`✅ Admin created: ${adminUser.email}`);

    // 1.2 Create Bank
    bank = await prisma.bank.create({
      data: { name: unique('Smoke Bank') },
    });
    console.log(`✅ Bank created: ${bank.name}`);

    // 1.3 Create Loan Type
    loanType = await prisma.loanType.create({
      data: {
        name: unique('Smoke Loan'),
        code: unique('SL'),
        description: 'Test Loan Type',
        schema: {
          type: 'object',
          properties: {
            purpose: { type: 'string' },
          },
          required: ['purpose'],
        },
      },
    });
    console.log(`✅ Loan Type created: ${loanType.name}`);


    // ----------------------------------------------------------------
    // STEP 2: BANKER LIFECYCLE
    // ----------------------------------------------------------------
    console.log('\n[STEP 2] Banker Lifecycle...');

    // 2.1 Register Banker
    const bankerResult = await userService.createUserWithProfile({
      name: 'Smoke Banker',
      email: uniqueEmail('banker'),
      phone: uniquePhone(),
      password: 'password123',
      role: 'BANKER',
      bankId: bank.id,
      branch: 'Main St',
      pincode: '123456',
      employeeId: unique('EMP'),
    });
    bankerUser = bankerResult.user;
    console.log(`✅ Banker registered: ${bankerUser.email} (Status: PENDING)`);

    // 2.2 Admin Activates Banker
    await prisma.bankerProfile.update({
      where: { userId: bankerUser.id },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Banker activated by Admin`);


    // ----------------------------------------------------------------
    // STEP 3: MERCHANT LIFECYCLE & LOAN APPLICATION
    // ----------------------------------------------------------------
    console.log('\n[STEP 3] Merchant Lifecycle & Application...');

    // 3.1 Register Merchant
    const merchantResult = await userService.createUserWithProfile({
      name: 'Smoke Merchant',
      email: uniqueEmail('merchant'),
      phone: uniquePhone(),
      password: 'password123',
      role: 'MERCHANT',
      businessName: 'Smoke Biz',
      businessType: 'Retail',
      address: '123 Smoke St',
    });
    merchantUser = merchantResult.user;
    console.log(`✅ Merchant registered: ${merchantUser.email}`);

    // 3.2 Merchant Applies for Loan (Self)
    const loanData = {
      applicant: { type: 'merchant' },
      loanTypeId: loanType.id,
      amount: 50000,
      tenorMonths: 12,
      metadata: { purpose: 'Expansion' },
      documents: [
        {
          public_id: 'test_doc_1',
          secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          filename: 'business_plan.pdf',
          type: 'application/pdf',
          bytes: 1024,
        },
      ],
    };

    const loan = await loanService.applyForLoan(loanData, merchantUser.id);
    loanId = loan.id;
    console.log(`✅ Loan applied by Merchant: ${loan.id} (Status: ${loan.status})`);

    // 3.3 Verify Merchant Dashboard
    const merchStats = await dashboardService.getMerchantStats(merchantUser.id);
    if (merchStats.summary.totalApps !== 1) throw new Error('Merchant dashboard stats incorrect');
    console.log(`✅ Merchant Dashboard verified (Total Apps: ${merchStats.summary.totalApps})`);

    // 3.4 Merchant Applies for Loan (On Behalf of New Customer)
    console.log('\n[STEP 3.5] Merchant applying for New Customer...');
    const customerEmail = uniqueEmail('customer');
    const customerLoanData = {
      applicant: { 
        type: 'new',
        customer: {
          name: 'Smoke Customer',
          email: customerEmail,
          phone: uniquePhone(),
          address: '456 Customer Ln'
        }
      },
      loanTypeId: loanType.id,
      amount: 25000,
      tenorMonths: 6,
      metadata: { purpose: 'Personal' },
      documents: []
    };

    const custLoan = await loanService.applyForLoan(customerLoanData, merchantUser.id);
    console.log(`✅ Loan applied for Customer: ${custLoan.id}`);
    
    // Verify Customer User Created
    customerUser = await prisma.user.findUnique({ where: { email: customerEmail } });
    if (!customerUser) throw new Error('Customer user not created');
    console.log(`✅ Customer User created: ${customerUser.email}`);


    // ----------------------------------------------------------------
    // STEP 4: LOAN PROCESSING (Banker)
    // ----------------------------------------------------------------
    console.log('\n[STEP 4] Loan Processing...');

    // 4.1 Banker checks Dashboard (Unassigned)
    const bankerStatsBefore = await dashboardService.getBankerStats(bankerUser.id);
    if (bankerStatsBefore.queue.unassigned < 1) throw new Error('Banker dashboard unassigned count incorrect');
    console.log(`✅ Banker sees unassigned loan`);

    // 4.2 Assign Loan
    await loanService.assignBanker(loanId, bankerUser.id, adminUser.id); // Admin assigns or Banker picks up (simulating Admin assign here)
    console.log(`✅ Loan assigned to Banker`);

    // 4.3 Banker Reviews & Approves
    // Note: In real flow, KYC needs to be verified. We'll force update KYC status for this test or mock it.
    // The loanService.approveLoan checks for KYC. Let's see if we can bypass or if we need to "verify" KYC.
    // The service checks: isKYCComplete.
    // For a merchant applying for themselves, they need KYC docs.
    // Let's upload a dummy KYC doc for the merchant user to satisfy the check.
    
    await prisma.kYCDocument.create({
      data: {
        userId: merchantUser.id,
        type: 'id_proof',
        status: 'VERIFIED',
        url: 'http://dummy',
      },
    });
    // We might need more depending on the rules, but let's try.
    // Actually, let's just manually update the loan's KYC status if the service blocks us, 
    // BUT we want to test the service.
    // Let's try to approve and catch error if KYC is missing.
    
    try {
      await loanService.approveLoan(loanId, bankerUser.id);
      console.log(`✅ Loan Approved!`);
    } catch (e) {
      if (e.code === 'KYC_INCOMPLETE') {
        console.log(`⚠️ Approval blocked by KYC (Expected). Adding missing KYC...`);
        // Add missing KYC types
        const missing = e.details.missingTypes;
        for (const type of missing) {
           await prisma.kYCDocument.create({
            data: {
              userId: merchantUser.id,
              type: type,
              status: 'VERIFIED',
              url: 'http://dummy',
            },
          });
        }
        // Retry Approval
        await loanService.approveLoan(loanId, bankerUser.id);
        console.log(`✅ Loan Approved after KYC fix!`);
      } else {
        throw e;
      }
    }


    // ----------------------------------------------------------------
    // STEP 5: NOTIFICATIONS & FINAL CHECKS
    // ----------------------------------------------------------------
    console.log('\n[STEP 5] Final Checks...');

    // 5.1 Check Notifications
    // Wait a bit for async notifications to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const notifs = await notificationService.getUserNotifications(merchantUser.id);
    const approvalNotif = notifs.notifications.find(n => n.type === 'LOAN_APPROVED');
    if (!approvalNotif) throw new Error('Approval notification not found');
    console.log(`✅ Notification received: ${approvalNotif.message}`);

    // 5.2 Check Admin Dashboard
    const adminStats = await dashboardService.getAdminStats();
    if (adminStats.loans.byStatus.APPROVED.count < 1) throw new Error('Admin stats missing approved loan');
    console.log(`✅ Admin Dashboard verified (Approved Volume: ${adminStats.loans.byStatus.APPROVED.volume})`);

    console.log('\n========================================');
    console.log('🎉 SMOKE TEST COMPLETED SUCCESSFULLY 🎉');
    console.log('========================================');

  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED ❌');
    console.error(error);
  } finally {
    // Cleanup (Optional, but good for repeated runs)
    console.log('\nCleaning up...');
    if (loanId) {
        await prisma.auditLog.deleteMany({ where: { loanId: loanId } });
        await prisma.document.deleteMany({ where: { loanId: loanId } });
        await prisma.loan.delete({ where: { id: loanId } });
    }
    // Cleanup Customer Loan & User
    if (customerUser) {
      // Find customer loan first
      const cLoan = await prisma.loan.findFirst({ where: { applicantId: customerUser.id } });
      if (cLoan) {
          await prisma.auditLog.deleteMany({ where: { loanId: cLoan.id } });
          await prisma.document.deleteMany({ where: { loanId: cLoan.id } });
          await prisma.loan.delete({ where: { id: cLoan.id } });
      }
      
      await prisma.customerProfile.delete({ where: { userId: customerUser.id } });
      await prisma.user.delete({ where: { id: customerUser.id } });
    }

    if (merchantUser) {
        await prisma.kYCDocument.deleteMany({ where: { userId: merchantUser.id } });
        await prisma.notification.deleteMany({ where: { userId: merchantUser.id } });
        await prisma.document.deleteMany({ where: { uploaderId: merchantUser.id } });
        await prisma.merchantProfile.delete({ where: { userId: merchantUser.id } });
        await prisma.user.delete({ where: { id: merchantUser.id } });
    }
    if (bankerUser) {
        await prisma.bankerProfile.delete({ where: { userId: bankerUser.id } });
        await prisma.user.delete({ where: { id: bankerUser.id } });
    }
    if (adminUser) await prisma.user.delete({ where: { id: adminUser.id } });
    if (loanType) await prisma.loanType.delete({ where: { id: loanType.id } });
    if (bank) await prisma.bank.delete({ where: { id: bank.id } });
    
    await prisma.$disconnect();
  }
}

main();
