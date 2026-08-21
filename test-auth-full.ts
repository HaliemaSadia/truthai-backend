import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:3000';

function request(method: string, path: string, body: any = null, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts: http.RequestOptions = {
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
          status: res.statusCode || 500,
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

  const timestamp = Date.now();
  const testEmail = `audit_${timestamp}@example.com`;
  const testPass = 'SecurePass123!';
  let accessToken = '';
  let refreshTokenCookie = '';
  let userId = '';

  // 1. Supabase Connection Check
  console.log('--- 1. Supabase Database Connection ---');
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error } = await supabase.from('users').select('count').maybeSingle();
    console.log('[SUPABASE CONNECTION]', error ? `Reachable (Note: ${error.message})` : 'Connected');
  } catch (e: any) {
    console.error('[SUPABASE ERROR]', e.message);
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
  const badReg = await request('POST', '/auth/register', { email: 'invalid-email', password: 'short' }, { 'x-forwarded-for': `127.0.0.${timestamp % 200}` });
  console.log('POST /auth/register (Bad Data) Status:', badReg.status, JSON.stringify(badReg.data));

  // 4. Registration
  console.log('\n--- 4. User Registration (POST /auth/register) ---');
  const clientIp = `192.168.1.${(timestamp % 200) + 1}`;
  const reg = await request('POST', '/auth/register', {
    email: testEmail,
    password: testPass,
    name: 'Audit User',
  }, { 'x-forwarded-for': clientIp });
  console.log('POST /auth/register Status:', reg.status, JSON.stringify(reg.data));

  // 5. Duplicate Email Registration
  console.log('\n--- 5. Duplicate Email Prevention ---');
  const dupReg = await request('POST', '/auth/register', {
    email: testEmail,
    password: testPass,
    name: 'Audit User',
  }, { 'x-forwarded-for': clientIp });
  console.log('POST /auth/register (Duplicate) Status:', dupReg.status, JSON.stringify(dupReg.data));

  // 6. User Model Verification & Email Verification
  console.log('\n--- 6. User Model Lookup & Email Verification ---');
  const { UserModel } = await import('./auth/models/user.model.ts');
  const createdUser = await UserModel.findByEmail(testEmail);
  if (createdUser) {
    userId = createdUser.id;
    console.log('[USER CREATED]', { id: userId, email: createdUser.email, role: createdUser.role });
    if (createdUser.verification_token) {
      const verRes = await request('GET', `/auth/verify-email?token=${createdUser.verification_token}`);
      console.log('GET /auth/verify-email Status:', verRes.status, 'Location Header:', verRes.headers.location);
    } else {
      await UserModel.updateById(createdUser.id, { email_verified: true });
      console.log('[EMAIL VERIFIED] Manually marked email_verified = true');
    }
  }

  // 7. Login
  console.log('\n--- 7. User Login (POST /auth/login) ---');
  const loginRes = await request('POST', '/auth/login', {
    email: testEmail,
    password: testPass,
  }, { 'x-forwarded-for': `10.0.0.${(timestamp % 200) + 1}` });
  console.log('POST /auth/login Status:', loginRes.status);
  console.log('Login Response Data:', JSON.stringify(loginRes.data));

  if (loginRes.data && loginRes.data.accessToken) {
    accessToken = loginRes.data.accessToken;
    userId = loginRes.data.user.id;
    const cookieHeader = loginRes.headers['set-cookie'];
    if (cookieHeader) {
      refreshTokenCookie = cookieHeader[0];
      console.log('Set-Cookie Header Received:', refreshTokenCookie);
    }
  }

  // 8. GET /auth/me
  console.log('\n--- 8. Protected Profile (GET /auth/me) ---');
  const meRes = await request('GET', '/auth/me', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/me Status:', meRes.status, JSON.stringify(meRes.data));

  // 9. Unauthenticated Guard Check
  console.log('\n--- 9. Unauthenticated Access Guard ---');
  const noTokenRes = await request('GET', '/auth/me');
  console.log('GET /auth/me (No token) Status:', noTokenRes.status, JSON.stringify(noTokenRes.data));

  // 10. Role-Based Access Control
  console.log('\n--- 10. RBAC Test (GET /auth/admin/users as User) ---');
  const adminRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${accessToken}`,
  });
  console.log('GET /auth/admin/users (User role) Status:', adminRes.status, JSON.stringify(adminRes.data));

  // Promote to Admin
  console.log('\n--- 11. Promote User to Admin & Test Admin Endpoint ---');
  await UserModel.updateById(userId, { role: 'admin' });
  const adminLogin = await request('POST', '/auth/login', { email: testEmail, password: testPass }, { 'x-forwarded-for': `10.0.1.${(timestamp % 200) + 1}` });
  const adminToken = adminLogin.data.accessToken;
  const adminSuccessRes = await request('GET', '/auth/admin/users', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  console.log('GET /auth/admin/users (Admin role) Status:', adminSuccessRes.status, JSON.stringify(adminSuccessRes.data));

  // 12. Token Refresh
  console.log('\n--- 12. Token Refresh (POST /auth/refresh) ---');
  if (refreshTokenCookie) {
    const refreshCookie = refreshTokenCookie.split(';')[0];
    const refreshRes = await request('POST', '/auth/refresh', { userId }, {
      Cookie: refreshCookie,
    });
    console.log('POST /auth/refresh Status:', refreshRes.status, JSON.stringify(refreshRes.data));
  }

  // 13. Forgot Password
  console.log('\n--- 13. Forgot Password (POST /auth/forgot-password) ---');
  const forgotRes = await request('POST', '/auth/forgot-password', { email: testEmail }, { 'x-forwarded-for': `10.0.2.${(timestamp % 200) + 1}` });
  console.log('POST /auth/forgot-password Status:', forgotRes.status, JSON.stringify(forgotRes.data));

  const userForReset = await UserModel.findById(userId);
  const resetToken = userForReset?.reset_token;
  console.log('[RESET TOKEN IN DB]', resetToken ? 'GENERATED' : 'NONE');

  // 14. Reset Password
  console.log('\n--- 14. Reset Password (POST /auth/reset-password) ---');
  const newPass = 'NewSecurePass456!';
  if (resetToken) {
    const resetRes = await request('POST', '/auth/reset-password', {
      token: resetToken,
      newPassword: newPass,
    });
    console.log('POST /auth/reset-password Status:', resetRes.status, JSON.stringify(resetRes.data));

    // Verify login with new password
    const newLoginRes = await request('POST', '/auth/login', {
      email: testEmail,
      password: newPass,
    }, { 'x-forwarded-for': `10.0.3.${(timestamp % 200) + 1}` });
    console.log('POST /auth/login (New Password) Status:', newLoginRes.status, JSON.stringify(newLoginRes.data));
    if (newLoginRes.data?.accessToken) accessToken = newLoginRes.data.accessToken;
  }

  // 15. User Logout
  console.log('\n--- 15. Logout (POST /auth/logout) ---');
  const logoutRes = await request('POST', '/auth/logout', null, {
    Authorization: `Bearer ${accessToken}`,
    Cookie: refreshTokenCookie ? refreshTokenCookie.split(';')[0] : '',
  });
  console.log('POST /auth/logout Status:', logoutRes.status, JSON.stringify(logoutRes.data));

  // 16. Protected GPT API Route
  console.log('\n--- 16. Protected GPT API Route (POST /api/analyze) ---');
  const analyzeRes = await request('POST', '/api/analyze', {
    text: 'Audit test input text to verify backend AI route processing.',
    type: 'text',
  });
  console.log('POST /api/analyze Status:', analyzeRes.status, 'Title:', analyzeRes.data?.title || analyzeRes.data);

  // 17. Google OAuth Endpoint
  console.log('\n--- 17. Google OAuth Endpoint (GET /auth/google) ---');
  const googleRes = await request('GET', '/auth/google');
  console.log('GET /auth/google Status:', googleRes.status, 'Location Header:', googleRes.headers.location || 'N/A');

  console.log('\n====================================================');
  console.log('             AUDIT TEST SUITE COMPLETE              ');
  console.log('====================================================\n');
}

runAuditTests().catch(console.error);
