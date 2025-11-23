require('dotenv').config();
const fetch = require('node-fetch');

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL || 'integration.merchant@example.com';
const MERCHANT_PASSWORD = process.env.MERCHANT_PASSWORD || 'Password123!';
const BANKER_EMAIL = process.env.BANKER_EMAIL || 'integration.banker@example.com';
const BANKER_PASSWORD = process.env.BANKER_PASSWORD || 'Password123!';
const LOAN_TYPE_ID = process.env.LOAN_TYPE_ID || '2828892f-7dad-4688-9750-97ae525c1880';

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
    } catch (_) {}
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

    console.log('1.a) Merchant uploads KYC docs (ID, ADDRESS, PAN)');
  const docTypes = ['ID_PROOF', 'ADDRESS_PROOF', 'PAN_CARD', 'BANK_STATEMENT'];
    const createdKycDocs = [];
    for (const docType of docTypes) {
      const sig = await post(
        '/kyc/upload-url',
        { docType },
        merchantToken,
      );
      const { kycDocId, publicId } = sig.data;
      await post(
        '/kyc/complete-upload',
        { kycDocId, publicId, fileSize: 12345, contentType: 'application/pdf' },
        merchantToken,
      );
      createdKycDocs.push(kycDocId);
    }

    console.log('2) Merchant applies for loan');
    const apply = await post(
      '/loan/apply',
      {
        loanTypeId: LOAN_TYPE_ID,
        amount: 150000,
        tenorMonths: 12,
        applicant: { type: 'merchant' },
        metadata: { businessGST: '27AAAAA1234A1Z5', monthlySales: 250000 },
      },
      merchantToken,
    );
    const loanId = apply.data.id;

    console.log('3) Banker login');
    const bankerLogin = await post('/auth/login', {
      email: BANKER_EMAIL,
      password: BANKER_PASSWORD,
    });
    const bankerToken = bankerLogin.data.token;
    const bankerId = bankerLogin.data.user.id;

    console.log('3.a) Banker verifies uploaded KYC docs');
    for (const kycDocId of createdKycDocs) {
      await post(`/kyc/${kycDocId}/verify`, { status: 'VERIFIED', notes: 'Looks good' }, bankerToken);
    }

    console.log('4) Banker self-assigns loan');
    await post(`/loan/${loanId}/assign`, { bankerId }, bankerToken);

  console.log('5) Banker approves loan');
  await post(`/loan/${loanId}/approve`, { notes: 'Looks good', interestRate: 12.5 }, bankerToken);

    console.log('6) Fetch loan');
    const loan = await get(`/loan/${loanId}`, merchantToken);

    console.log('RESULT:', { id: loan.data.id, status: loan.data.status });
    if (loan.data.status !== 'APPROVED') throw new Error('Loan not approved');

    console.log('Loan flow OK');
    process.exit(0);
  } catch (err) {
    console.error('Loan flow failed:', err.message);
    process.exit(1);
  }
})();
