require('dotenv').config();
const prisma = require('../src/lib/prisma');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  try {
    console.log('Seeding integration data...');

    // Ensure an Integration Bank exists (required for BankerProfile)
    let bank = await prisma.bank.findFirst({ where: { name: 'Integration Bank' } });
    if (!bank) {
      bank = await prisma.bank.create({
        data: {
          id: uuidv4(),
          name: 'Integration Bank',
        },
      });
      console.log('Created bank:', bank.id);
    } else {
      console.log('Using existing bank:', bank.id);
    }

    // Create a loan type if none exists
    const existing = await prisma.loanType.findFirst();
    let loanType;
    if (!existing) {
      loanType = await prisma.loanType.create({
        data: {
          id: uuidv4(),
          name: 'Business Loan',
          code: 'BUSINESS',
          description: 'Loan for business expansion and working capital',
          schema: {
            type: 'object',
            properties: {
              businessGST: {
                type: 'string',
                pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
                description: 'Valid GST number',
              },
              monthlySales: {
                type: 'number',
                minimum: 0,
                description: 'Average monthly sales in INR',
              },
              yearsInBusiness: {
                type: 'integer',
                minimum: 0,
                description: 'Years the business has been operating',
              },
            },
            required: ['businessGST', 'monthlySales'],
          },
        },
      });
      console.log('Created loanType:', loanType.id);
    } else {
      loanType = existing;
      console.log('Using existing loanType:', loanType.id);
    }

    // Upsert customer user and profile (force isEmailVerified)
    const customerEmail = 'integration.customer@example.com';
    let customer = await prisma.user.findUnique({ where: { email: customerEmail } });
    if (!customer) {
      const passwordHash = await bcrypt.hash('Password123!', 12);
      customer = await prisma.user.create({
        data: {
          id: uuidv4(),
          name: 'Integration Customer',
          email: customerEmail,
          phone: '9123456789',
          passwordHash,
          role: 'CUSTOMER',
          isEmailVerified: true,
          customerProfile: {
            create: {
              address: '123 Test Street, Mumbai',
            },
          },
        },
      });
      console.log('Created customer:', customer.id);
    } else {
      if (!customer.isEmailVerified) {
        customer = await prisma.user.update({
          where: { id: customer.id },
          data: { isEmailVerified: true },
        });
        console.log('Updated existing customer to verified:', customer.id);
      } else {
        console.log('Using existing customer (verified):', customer.id);
      }
      // Ensure customer profile exists
      const existingCustomerProfile = await prisma.customerProfile.findUnique({
        where: { userId: customer.id },
      });
      if (!existingCustomerProfile) {
        await prisma.customerProfile.create({
          data: {
            id: uuidv4(),
            userId: customer.id,
            address: '123 Test Street, Mumbai',
          },
        });
        console.log('Created missing customer profile for:', customer.id);
      }
    }

    // Upsert merchant user and profile (force isEmailVerified)
    const merchantEmail = 'integration.merchant@example.com';
    let merchant = await prisma.user.findUnique({ where: { email: merchantEmail } });
    if (!merchant) {
      const passwordHash = await bcrypt.hash('Password123!', 12);
      merchant = await prisma.user.create({
        data: {
          id: uuidv4(),
          name: 'Integration Merchant',
          email: merchantEmail,
          phone: '9123456780',
          passwordHash,
          role: 'MERCHANT',
          isEmailVerified: true,
          merchantProfile: {
            create: {
              businessName: 'Test Merchant Business',
              gstNumber: '27AAAAA1234A1Z5',
              address: '456 Merchant Road, Delhi',
            },
          },
        },
      });
      console.log('Created merchant:', merchant.id);
    } else {
      if (!merchant.isEmailVerified) {
        merchant = await prisma.user.update({
          where: { id: merchant.id },
          data: { isEmailVerified: true },
        });
        console.log('Updated existing merchant to verified:', merchant.id);
      } else {
        console.log('Using existing merchant (verified):', merchant.id);
      }
      // Ensure merchant profile exists
      const existingMerchantProfile = await prisma.merchantProfile.findUnique({
        where: { userId: merchant.id },
      });
      if (!existingMerchantProfile) {
        await prisma.merchantProfile.create({
          data: {
            id: uuidv4(),
            userId: merchant.id,
            businessName: 'Test Merchant Business',
            gstNumber: '27AAAAA1234A1Z5',
            address: '456 Merchant Road, Delhi',
          },
        });
        console.log('Created missing merchant profile for:', merchant.id);
      }
    }

    // Upsert banker user and profile (force isEmailVerified)
    const bankerEmail = 'integration.banker@example.com';
    let banker = await prisma.user.findUnique({ where: { email: bankerEmail } });
    if (!banker) {
      const passwordHash = await bcrypt.hash('Password123!', 12);
      banker = await prisma.user.create({
        data: {
          id: uuidv4(),
          name: 'Integration Banker',
          email: bankerEmail,
          phone: '9234567890',
          passwordHash,
          role: 'BANKER',
          isEmailVerified: true,
          bankerProfile: {
            create: {
              bankId: bank.id,
              branch: 'HQ',
              pincode: '400001',
              employeeId: 'BNK001',
              status: 'ACTIVE',
            },
          },
        },
      });
      console.log('Created banker:', banker.id);
    } else {
      if (!banker.isEmailVerified) {
        banker = await prisma.user.update({
          where: { id: banker.id },
          data: { isEmailVerified: true },
        });
        console.log('Updated existing banker to verified:', banker.id);
      } else {
        console.log('Using existing banker (verified):', banker.id);
      }
      // Ensure banker profile exists (uses userId as primary key)
      const existingBankerProfile = await prisma.bankerProfile.findUnique({
        where: { userId: banker.id },
      });
      if (!existingBankerProfile) {
        await prisma.bankerProfile.create({
          data: {
            userId: banker.id,
            bankId: bank.id,
            branch: 'HQ',
            pincode: '400001',
            employeeId: 'BNK001',
            status: 'ACTIVE',
          },
        });
        console.log('Created missing banker profile for:', banker.id);
      }
    }

    // Create admin user
    const adminEmail = 'integration.admin@example.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      const passwordHash = await bcrypt.hash('Password123!', 12);
      admin = await prisma.user.create({
        data: {
          id: uuidv4(),
          name: 'Integration Admin',
          email: adminEmail,
          phone: '9334567890',
          passwordHash,
          role: 'ADMIN',
          isEmailVerified: true,
        },
      });
      console.log('Created admin:', admin.id);
    } else {
      if (!admin.isEmailVerified) {
        admin = await prisma.user.update({ where: { id: admin.id }, data: { isEmailVerified: true } });
        console.log('Updated existing admin to verified:', admin.id);
      } else {
        console.log('Using existing admin (verified):', admin.id);
      }
    }

  console.log('Seed complete.');
  console.log({ loanTypeId: loanType.id, customerEmail, merchantEmail, bankerEmail, adminEmail });
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
