require('dotenv').config();
const prisma = require('../src/lib/prisma');
const bcrypt = require('bcryptjs');

async function run() {
  try {
    const email = 'testuser@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if exists
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      console.log('User exists, updating to verified...');
      user = await prisma.user.update({
        where: { email },
        data: {
          isEmailVerified: true,
          status: 'ACTIVE',
          passwordHash: hashedPassword, // Reset password just in case
        },
      });
    } else {
      console.log('Creating new verified user...');
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          name: 'Test User',
          role: 'CUSTOMER',
          phone: '1234567890',
          isEmailVerified: true,
          status: 'ACTIVE',
          customerProfile: {
            create: {
              address: '123 Test St',
              pincode: '123456',
            },
          },
        },
      });
    }

    console.log('User ready:', user.email);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
