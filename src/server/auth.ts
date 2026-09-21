import crypto from 'crypto';
import { DB } from './db.ts';

// RFC 6238 Standard TOTP Implementation (HMAC-SHA1)
export class TOTP {
  // Base32 decode
  static base32Decode(base32: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');

    for (let i = 0; i < clean.length; i++) {
      const idx = alphabet.indexOf(clean[i]);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }

  // Generate 6-digit TOTP code for given time step
  static generateCode(secret: string, timeStep = 30, timestamp = Date.now()): string {
    const key = this.base32Decode(secret);
    const counter = Math.floor(timestamp / 1000 / timeStep);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  // Verify code with +/- 1 time step window tolerance (90s window)
  static verifyCode(code: string, secret: string, timeStep = 30): boolean {
    const now = Date.now();
    const cleanCode = code.trim().padStart(6, '0');

    for (let offset = -1; offset <= 1; offset++) {
      const stepTime = now + offset * timeStep * 1000;
      const expected = this.generateCode(secret, timeStep, stepTime);
      if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expected))) {
        return true;
      }
    }
    return false;
  }
}

export class AuthService {
  private static SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity

  // Verify Admin Login (Password + TOTP)
  static async verifyAdminLogin(
    username: string,
    passwordAttempt: string,
    totpCodeAttempt: string,
    ip: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const rawDb = await DB._getRawDB();
    const admin = rawDb.admin_users.find((u) => u.username === username);
    if (!admin) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Verify Password Hash
    const derivedHash = crypto
      .pbkdf2Sync(passwordAttempt, admin.salt, 100000, 64, 'sha512')
      .toString('hex');

    if (
      !crypto.timingSafeEqual(
        Buffer.from(derivedHash, 'hex'),
        Buffer.from(admin.password_hash, 'hex')
      )
    ) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Verify TOTP MFA (or allow fallback code if initial launch)
    if (admin.mfa_enabled) {
      if (!totpCodeAttempt) {
        return { success: false, error: 'MFA 6-digit code required' };
      }
      const isValidMfa = TOTP.verifyCode(totpCodeAttempt, admin.totp_secret);
      if (!isValidMfa) {
        return { success: false, error: 'Invalid MFA verification code' };
      }
    }

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const session = {
      token,
      username: admin.username,
      role: 'admin',
      last_active: now,
      expires_at: now + this.SESSION_TIMEOUT_MS,
    };

    // Clean old sessions
    rawDb.sessions = rawDb.sessions.filter((s) => s.expires_at > now);
    rawDb.sessions.push(session);

    rawDb.audit_log.push({
      id: `audit_login_${Date.now()}`,
      action: 'ADMIN_LOGIN_SUCCESS',
      details: `Administrator ${username} logged in with 2FA verification.`,
      admin_id: username,
      ip: ip,
      timestamp: new Date().toISOString(),
    });

    await DB._saveRawDB(rawDb);
    return { success: true, token };
  }

  // Validate Admin Session (Checks 15-minute inactivity timeout)
  static async validateAdminSession(
    token: string
  ): Promise<{ valid: boolean; username?: string; role?: string }> {
    if (!token) return { valid: false };

    const rawDb = await DB._getRawDB();
    const now = Date.now();
    const session = rawDb.sessions.find((s) => s.token === token);

    if (!session) return { valid: false };

    // Inactivity timeout: session expires if no activity for 15 minutes
    if (now - session.last_active > this.SESSION_TIMEOUT_MS || session.expires_at < now) {
      rawDb.sessions = rawDb.sessions.filter((s) => s.token !== token);
      await DB._saveRawDB(rawDb);
      return { valid: false };
    }

    // Slide inactivity window
    session.last_active = now;
    session.expires_at = now + this.SESSION_TIMEOUT_MS;
    await DB._saveRawDB(rawDb);

    return { valid: true, username: session.username, role: session.role };
  }

  // Invalidate session on logout
  static async logoutAdmin(token: string): Promise<void> {
    const rawDb = await DB._getRawDB();
    rawDb.sessions = rawDb.sessions.filter((s) => s.token !== token);
    await DB._saveRawDB(rawDb);
  }

  // Update Admin Password & MFA
  static async updateAdminCredentials(
    currentPassword: string,
    newPassword?: string,
    newTotpSecret?: string,
    adminId = 'admin',
    ip = '127.0.0.1'
  ): Promise<{ success: boolean; error?: string }> {
    const rawDb = await DB._getRawDB();
    const admin = rawDb.admin_users.find((u) => u.username === adminId);
    if (!admin) return { success: false, error: 'User not found' };

    const checkHash = crypto
      .pbkdf2Sync(currentPassword, admin.salt, 100000, 64, 'sha512')
      .toString('hex');
    if (
      !crypto.timingSafeEqual(
        Buffer.from(checkHash, 'hex'),
        Buffer.from(admin.password_hash, 'hex')
      )
    ) {
      return { success: false, error: 'Current password incorrect' };
    }

    if (newPassword && newPassword.length >= 10) {
      const newSalt = crypto.randomBytes(16).toString('hex');
      admin.password_hash = crypto
        .pbkdf2Sync(newPassword, newSalt, 100000, 64, 'sha512')
        .toString('hex');
      admin.salt = newSalt;
    }

    if (newTotpSecret) {
      admin.totp_secret = newTotpSecret.trim().toUpperCase();
      admin.mfa_enabled = true;
    }

    rawDb.audit_log.push({
      id: `audit_cred_update_${Date.now()}`,
      action: 'ADMIN_CREDENTIALS_ROTATED',
      details: `Administrator credentials / MFA secret updated.`,
      admin_id: adminId,
      ip: ip,
      timestamp: new Date().toISOString(),
    });

    await DB._saveRawDB(rawDb);
    return { success: true };
  }

  // Get current active TOTP code for convenient verification/setup in admin preview
  static async getTotpCurrentCode(adminId = 'admin'): Promise<string | null> {
    const rawDb = await DB._getRawDB();
    const admin = rawDb.admin_users.find((u) => u.username === adminId);
    if (!admin) return null;
    return TOTP.generateCode(admin.totp_secret);
  }

  // --- Customer Email OTP Sign-In ---
  static async requestEmailOtp(
    email: string
  ): Promise<{ success: boolean; error?: string; simulatedCode?: string }> {
    const norm = email.trim().toLowerCase();
    if (!norm.includes('@') || !norm.includes('.')) {
      return { success: false, error: 'Valid email address required' };
    }

    const rawDb = await DB._getRawDB();
    const now = Date.now();

    // Check rate limit: 1 OTP request every 60 seconds per email
    const existing = rawDb.otp_codes.find((o) => o.email === norm);
    if (existing && existing.expires_at > now && now - (existing.expires_at - 10 * 60 * 1000) < 60 * 1000) {
      return { success: false, error: 'Please wait 60 seconds before requesting another code.' };
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 10 * 60 * 1000; // 10 mins

    // Clean old
    rawDb.otp_codes = rawDb.otp_codes.filter((o) => o.email !== norm);
    rawDb.otp_codes.push({
      email: norm,
      code,
      expires_at: expiresAt,
      attempts: 0,
    });

    await DB._saveRawDB(rawDb);

    return {
      success: true,
      simulatedCode: code, // Returned so customer can immediately copy & test in sandbox
    };
  }

  static async verifyEmailOtp(
    email: string,
    codeAttempt: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    const norm = email.trim().toLowerCase();
    const rawDb = await DB._getRawDB();
    const now = Date.now();

    const record = rawDb.otp_codes.find((o) => o.email === norm);
    if (!record || record.expires_at < now) {
      return { success: false, error: 'Verification code expired or not requested' };
    }

    if (record.attempts >= 5) {
      return { success: false, error: 'Too many failed attempts. Please request a new code.' };
    }

    if (record.code !== codeAttempt.trim()) {
      record.attempts++;
      await DB._saveRawDB(rawDb);
      return { success: false, error: 'Invalid verification code' };
    }

    // Code correct: create customer session
    rawDb.otp_codes = rawDb.otp_codes.filter((o) => o.email !== norm);
    const token = crypto.randomBytes(32).toString('hex');
    rawDb.customer_sessions.push({
      token,
      email: norm,
      expires_at: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    await DB._saveRawDB(rawDb);
    return { success: true, token };
  }

  static async validateCustomerSession(token: string): Promise<{ valid: boolean; email?: string }> {
    if (!token) return { valid: false };
    const rawDb = await DB._getRawDB();
    const now = Date.now();
    const session = rawDb.customer_sessions.find((s) => s.token === token && s.expires_at > now);
    if (!session) return { valid: false };
    return { valid: true, email: session.email };
  }
}
