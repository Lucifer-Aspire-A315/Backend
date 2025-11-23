require('dotenv').config();
const prisma = require('../src/lib/prisma');

console.log('prisma.refreshToken:', prisma.refreshToken);
console.log('prisma.RefreshToken:', prisma.RefreshToken);
console.log('Keys:', Object.keys(prisma));

// Don't disconnect if it's a shared instance or handle it carefully
// prisma.$disconnect();

