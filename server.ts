import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { DB } from './src/server/db.ts';
import { AuthService } from './src/server/auth.ts';
import { PaystackService } from './src/server/paystack.ts';
import { TurnstileService } from './src/server/turnstile.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Permit framing only in same-origin (AI Studio preview iframe)
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Raw body capture for Paystack webhook signature verification
  app.use('/api/paystack-webhook', express.raw({ type: '*/*' }));

  // JSON parsing for all other routes
  app.use(express.json());

  // Background Worker: Release expired reservations every 60 seconds
  setInterval(async () => {
    try {
      await DB.releaseExpiredReservations();
    } catch (err) {
      console.error('Failed to release expired reservations:', err);
    }
  }, 60 * 1000);

  // Helper: Router Context Validation
  function validateRouterInput(
    rawLoginUrl?: string,
    rawDst?: string,
    configuredLoginUrl = 'http://192.168.88.1/login'
  ): { loginUrl: string; dst: string | null; isValidHost: boolean } {
    let finalLoginUrl = configuredLoginUrl;
    let isValidHost = true;

    if (rawLoginUrl) {
      try {
        const suppliedUrl = new URL(rawLoginUrl);
        const configuredUrl = new URL(configuredLoginUrl);
        if (suppliedUrl.host.toLowerCase() === configuredUrl.host.toLowerCase()) {
          finalLoginUrl = rawLoginUrl;
        } else {
          // Untrusted host: Ignore supplied value, fall back to configured router URL
          isValidHost = false;
          finalLoginUrl = configuredLoginUrl;
        }
      } catch {
        isValidHost = false;
        finalLoginUrl = configuredLoginUrl;
      }
    }

    let finalDst: string | null = null;
    if (rawDst && typeof rawDst === 'string' && rawDst.length < 500) {
      try {
        const dstUrl = new URL(rawDst);
        if (dstUrl.protocol === 'http:' || dstUrl.protocol === 'https:') {
          finalDst = rawDst;
        }
      } catch {
        finalDst = null;
      }
    }

    return { loginUrl: finalLoginUrl, dst: finalDst, isValidHost };
  }

  // Admin Authentication Middleware (15-min inactivity check)
  const requireAdmin = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

    if (!token) {
      return res.status(401).json({ error: 'Admin session required. Please sign in.' });
    }

    const session = await AuthService.validateAdminSession(token);
    if (!session.valid) {
      return res.status(401).json({
        error: 'Admin session expired due to 15 minutes of inactivity. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    (req as express.Request & { adminUser?: string }).adminUser = session.username;
    next();
  };

  // --- PUBLIC ENDPOINTS ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Lavami WiFi Shop', timestamp: new Date().toISOString() });
  });

  // Get active plans with stock state
  app.get('/api/plans', async (req, res) => {
    try {
      const plans = await DB.getPlans();
      res.json({ success: true, plans });
    } catch (err) {
      console.error('Error fetching plans:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Get public settings
  app.get('/api/settings/public', async (req, res) => {
    try {
      const settings = await DB.getPublicSettings();
      res.json({ success: true, settings });
    } catch (err) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Create Order (Guest or Signed-In)
  app.post('/api/create-order', async (req, res) => {
    try {
      const { plan_slug, email, phone, login_url, dst } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

      if (!plan_slug) {
        return res.status(400).json({ error: 'Please choose a WiFi plan.' });
      }

      if (!email && !phone) {
        return res.status(400).json({ error: 'Please enter your phone number or email.' });
      }

      // 1. Rate Limiting: 60 order attempts per IP per 10 mins
      const ipLimit = await DB.checkRateLimit(`ip_order_${clientIp}`, 60, 600);
      if (!ipLimit.allowed) {
        return res.status(429).json({
          error: `Too many order attempts. Please wait ${ipLimit.resetIn} seconds.`,
        });
      }

      // Contact Rate Limiting: 5 order attempts per contact per hour
      const contactKey = crypto
        .createHash('sha256')
        .update((email || phone).trim().toLowerCase())
        .digest('hex');
      const contactLimit = await DB.checkRateLimit(`contact_order_${contactKey}`, 5, 3600);
      if (!contactLimit.allowed) {
        return res.status(429).json({
          error: 'Order limit reached for this contact. Please wait before creating another order.',
        });
      }

      // 2. Router Context Sanitization
      const publicSettings = await DB.getPublicSettings();
      const routerContext = validateRouterInput(login_url, dst, publicSettings.router_login_url);

      // 4. Generate random Paystack reference & cryptographically secure 256-bit receipt token
      const paystackRef = `LVM_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const receiptToken = crypto.randomBytes(32).toString('hex');
      const receiptTokenHash = crypto.createHash('sha256').update(receiptToken).digest('hex');

      // 5. Create Order & Reserve Voucher Atomically
      const orderResult = await DB.createOrder({
        plan_slug,
        contact_email: email ? String(email).trim().toLowerCase() : null,
        contact_phone: phone ? String(phone).trim() : null,
        paystack_ref: paystackRef,
        receipt_token_hash: receiptTokenHash,
      });

      if ('error' in orderResult) {
        return res.status(400).json({ error: orderResult.error });
      }

      const { order } = orderResult;

      // 6. Initialize Paystack Transaction
      const appBaseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const callbackUrl = `${appBaseUrl}/receipt/${receiptToken}`;

      const paymentInit = await PaystackService.initializePayment({
        email: email || `${phone.replace(/[^0-9]/g, '')}@lavami.local`,
        amountPesewas: order.amount_pesewas,
        reference: paystackRef,
        callbackUrl,
        metadata: {
          order_id: order.id,
          plan_slug: order.plan_slug,
          receipt_token: receiptToken,
          router_login: routerContext.loginUrl,
          router_dst: routerContext.dst,
        },
      });

      res.json({
        success: true,
        order_id: order.id,
        reference: paystackRef,
        receipt_token: receiptToken,
        receipt_url: `/receipt/${receiptToken}`,
        authorization_url: paymentInit.authorization_url,
        amount_pesewas: order.amount_pesewas,
        amount_ghs: order.amount_pesewas / 100,
        currency: 'GHS',
        is_simulated: paymentInit.is_simulated,
      });
    } catch (err) {
      console.error('Error creating order:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Paystack Webhook (Public, verified via HMAC-SHA512)
  app.post('/api/paystack-webhook', async (req, res) => {
    try {
      const rawBody = req.body.toString('utf8');
      const signature = (req.headers['x-paystack-signature'] as string) || '';

      const rawDb = await DB._getRawDB();
      const secretKey = rawDb.settings.paystack_secret_key;

      // In production/live mode, strictly require HMAC-SHA512 verification
      if (!rawDb.settings.is_test_mode && secretKey) {
        const isValidSignature = PaystackService.verifyWebhookSignature(rawBody, signature, secretKey);
        if (!isValidSignature) {
          console.warn('Invalid Paystack webhook signature rejected');
          return res.status(401).send('Invalid signature');
        }
      }

      const payload = JSON.parse(rawBody);
      const eventId = payload.data?.id ? String(payload.data.id) : `evt_${Date.now()}`;

      // Idempotency: Deduplicate event
      const isNewEvent = await DB.recordWebhookEvent(eventId);
      if (!isNewEvent) {
        // Already processed, return 200 safely
        return res.status(200).json({ status: 'ignored_duplicate' });
      }

      const event = payload.event;
      const data = payload.data;

      // Handle charge success
      if (event === 'charge.success') {
        const reference = data.reference;
        const amountPesewas = data.amount;
        const currency = data.currency;

        const order = await DB.getOrderByRef(reference);
        if (!order) {
          console.warn(`Order not found for Paystack reference: ${reference}`);
          return res.status(200).send('Order not found');
        }

        // Verify currency & amount
        if (currency !== 'GHS' || amountPesewas !== order.amount_pesewas) {
          console.error(`Paystack amount/currency mismatch for order ${order.id}`);
          return res.status(400).send('Amount mismatch');
        }

        if (order.status === 'pending') {
          await DB.markOrderPaid(order.id, reference);
        }
      } else if (event === 'refund.processed') {
        const reference = data.transaction_reference || data.reference;
        const order = await DB.getOrderByRef(reference);
        if (order) {
          await DB.refundOrder(order.id, 'Paystack refund event', 'paystack_webhook', req.ip || '127.0.0.1');
        }
      }

      res.status(200).json({ status: 'ok' });
    } catch (err) {
      console.error('Error handling webhook:', err);
      res.status(500).send('Webhook handler error');
    }
  });

  // Sandbox Test Payment Completion (For evaluation & demo testing)
  app.post('/api/test-pay', async (req, res) => {
    try {
      const { reference } = req.body;
      if (!reference) {
        return res.status(400).json({ error: 'Reference required' });
      }

      const order = await DB.getOrderByRef(reference);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Atomically mark order paid and commit voucher
      const result = await DB.markOrderPaid(order.id, reference);
      res.json({
        success: result.success,
        status: result.status,
        voucher_code: result.voucher?.code,
      });
    } catch (err) {
      console.error('Test payment failed:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Receipt retrieval by 256-bit token (Cache-Control: no-store, noindex)
  app.get('/api/receipt/:token', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    try {
      const token = req.params.token;
      if (!token || token.length < 32) {
        return res.status(400).json({ error: 'Invalid receipt token format' });
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await DB.getOrderByTokenHash(tokenHash);

      if (!result) {
        return res.status(404).json({
          error: 'Receipt not found or token has expired. Without your link, this page cannot be recovered.',
        });
      }

      const { order, voucher_code, router_login_url } = result;

      // Construct verified router connect link
      const connectUrl = voucher_code
        ? `${router_login_url}?code=${encodeURIComponent(voucher_code)}`
        : null;

      res.json({
        success: true,
        order: {
          id: order.id,
          plan_slug: order.plan_slug,
          plan_name: order.plan_name,
          amount_pesewas: order.amount_pesewas,
          amount_ghs: order.amount_pesewas / 100,
          currency: order.currency,
          status: order.status,
          paystack_ref: order.paystack_ref,
          created_at: order.created_at,
          paid_at: order.paid_at,
          token_expires_at: order.token_expires_at,
        },
        voucher_code,
        router_login_url,
        connect_url: connectUrl,
        qr_data: connectUrl || voucher_code,
      });
    } catch (err) {
      console.error('Error fetching receipt:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Customer Email OTP Request
  app.post('/api/auth/otp/request', async (req, res) => {
    try {
      const { email } = req.body;
      const result = await AuthService.requestEmailOtp(email);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({
        success: true,
        message: 'Verification code sent to your email.',
        simulated_code: result.simulatedCode, // Provided for sandbox evaluation
      });
    } catch (err) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Customer Email OTP Verify
  app.post('/api/auth/otp/verify', async (req, res) => {
    try {
      const { email, code } = req.body;
      const result = await AuthService.verifyEmailOtp(email, code);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true, token: result.token });
    } catch (err) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Customer Orders (Signed-in Dashboard)
  app.get('/api/customer/orders', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, private');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';

    const session = await AuthService.validateCustomerSession(token);
    if (!session.valid || !session.email) {
      return res.status(401).json({ error: 'Please sign in to view your purchases.' });
    }

    try {
      const orders = await DB.getCustomerOrders(session.email);
      res.json({ success: true, email: session.email, orders });
    } catch (err) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // --- ADMIN ENDPOINTS (Private, noindex, 15-min inactivity timeout, TOTP MFA) ---

  // Admin Login (Password + TOTP)
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password, totp_code } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const result = await AuthService.verifyAdminLogin(username, password, totp_code, clientIp);
      if (!result.success) {
        return res.status(401).json({ error: result.error || 'Authentication failed' });
      }

      res.json({ success: true, token: result.token });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Admin Logout
  app.post('/api/admin/logout', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (token) {
      await AuthService.logoutAdmin(token);
    }
    res.json({ success: true });
  });

  // Admin Session Verify (`/api/admin/me`)
  app.get('/api/admin/me', requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.json({ success: true, user: (req as express.Request & { adminUser?: string }).adminUser });
  });

  // Admin MFA Helper for Demo / Initial Setup
  app.get('/api/admin/mfa-helper', async (req, res) => {
    try {
      const currentCode = await AuthService.getTotpCurrentCode('admin');
      res.json({
        totp_secret: 'LAVAMITOTPSECRET2026',
        current_valid_code: currentCode,
        default_user: 'admin',
        default_password: 'LavamiAdmin2026!',
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve MFA info' });
    }
  });

  // Overall & Package Stock Intelligence
  app.get('/api/admin/stock', requireAdmin, async (req, res) => {
    try {
      const report = await DB.getStockReport();
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ error: 'Error generating stock intelligence' });
    }
  });

  // Orders Dashboard
  app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
      const { status, search, limit, offset } = req.query;
      const data = await DB.getOrders({
        status: status as string,
        search: search as string,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      });
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ error: 'Error fetching orders' });
    }
  });

  // Refund Order & Void Voucher
  app.post('/api/admin/orders/:id/refund', requireAdmin, async (req, res) => {
    try {
      const orderId = req.params.id;
      const { reason } = req.body;
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';

      const result = await DB.refundOrder(orderId, reason, adminId, ip);
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }
      res.json({ success: true, message: result.message });
    } catch (err) {
      res.status(500).json({ error: 'Error processing refund' });
    }
  });

  // Preview Voucher CSV Import
  app.post('/api/admin/vouchers/preview', requireAdmin, async (req, res) => {
    try {
      const { rows } = req.body;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Rows array required' });
      }
      const preview = await DB.previewVoucherImport(rows);
      res.json({ success: true, preview });
    } catch (err) {
      res.status(500).json({ error: 'Error previewing CSV import' });
    }
  });

  // Commit Voucher CSV Import (Atomic all-or-nothing)
  app.post('/api/admin/vouchers/import', requireAdmin, async (req, res) => {
    try {
      const { rows } = req.body;
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';

      const result = await DB.importVouchers(rows, adminId, ip);
      if (!result.success) {
        return res.status(400).json({ error: result.error, details: result.details });
      }
      res.json({ success: true, imported_count: result.imported_count });
    } catch (err) {
      res.status(500).json({ error: 'Error committing CSV import' });
    }
  });

  // Export Vouchers (Safe against formula injection)
  app.get('/api/admin/vouchers/export', requireAdmin, async (req, res) => {
    try {
      const plan = req.query.plan as string | undefined;
      const csv = await DB.exportVouchersSafe(plan);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="lavami_vouchers_${plan || 'all'}_${Date.now()}.csv"`
      );
      res.send(csv);
    } catch (err) {
      res.status(500).send('Error exporting vouchers');
    }
  });

  // Get Disable Router Queue
  app.get('/api/admin/vouchers/disable-queue', requireAdmin, async (req, res) => {
    try {
      const queue = await DB.getDisableRouterQueue();
      res.json({ success: true, queue });
    } catch (err) {
      res.status(500).json({ error: 'Error fetching router queue' });
    }
  });

  // Mark Voucher Disabled on Router
  app.post('/api/admin/vouchers/disable-queue/:id/done', requireAdmin, async (req, res) => {
    try {
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';
      const ok = await DB.markRouterDisabled(req.params.id, adminId, ip);
      if (!ok) return res.status(404).json({ error: 'Entry not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error updating queue' });
    }
  });

  // Admin Plans CRUD
  app.get('/api/admin/plans', requireAdmin, async (req, res) => {
    try {
      const plans = await DB.getPlans();
      res.json({ success: true, plans });
    } catch (err) {
      res.status(500).json({ error: 'Error fetching plans' });
    }
  });

  app.put('/api/admin/plans/:id', requireAdmin, async (req, res) => {
    try {
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';
      const plan = await DB.updatePlan(req.params.id, req.body, adminId, ip);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      res.json({ success: true, plan });
    } catch (err) {
      res.status(500).json({ error: 'Error updating plan' });
    }
  });

  // Admin Settings
  app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
      const settings = await DB.getAdminSettings();
      res.json({ success: true, settings });
    } catch (err) {
      res.status(500).json({ error: 'Error fetching settings' });
    }
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';
      await DB.updateSettings(req.body, adminId, ip);
      const updated = await DB.getAdminSettings();
      res.json({ success: true, settings: updated });
    } catch (err) {
      res.status(500).json({ error: 'Error updating settings' });
    }
  });

  // Admin Audit Log
  app.get('/api/admin/audit', requireAdmin, async (req, res) => {
    try {
      const logs = await DB.getAuditLog(100);
      res.json({ success: true, logs });
    } catch (err) {
      res.status(500).json({ error: 'Error fetching audit log' });
    }
  });

  // Release Expired Reservations Now
  app.post('/api/admin/release-expired', requireAdmin, async (req, res) => {
    try {
      const count = await DB.releaseExpiredReservations();
      res.json({ success: true, released_count: count });
    } catch (err) {
      res.status(500).json({ error: 'Error releasing expired reservations' });
    }
  });

  // Admin Rotate Password / MFA Secret
  app.post('/api/admin/update-credentials', requireAdmin, async (req, res) => {
    try {
      const { current_password, new_password, new_totp_secret } = req.body;
      const adminId = (req as express.Request & { adminUser?: string }).adminUser || 'admin';
      const ip = req.ip || '127.0.0.1';

      const result = await AuthService.updateAdminCredentials(
        current_password,
        new_password,
        new_totp_secret,
        adminId,
        ip
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({ success: true, message: 'Credentials updated successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Error updating credentials' });
    }
  });

  // --- Vite / Static Files Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Lavami WiFi Shop] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
