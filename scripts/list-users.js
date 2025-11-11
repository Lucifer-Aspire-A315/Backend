(async () => {
  try {
    require('dotenv').config();
    const prisma = require('../src/lib/prisma');
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, isEmailVerified: true, role: true },
    });
    console.log('Users:');
    users.forEach((u) => console.log(u));
    process.exit(0);
  } catch (err) {
    console.error('Error listing users:', err.message || err);
    process.exit(1);
  }
})();
