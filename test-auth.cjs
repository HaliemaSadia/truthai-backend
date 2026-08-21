const http = require('http');
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

  // 1. Supabase Database Connection
  console.log('--- 1. Supabase Database Connection ---');
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('users').select('count').maybeSingle();
    console.log('[SUPABASE CONNECTION]', error ? `Reachable (Status: ${error.message})` : 'Connected');
  } catch (e) {
    console.error('[SUPABASE CONNECTION ERROR]', e.message);
  }

  // 2. Healthcheck & Security Headers
  console.log('\n--- 2. Healthcheck & Security Headers ---');
  const health = await request('GET', '/api/health');
  console.log('GET /api/health Status:', health.status);
  console.log('Helmet x-content-type-options:', health.headers['x-content-type-options']);
  console.log('Helmet x-frame-options:', health.headers['x-frame-options']);
  console.log('Permissions-Policy:', health.headers['permissions-policy']);

  // 3. Input Validation (express-validator)
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

  // 6. User Model Verification
  console.log('\n--- 6. User Model Token Lookup ---');
  const { UserModel } = await import('./auth/models/user.model.js');
  const createdUser = await UserModel.findByEmail(testEmail);
  if (createdUser) {
    userId = createdUser.id;
    verificationToken = createdUser.verification_token;
    console.log('[USER STORED]', { id: userId, email: createdUser.email, token: verificationToken ? 'GENERATED' : 'NONE' });
  }

  // 7. Login before verification (should be 403)
  console.log('\n--- 7. Login Before Verification ---');
  const unverifiedLogin = await request('POST', '/auth/login', { email: testEmail, password: testPass });
  console.log('POST /auth/login (Unverified) Status:', unverifiedLogin.status, JSON.stringify(unverifiedLogin.data));

  // 8. Email Verification
  console.log('\n--- 8. Email Verification (GET /auth/verify-email) ---');
  if (verificationToken) {
    const verRes = await request('GET', `/auth/verify-email?token=${verificationToken}`);
    console.log('GET /auth/verify-email Status:', verRes.status, 'Redirect:', verRes.headers.location);
  } else {
    await UserModel.updateById(userId, { email_verified: true });
    console.log('[EMAIL VERIFIED] Flag updated to true');
  }

  // 9. Login Verified User
  console.log('\n--- 9. Login Verified User (POST /auth/login) ---');
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

  // 10. Protected GET /auth/me
  console.log('\n--- 10. Protected Profile Endpoint (GET /auth/me) ---');
  const meRes = await request('GET', '/auth/me', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/me Status:', meRes.status, JSON.stringify(meRes.data));

  // 11. Access Token Guard without Token
  console.log('\n--- 11. Access Token Guard (Unauthenticated Request) ---');
  const noTokenRes = await request('GET', '/auth/me');
  console.log('GET /auth/me (No token) Status:', noTokenRes.status, JSON.stringify(noTokenRes.data));

  // 12. Role-Based Access Control
  console.log('\n--- 12. Role-Based Access Control (GET /auth/admin/users as User) ---');
  const adminRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/admin/users (User role) Status:', adminRes.status, JSON.stringify(adminRes.data));

  // Promote user to admin
  console.log('\n--- 13. Promote User to Admin & Test Admin Endpoint ---');
  await UserModel.updateById(userId, { role: 'admin' });
  const adminLogin = await request('POST', '/auth/login', { email: testEmail, password: testPass });
  const adminToken = adminLogin.data.accessToken;
  const adminSuccessRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  console.log('GET /auth/admin/users (Admin role) Status:', adminSuccessRes.status, JSON.stringify(adminSuccessRes.data));

  // 14. Token Refresh (POST /auth/refresh)
  console.log('\n--- 14. Token Refresh (POST /auth/refresh) ---');
  if (refreshTokenCookie) {
    const refreshCookie = refreshTokenCookie.split(';')[0];
    const refreshRes = await request('POST', '/auth/refresh', { userId }, {
      Cookie: refreshCookie,
    });
    console.log('POST /auth/refresh Status:', refreshRes.status, JSON.stringify(refreshRes.data));
  }

  // 15. Forgot Password Flow
  console.log('\n--- 15. Forgot Password (POST /auth/forgot-password) ---');
  const forgotRes = await request('POST', '/auth/forgot-password', { email: testEmail });
  console.log('POST /auth/forgot-password Status:', forgotRes.status, JSON.stringify(forgotRes.data));

  const userForReset = await UserModel.findById(userId);
  resetToken = userForReset?.reset_token;
  console.log('[RESET TOKEN IN DB]', resetToken ? 'GENERATED' : 'NONE');

  // 16. Reset Password
  console.log('\n--- 16. Reset Password (POST /auth/reset-password) ---');
  const newPass = 'NewSecurePass456!';
  if (resetToken) {
    const resetRes = await request('POST', '/auth/reset-password', {
      token: resetToken,
      newPassword: newPass,
    });
    console.log('POST /auth/reset-password Status:', resetRes.status, JSON.stringify(resetRes.data));

    // Test Login with New Password
    const newLoginRes = await request('POST', '/auth/login', {
      email: testEmail,
      password: newPass,
    });
    console.log('POST /auth/login (New Password) Status:', newLoginRes.status, JSON.stringify(newLoginRes.data));
    if (newLoginRes.data?.accessToken) accessToken = newLoginRes.data.accessToken;
  }

  // 17. User Logout
  console.log('\n--- 17. Logout (POST /auth/logout) ---');
  const logoutRes = await request('POST', '/auth/logout', null, {
    Authorization: `Bearer ${accessToken}`,
    Cookie: refreshTokenCookie ? refreshTokenCookie.split(';')[0] : '',
  });
  console.log('POST /auth/logout Status:', logoutRes.status, JSON.stringify(logoutRes.data));

  // 18. Protected GPT API Route
  console.log('\n--- 18. Protected GPT API Route (POST /api/analyze) ---');
  const analyzeRes = await request('POST', '/api/analyze', {
    text: 'Audit test input text to verify backend AI route processing.',
    type: 'text',
  });
  console.log('POST /api/analyze Status:', analyzeRes.status, 'Title:', analyzeRes.data?.title || analyzeRes.data);

  // 19. Google OAuth Endpoint
  console.log('\n--- 19. Google OAuth Endpoint (GET /auth/google) ---');
  const googleRes = await request('GET', '/auth/google');
  console.log('GET /auth/google Status:', googleRes.status, 'Location Header:', googleRes.headers.location || 'N/A');

  console.log('\n====================================================');
  console.log('             AUDIT TEST SUITE COMPLETE              ');
  console.log('====================================================\n');
}

runAuditTests().catch(console.error);
