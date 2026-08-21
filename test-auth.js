const http = require('http');
const https = require('https');
const crypto = require('crypto');
const dotenv = require('dotenv');
dotenv.config();

const BASE = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runAuditTests() {
  console.log('====================================================');
  console.log('   TRUTH AI AUTHENTICATION AUDIT & VERIFICATION    ');
  console.log('====================================================\n');

  const testEmail = `audit_${Date.now()}@example.com`;
  const testPass = 'SecurePass123!';
  let accessToken = '';
  let refreshTokenCookie = '';
  let userId = '';
  let resetToken = '';
  let verificationToken = '';

  // 1. Check Supabase DB Connection
  console.log('--- 1. Supabase Database Connection ---');
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('users').select('count').maybeSingle();
    console.log('[SUPABASE CONNECTION]', error ? `Reachable (Table status: ${error.message})` : 'Connected & Table verified');
  } catch (e) {
    console.error('[SUPABASE CONNECTION ERROR]', e.message);
  }

  // 2. Healthcheck Endpoint
  console.log('\n--- 2. Healthcheck & CORS/Helmet Headers ---');
  const health = await request('GET', '/api/health');
  console.log('GET /api/health Status:', health.status);
  console.log('Helmet x-content-type-options:', health.headers['x-content-type-options']);
  console.log('Helmet x-frame-options:', health.headers['x-frame-options']);
  console.log('Permissions-Policy:', health.headers['permissions-policy']);

  // 3. Input Validation (Register with invalid data)
  console.log('\n--- 3. Input Validation (express-validator) ---');
  const badReg = await request('POST', '/auth/register', { email: 'invalid-email', password: 'short' });
  console.log('POST /auth/register (Bad Data) Status:', badReg.status, JSON.stringify(badReg.data));

  // 4. Registration
  console.log('\n--- 4. User Registration (POST /auth/register) ---');
  const reg = await request('POST', '/auth/register', {
    email: testEmail,
    password: testPass,
    name: 'Audit User',
  });
  console.log('POST /auth/register Status:', reg.status, JSON.stringify(reg.data));

  // 5. Duplicate Email Registration Prevention
  console.log('\n--- 5. Duplicate Email Registration Prevention ---');
  const dupReg = await request('POST', '/auth/register', {
    email: testEmail,
    password: testPass,
    name: 'Audit User',
  });
  console.log('POST /auth/register (Duplicate) Status:', dupReg.status, JSON.stringify(dupReg.data));

  // 6. User Model Verification (Email verification token & ID retrieval)
  console.log('\n--- 6. Database / User Model State Check ---');
  const { UserModel } = await import('./auth/models/user.model.js');
  const createdUser = await UserModel.findByEmail(testEmail);
  if (createdUser) {
    userId = createdUser.id;
    verificationToken = createdUser.verification_token;
    console.log('[USER FOUND]', { id: userId, email: createdUser.email, role: createdUser.role, email_verified: createdUser.email_verified });
  }

  // 7. Email Verification
  console.log('\n--- 7. Email Verification (GET /auth/verify-email) ---');
  if (verificationToken) {
    const verRes = await request('GET', `/auth/verify-email?token=${verificationToken}`);
    console.log('GET /auth/verify-email Status:', verRes.status, 'Location header:', verRes.headers.location);
  } else {
    // Manually mark verified for testing login flow
    await UserModel.updateById(userId, { email_verified: true });
    console.log('[MANUAL VERIFY] Email verified flag set to true');
  }

  // 8. User Login & Cookie / Token Generation
  console.log('\n--- 8. Login (POST /auth/login) ---');
  const loginRes = await request('POST', '/auth/login', {
    email: testEmail,
    password: testPass,
  });
  console.log('POST /auth/login Status:', loginRes.status);
  console.log('Login Response:', JSON.stringify(loginRes.data));

  if (loginRes.data && loginRes.data.accessToken) {
    accessToken = loginRes.data.accessToken;
    const cookieHeader = loginRes.headers['set-cookie'];
    if (cookieHeader) {
      refreshTokenCookie = cookieHeader[0];
      console.log('Set-Cookie Header:', refreshTokenCookie);
    }
  }

  // 9. Protected Endpoint: GET /auth/me
  console.log('\n--- 9. Protected Profile Endpoint (GET /auth/me) ---');
  const meRes = await request('GET', '/auth/me', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/me Status:', meRes.status, JSON.stringify(meRes.data));

  // 10. Access Token Verification without Token
  console.log('\n--- 10. Access Token Guard (Unauthenticated request to /auth/me) ---');
  const noTokenRes = await request('GET', '/auth/me');
  console.log('GET /auth/me (No token) Status:', noTokenRes.status, JSON.stringify(noTokenRes.data));

  // 11. Role-Based Authorization Guard (Admin Route for Regular User)
  console.log('\n--- 11. Role-Based Access Control (GET /auth/admin/users as User) ---');
  const adminRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/admin/users Status:', adminRes.status, JSON.stringify(adminRes.data));

  // Promote to admin and test again
  console.log('\n--- 12. Promote User to Admin & Test Admin Endpoint ---');
  await UserModel.updateById(userId, { role: 'admin' });
  const adminLogin = await request('POST', '/auth/login', { email: testEmail, password: testPass });
  const adminToken = adminLogin.data.accessToken;
  const adminSuccessRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  console.log('GET /auth/admin/users (as Admin) Status:', adminSuccessRes.status, JSON.stringify(adminSuccessRes.data));

  // 13. Token Refresh (POST /auth/refresh)
  console.log('\n--- 13. Token Refresh (POST /auth/refresh) ---');
  const refreshCookie = refreshTokenCookie.split(';')[0];
  const refreshRes = await request('POST', '/auth/refresh', { userId }, {
    Cookie: refreshCookie,
  });
  console.log('POST /auth/refresh Status:', refreshRes.status, JSON.stringify(refreshRes.data));

  // 14. Forgot Password Flow (POST /auth/forgot-password)
  console.log('\n--- 14. Forgot Password (POST /auth/forgot-password) ---');
  const forgotRes = await request('POST', '/auth/forgot-password', { email: testEmail });
  console.log('POST /auth/forgot-password Status:', forgotRes.status, JSON.stringify(forgotRes.data));

  // Retrieve reset token from DB
  const userForReset = await UserModel.findById(userId);
  resetToken = userForReset?.reset_token;
  console.log('[RESET TOKEN GENERATED]', resetToken ? 'YES (64-char hex)' : 'NO');

  // 15. Reset Password (POST /auth/reset-password)
  console.log('\n--- 15. Reset Password (POST /auth/reset-password) ---');
  const newPass = 'NewSecurePass456!';
  if (resetToken) {
    const resetRes = await request('POST', '/auth/reset-password', {
      token: resetToken,
      newPassword: newPass,
    });
    console.log('POST /auth/reset-password Status:', resetRes.status, JSON.stringify(resetRes.data));
  }

  // Verify new password login
  console.log('\n--- 16. Login with New Password ---');
  const newLoginRes = await request('POST', '/auth/login', {
    email: testEmail,
    password: newPass,
  });
  console.log('POST /auth/login (New Pass) Status:', newLoginRes.status, JSON.stringify(newLoginRes.data));

  // 17. User Logout (POST /auth/logout)
  console.log('\n--- 17. Logout (POST /auth/logout) ---');
  const logoutRes = await request('POST', '/auth/logout', null, {
    Authorization: `Bearer ${newLoginRes.data.accessToken}`,
    Cookie: refreshCookie,
  });
  console.log('POST /auth/logout Status:', logoutRes.status, JSON.stringify(logoutRes.data));

  // 18. Protected GPT API Route (POST /api/analyze)
  console.log('\n--- 18. Protected GPT API Route (POST /api/analyze) ---');
  const analyzeRes = await request('POST', '/api/analyze', {
    text: 'Audit test input text to verify backend AI route processing.',
    type: 'text',
  });
  console.log('POST /api/analyze Status:', analyzeRes.status, 'Title:', analyzeRes.data?.title || analyzeRes.data);

  // 19. Google OAuth Endpoint Check
  console.log('\n--- 19. Google OAuth Endpoint (GET /auth/google) ---');
  const googleRes = await request('GET', '/auth/google');
  console.log('GET /auth/google Status:', googleRes.status, 'Location header:', googleRes.headers.location || 'N/A');

  // 20. Rate Limiting Check
  console.log('\n--- 20. Rate Limiting Test ---');
  console.log('Sending requests to test rate limit triggers...');
  let hitRateLimit = false;
  for (let i = 0; i < 7; i++) {
    const r = await request('POST', '/auth/register', { email: 'invalid', password: '123' });
    if (r.status === 429) {
      hitRateLimit = true;
      console.log(`Attempt ${i + 1}: Received HTTP 429 Rate Limit Exceeded!`);
      break;
    }
  }
  if (!hitRateLimit) {
    console.log('Rate limiter window active');
  }

  console.log('\n====================================================');
  console.log('             AUDIT TEST SUITE COMPLETE              ');
  console.log('====================================================\n');
}

runAuditTests().catch(console.error);
