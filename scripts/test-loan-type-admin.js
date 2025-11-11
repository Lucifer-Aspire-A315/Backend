require('dotenv').config();
const fetch = require('node-fetch');

const BASE = process.env.BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'integration.admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Password123!';

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

async function put(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
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

async function del(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

function randCode(prefix = 'TEST') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

(async () => {
  try {
    console.log('1) Admin login');
    const adminLogin = await post('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    const token = adminLogin.data.token;

    console.log('2) Create loan type');
    const code = randCode('BUSINESS');
    const created = await post('/loan-types', {
      name: `Business ${code}`,
      code,
      description: 'Created via admin test',
      schema: {
        type: 'object',
        properties: { turnover: { type: 'number', minimum: 0 } },
        required: ['turnover']
      }
    }, token);
    const id = created.data.id;

    console.log('3) Get by id');
  await get(`/loan-types/${id}`, token);

    console.log('4) Update');
    const updated = await put(`/loan-types/${id}`, { description: 'Updated via admin test' }, token);

    console.log('5) List');
    const list = await get('/loan-types', token);

    console.log('6) Delete');
  await del(`/loan-types/${id}`, token);

    console.log('RESULT:', { created: created.data.id, updated: updated.data.id, count: list.data.length });
    console.log('LoanType admin CRUD OK');
    process.exit(0);
  } catch (err) {
    console.error('Admin LoanType test failed:', err.message);
    process.exit(1);
  }
})();
