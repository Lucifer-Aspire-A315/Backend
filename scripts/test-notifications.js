require('dotenv').config();
const fetch = require('node-fetch');
const prisma = require('../src/lib/prisma');

const BASE_URL = 'http://localhost:3000/api/v1';
let customerToken;
let bankerToken;
let customerId;
let kycDocId;

async function login(email, password, userAgent = 'TestAgent/1.0') {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'User-Agent': userAgent 
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Login failed: ${data.message}`);
  return data.data;
}

async function updateProfile(token) {
  const res = await fetch(`${BASE_URL}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Updated Name For Notification Test' }),
  });
  const data = await res.json();
  return data;
}

async function verifyKYC(token, docId) {
    const res = await fetch(`${BASE_URL}/kyc/${docId}/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'VERIFIED', notes: 'Looks good' }),
    });
    return await res.json();
}

async function checkNotifications(userId) {
    const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log('--- Recent Notifications ---');
    notifications.forEach(n => console.log(`[${n.type}] ${n.message}`));
    return notifications;
}

async function main() {
  try {
    console.log('--- Starting Notification Test ---');

    // 1. Login as Customer (New Device)
    console.log('Logging in as customer with new User-Agent...');
    const customerAuth = await login('integration.customer@example.com', 'Password123!', 'NewDevice/1.0-' + Date.now());
    customerToken = customerAuth.token;
    customerId = customerAuth.user.id;
    console.log('Login successful.');

    // 2. Update Profile
    console.log('Updating profile...');
    await updateProfile(customerToken);
    console.log('Profile updated.');

    // 3. Verify KYC
    // Ensure a pending doc exists
    let doc = await prisma.kYCDocument.findFirst({ where: { userId: customerId, status: 'PENDING' } });
    if (!doc) {
        console.log('Creating dummy KYC doc...');
        doc = await prisma.kYCDocument.create({
            data: {
                userId: customerId,
                type: 'AADHAAR',
                url: 'http://example.com/dummy.pdf',
                status: 'PENDING'
            }
        });
    }

    if (doc) {
        console.log(`Found/Created KYC Doc ${doc.id}, verifying...`);
        // Login as Banker
        const bankerAuth = await login('integration.banker@example.com', 'Password123!');
        bankerToken = bankerAuth.token;
        
        await verifyKYC(bankerToken, doc.id);
        console.log('KYC Verified.');
    } else {
        console.log('No KYC doc found, skipping KYC notification test.');
    }

    // 4. Check Notifications
    await checkNotifications(customerId);

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
