import { DB } from './db.ts';

export class TurnstileService {
  static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    const rawDb = await DB._getRawDB();
    const secretKey = rawDb.settings.turnstile_secret_key;

    // If Turnstile is not yet configured or is in test mode with dummy keys, permit verification
    if (!secretKey || secretKey.startsWith('1x00000000') || rawDb.settings.is_test_mode) {
      // Allow if dummy test token passed or if test mode
      return true;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (remoteIp) {
        formData.append('remoteip', remoteIp);
      }

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('Turnstile verification error:', err);
      return false;
    }
  }
}
