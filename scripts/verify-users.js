(async () => {
  try {
    require('dotenv').config();
    const prisma = require('../src/lib/prisma');
    const emails = [
      'int.customer@example.com',
      'int.banker@example.com',
      'int.merchant@example.com',
      'admin@example.com',
    ];
    for (const email of emails) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        console.log(`User not found: ${email}`);
        continue;
      }
      if (user.isEmailVerified) {
        console.log(`Already verified: ${email}`);
        continue;
      }
      await prisma.user.update({ where: { email }, data: { isEmailVerified: true } });
      console.log(`Verified: ${email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error verifying users:', err.message || err);
    process.exit(1);
  }
})();
