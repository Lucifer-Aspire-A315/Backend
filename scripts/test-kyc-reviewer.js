require('dotenv').config();
const fetch = require('node-fetch');

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL || 'integration.merchant@example.com';
const MERCHANT_PASSWORD = process.env.MERCHANT_PASSWORD || 'Password123!';
const BANKER_EMAIL = process.env.BANKER_EMAIL || 'integration.banker@example.com';
const BANKER_PASSWORD = process.env.BANKER_PASSWORD || 'Password123!';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  return json;
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  return json;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(maxRetries = 20, delayMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {}
    await sleep(delayMs);
  }
  throw new Error('Server not reachable at /health');
}

(async () => {
  try {
    console.log('0) Wait for server readiness');
    await waitForServer();

    console.log('1) Merchant login');
    const merchantLogin = await post('/auth/login', {
      email: MERCHANT_EMAIL,
      password: MERCHANT_PASSWORD,
    });
    const merchantToken = merchantLogin.data.token;
    const merchantId = merchantLogin.data.user.id;

    console.log('2) Merchant generates KYC upload URL (PAN_CARD)');
    const sig = await post(
      '/kyc/upload-url',
      { docType: 'PAN_CARD' },
      merchantToken,
    );
    const { kycDocId, publicId } = sig.data;

    console.log('3) Merchant completes KYC upload');
    await post(
      '/kyc/complete-upload',
      { kycDocId, publicId, fileSize: 20480, contentType: 'application/pdf' },
      merchantToken,
    );

    console.log('4) Banker login');
    const bankerLogin = await post('/auth/login', {
      email: BANKER_EMAIL,
      password: BANKER_PASSWORD,
    });
    const bankerToken = bankerLogin.data.token;

    console.log('5) Banker fetches pending KYC');
    const pending = await get('/kyc/pending?limit=50', bankerToken);
    const found = pending.data.documents.find((d) => d.user && d.user.id === merchantId);
    if (!found) throw new Error('Uploaded KYC not found in pending list');

    console.log('6) Banker views KYC details');
    await get(`/kyc/${kycDocId}/review`, bankerToken);

    console.log('7) Banker verifies KYC document');
    await post(`/kyc/${kycDocId}/verify`, { status: 'VERIFIED', notes: 'All good' }, bankerToken);

    console.log('8) Merchant checks KYC status');
    const status = await get('/kyc/status', merchantToken);
    const panDoc = status.data.documents.find((d) => d.id === kycDocId);
    if (!panDoc || panDoc.status !== 'VERIFIED') throw new Error('KYC not verified as expected');

    console.log('KYC reviewer flow OK');
    process.exit(0);
  } catch (err) {
    console.error('KYC reviewer flow failed:', err.message);
    process.exit(1);
  }
})();
