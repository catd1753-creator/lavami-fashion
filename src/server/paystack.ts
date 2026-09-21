import crypto from 'crypto';
import { DB } from './db.ts';

export class PaystackService {
  // Verify HMAC-SHA512 Webhook Signature (Strict Constant-Time Comparison)
  static verifyWebhookSignature(rawBody: string, signature: string, secretKey: string): boolean {
    if (!signature || !secretKey || !rawBody) {
      return false;
    }

    try {
      const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
      const sigBuf = Buffer.from(signature, 'utf8');
      const hashBuf = Buffer.from(hash, 'utf8');

      if (sigBuf.length !== hashBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuf, hashBuf);
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  }

  // Initialize Paystack Transaction
  static async initializePayment(params: {
    email: string;
    amountPesewas: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
    is_simulated?: boolean;
  }> {
    const rawDb = await DB._getRawDB();
    const secretKey = rawDb.settings.paystack_secret_key;
    const isTestMode = rawDb.settings.is_test_mode || !secretKey || secretKey.includes('sample');

    // If real Paystack credentials configured, call actual Paystack API
    if (!isTestMode && secretKey) {
      try {
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: params.email,
            amount: params.amountPesewas,
            reference: params.reference,
            callback_url: params.callbackUrl,
            currency: 'GHS',
            channels: ['mobile_money', 'card'],
            metadata: params.metadata,
          }),
        });

        const data = await response.json();
        if (data.status && data.data?.authorization_url) {
          return {
            authorization_url: data.data.authorization_url,
            access_code: data.data.access_code,
            reference: params.reference,
          };
        }
      } catch (err) {
        console.warn('Paystack live initialization failed, falling back to test flow', err);
      }
    }

    // Test mode fallback: Return local checkout sandbox redirect
    return {
      authorization_url: `/checkout/sandbox?reference=${encodeURIComponent(
        params.reference
      )}&amount=${params.amountPesewas}`,
      access_code: `mock_code_${Date.now()}`,
      reference: params.reference,
      is_simulated: true,
    };
  }

  // Verify transaction directly with Paystack API
  static async verifyTransaction(reference: string): Promise<{
    success: boolean;
    amount?: number;
    currency?: string;
    status?: string;
  }> {
    const rawDb = await DB._getRawDB();
    const secretKey = rawDb.settings.paystack_secret_key;
    const isTestMode = rawDb.settings.is_test_mode || !secretKey || secretKey.includes('sample');

    if (!isTestMode && secretKey) {
      try {
        const response = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
          {
            headers: {
              Authorization: `Bearer ${secretKey}`,
            },
          }
        );
        const data = await response.json();
        if (data.status && data.data) {
          return {
            success: data.data.status === 'success',
            amount: data.data.amount,
            currency: data.data.currency,
            status: data.data.status,
          };
        }
      } catch (err) {
        console.error('Paystack verification error:', err);
      }
    }

    // In test mode: check internal order
    const order = await DB.getOrderByRef(reference);
    if (order) {
      return {
        success: true,
        amount: order.amount_pesewas,
        currency: 'GHS',
        status: 'success',
      };
    }

    return { success: false };
  }
}
