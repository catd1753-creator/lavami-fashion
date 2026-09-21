import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Plan,
  Voucher,
  Order,
  AdminSettings,
  OverallStockReport,
  PackageStockReport,
  AuditLogEntry,
  DisableRouterEntry,
} from '../types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'lavami-store.json');

interface DBSchema {
  plans: Plan[];
  vouchers: Voucher[];
  orders: Order[];
  admin_users: {
    username: string;
    password_hash: string;
    salt: string;
    totp_secret: string;
    mfa_enabled: boolean;
    role: 'admin';
  }[];
  sessions: {
    token: string;
    username: string;
    role: string;
    last_active: number;
    expires_at: number;
  }[];
  otp_codes: {
    email: string;
    code: string;
    expires_at: number;
    attempts: number;
  }[];
  customer_sessions: {
    token: string;
    email: string;
    expires_at: number;
  }[];
  settings: {
    router_login_url: string;
    low_stock_threshold: number;
    critical_stock_threshold: number;
    shop_phone: string;
    alert_email: string;
    alert_phone: string;
    paystack_public_key: string;
    paystack_secret_key: string;
    turnstile_site_key: string;
    turnstile_secret_key: string;
    is_test_mode: boolean;
    tailoring_advertisement: string;
  };
  audit_log: AuditLogEntry[];
  disable_router_queue: DisableRouterEntry[];
  webhook_events: { event_id: string; received_at: string; status: string }[];
  rate_limits: Record<string, { count: number; reset_at: number }>;
}

// Mutex for atomic transactions
let dbMutex: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const result = dbMutex.then(async () => {
    return await fn();
  });
  dbMutex = result.then(() => {}, () => {});
  return result;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default initial database state
function createDefaultDatabase(): DBSchema {
  const now = new Date().toISOString();

  const initialPlans: Plan[] = [
    {
      id: 'plan_daily',
      name: 'Daily Pass',
      slug: 'daily',
      price: 8,
      price_pesewas: 800,
      data_allowance: '10 GB',
      validity: '1 day',
      active: true,
      stock_status: 'in_stock',
      available_count: 30,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'plan_weekly',
      name: 'Weekly Pass',
      slug: 'weekly',
      price: 50,
      price_pesewas: 5000,
      data_allowance: 'Unlimited',
      validity: '1 week',
      active: true,
      stock_status: 'in_stock',
      available_count: 25,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'plan_monthly',
      name: 'Monthly Pass',
      slug: 'monthly',
      price: 150,
      price_pesewas: 15000,
      data_allowance: 'Unlimited',
      validity: '1 month',
      active: true,
      stock_status: 'in_stock',
      available_count: 20,
      created_at: now,
      updated_at: now,
    },
  ];

  // Helper to generate seed voucher codes: 8-char uppercase alphanumeric
  function generateSeedCodes(prefix: string, count: number, planSlug: string): Voucher[] {
    const vouchers: Voucher[] = [];
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous characters
    for (let i = 1; i <= count; i++) {
      let code = prefix;
      for (let j = 0; j < 6; j++) {
        code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      vouchers.push({
        id: `vouch_${planSlug}_${i}_${crypto.randomBytes(4).toString('hex')}`,
        code: code.toUpperCase(),
        plan_id: `plan_${planSlug}`,
        plan_slug: planSlug,
        status: 'unused',
        order_id: null,
        reserved_until: null,
        created_at: now,
        updated_at: now,
      });
    }
    return vouchers;
  }

  const initialVouchers: Voucher[] = [
    ...generateSeedCodes('D', 30, 'daily'),
    ...generateSeedCodes('W', 25, 'weekly'),
    ...generateSeedCodes('M', 20, 'monthly'),
  ];

  // Initial admin setup: username "admin", password "LavamiAdmin2026!"
  // Hashed with PBKDF2
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto
    .pbkdf2Sync('LavamiAdmin2026!', salt, 100000, 64, 'sha512')
    .toString('hex');

  // Standard Base32 TOTP secret for admin 2FA (e.g. "JBSWY3DPEHPK3PXP")
  const totpSecret = 'LAVAMITOTPSECRET2026';

  return {
    plans: initialPlans,
    vouchers: initialVouchers,
    orders: [],
    admin_users: [
      {
        username: 'admin',
        password_hash: passwordHash,
        salt: salt,
        totp_secret: totpSecret,
        mfa_enabled: true,
        role: 'admin',
      },
    ],
    sessions: [],
    otp_codes: [],
    customer_sessions: [],
    settings: {
      router_login_url: process.env.ROUTER_LOGIN_URL || 'http://192.168.88.1/login',
      low_stock_threshold: 50,
      critical_stock_threshold: 10,
      shop_phone: '+233 592 495 005',
      alert_email: 'admin@lavami.com',
      alert_phone: '+233 592 495 005',
      paystack_public_key: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_sample_lavami',
      paystack_secret_key: process.env.PAYSTACK_SECRET_KEY || 'sk_test_sample_lavami',
      turnstile_site_key: process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '',
      turnstile_secret_key: process.env.CLOUDFLARE_TURNSTILE_SECRET || '',
      is_test_mode: true,
      tailoring_advertisement: 'Lavami Fashion at Kumasi IPT. Quality fashion, sharp fits, and great style.',
    },
    audit_log: [
      {
        id: 'audit_init',
        action: 'SYSTEM_INITIALIZED',
        details: 'Lavami Fashion WiFi Shop initialized with default plans and secure inventory',
        admin_id: 'system',
        ip: '127.0.0.1',
        timestamp: now,
      },
    ],
    disable_router_queue: [],
    webhook_events: [],
    rate_limits: {},
  };
}

// Read database
function readDB(): DBSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = createDefaultDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB, using fresh instance', err);
    return createDefaultDatabase();
  }
}

// Write database atomically
function writeDB(data: DBSchema): void {
  const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

export class DB {
  // Public Plans (with real-time stock counts)
  static async getPlans(): Promise<Plan[]> {
    return withLock(() => {
      const db = readDB();
      const now = Date.now();

      // Clean expired reservations inline
      let dirty = false;
      db.vouchers.forEach((v) => {
        if (v.status === 'reserved' && v.reserved_until) {
          if (new Date(v.reserved_until).getTime() < now) {
            v.status = 'unused';
            v.order_id = null;
            v.reserved_until = null;
            v.updated_at = new Date().toISOString();
            dirty = true;
          }
        }
      });
      if (dirty) writeDB(db);

      return db.plans.map((p) => {
        const available = db.vouchers.filter(
          (v) => v.plan_slug === p.slug && v.status === 'unused'
        ).length;

        let stockStatus: Plan['stock_status'] = 'in_stock';
        if (available === 0) {
          stockStatus = 'sold_out';
        } else if (available <= db.settings.critical_stock_threshold) {
          stockStatus = 'low_stock';
        }

        return {
          ...p,
          available_count: available,
          stock_status: stockStatus,
        };
      });
    });
  }

  // Get specific plan by slug
  static async getPlanBySlug(slug: string): Promise<Plan | null> {
    const plans = await this.getPlans();
    return plans.find((p) => p.slug === slug && p.active) || null;
  }

  // Public Settings
  static async getPublicSettings(): Promise<{
    router_login_url: string;
    shop_phone: string;
    low_stock_threshold: number;
    turnstile_site_key: string | null;
    paystack_public_key: string | null;
    is_test_mode: boolean;
    tailoring_advertisement: string;
  }> {
    return withLock(() => {
      const db = readDB();
      return {
        router_login_url: db.settings.router_login_url,
        shop_phone: db.settings.shop_phone,
        low_stock_threshold: db.settings.low_stock_threshold,
        turnstile_site_key: db.settings.turnstile_site_key || null,
        paystack_public_key: db.settings.paystack_public_key || null,
        is_test_mode: db.settings.is_test_mode,
        tailoring_advertisement: db.settings.tailoring_advertisement,
      };
    });
  }

  // Admin Settings (Sensitive secrets masked)
  static async getAdminSettings(): Promise<AdminSettings> {
    return withLock(() => {
      const db = readDB();
      return {
        router_login_url: db.settings.router_login_url,
        shop_phone: db.settings.shop_phone,
        low_stock_threshold: db.settings.low_stock_threshold,
        alert_email: db.settings.alert_email,
        alert_phone: db.settings.alert_phone,
        turnstile_site_key: db.settings.turnstile_site_key || null,
        paystack_public_key: db.settings.paystack_public_key || null,
        has_paystack_secret: Boolean(db.settings.paystack_secret_key),
        has_turnstile_secret: Boolean(db.settings.turnstile_secret_key),
        is_test_mode: db.settings.is_test_mode,
        tailoring_advertisement: db.settings.tailoring_advertisement,
        mfa_configured: true,
        session_timeout_minutes: 15,
      };
    });
  }

  // Update Settings
  static async updateSettings(
    updates: Partial<{
      router_login_url: string;
      low_stock_threshold: number;
      critical_stock_threshold: number;
      shop_phone: string;
      alert_email: string;
      alert_phone: string;
      paystack_public_key: string;
      paystack_secret_key: string;
      turnstile_site_key: string;
      turnstile_secret_key: string;
      is_test_mode: boolean;
      tailoring_advertisement: string;
    }>,
    adminId: string,
    ip: string
  ): Promise<void> {
    return withLock(() => {
      const db = readDB();
      const changedKeys: string[] = [];

      Object.entries(updates).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          // Do not overwrite secrets if empty string passed as placeholder
          if (
            (key === 'paystack_secret_key' || key === 'turnstile_secret_key') &&
            typeof val === 'string' &&
            val.trim() === ''
          ) {
            return;
          }
          (db.settings as Record<string, unknown>)[key] = val;
          changedKeys.push(key);
        }
      });

      db.audit_log.push({
        id: `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        action: 'SETTINGS_UPDATED',
        details: `Updated settings keys: ${changedKeys.join(', ')}`,
        admin_id: adminId,
        ip: ip,
        timestamp: new Date().toISOString(),
      });

      writeDB(db);
    });
  }

  // Atomic Voucher Reservation: FOR UPDATE SKIP LOCKED pattern
  static async reserveVoucher(
    planSlug: string,
    orderId: string,
    reservationMinutes = 15
  ): Promise<Voucher | null> {
    return withLock(() => {
      const db = readDB();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + reservationMinutes * 60 * 1000).toISOString();

      // Find first available unused voucher for the plan
      const voucher = db.vouchers.find(
        (v) => v.plan_slug === planSlug && v.status === 'unused'
      );

      if (!voucher) {
        return null;
      }

      voucher.status = 'reserved';
      voucher.order_id = orderId;
      voucher.reserved_until = expiresAt;
      voucher.updated_at = now.toISOString();

      writeDB(db);
      return { ...voucher };
    });
  }

  // Confirm Voucher upon payment verification: transitions 'reserved' to 'sold'
  static async confirmVoucher(orderId: string): Promise<Voucher | null> {
    return withLock(() => {
      const db = readDB();
      const now = new Date().toISOString();

      const voucher = db.vouchers.find((v) => v.order_id === orderId && v.status === 'reserved');
      if (!voucher) {
        // Maybe order was already confirmed
        const alreadySold = db.vouchers.find(
          (v) => v.order_id === orderId && v.status === 'sold'
        );
        return alreadySold ? { ...alreadySold } : null;
      }

      voucher.status = 'sold';
      voucher.reserved_until = null;
      voucher.updated_at = now;

      writeDB(db);
      return { ...voucher };
    });
  }

  // Release expired reservations (runs periodically & on demand)
  static async releaseExpiredReservations(): Promise<number> {
    return withLock(() => {
      const db = readDB();
      const now = Date.now();
      let count = 0;

      db.vouchers.forEach((v) => {
        if (v.status === 'reserved' && v.reserved_until) {
          if (new Date(v.reserved_until).getTime() < now) {
            v.status = 'unused';
            v.order_id = null;
            v.reserved_until = null;
            v.updated_at = new Date().toISOString();
            count++;
          }
        }
      });

      if (count > 0) {
        writeDB(db);
      }
      return count;
    });
  }

  // Create Order
  static async createOrder(orderData: {
    plan_slug: string;
    user_id?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    paystack_ref: string;
    receipt_token_hash: string;
  }): Promise<{ order: Order; voucher: Voucher } | { error: string }> {
    return withLock(() => {
      const db = readDB();
      const plan = db.plans.find((p) => p.slug === orderData.plan_slug && p.active);
      if (!plan) {
        return { error: 'Invalid or inactive plan' };
      }

      // Check stock
      const availableVouchers = db.vouchers.filter(
        (v) => v.plan_slug === plan.slug && v.status === 'unused'
      );
      if (availableVouchers.length === 0) {
        return { error: 'Sold out, please call us.' };
      }

      const orderId = `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date();
      const tokenExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
      const reservationUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 mins

      // Reserve voucher
      const voucher = availableVouchers[0];
      voucher.status = 'reserved';
      voucher.order_id = orderId;
      voucher.reserved_until = reservationUntil;
      voucher.updated_at = now.toISOString();

      const newOrder: Order = {
        id: orderId,
        plan_id: plan.id,
        plan_slug: plan.slug,
        plan_name: plan.name,
        user_id: orderData.user_id || null,
        contact_email: orderData.contact_email || null,
        contact_phone: orderData.contact_phone || null,
        amount_pesewas: plan.price_pesewas,
        currency: 'GHS',
        paystack_ref: orderData.paystack_ref,
        receipt_token_hash: orderData.receipt_token_hash,
        status: 'pending',
        created_at: now.toISOString(),
        paid_at: null,
        token_expires_at: tokenExpiresAt,
      };

      db.orders.push(newOrder);
      writeDB(db);

      return { order: newOrder, voucher: { ...voucher } };
    });
  }

  // Get order by Paystack reference
  static async getOrderByRef(ref: string): Promise<Order | null> {
    return withLock(() => {
      const db = readDB();
      return db.orders.find((o) => o.paystack_ref === ref) || null;
    });
  }

  // Get order by ID
  static async getOrderById(id: string): Promise<Order | null> {
    return withLock(() => {
      const db = readDB();
      return db.orders.find((o) => o.id === id) || null;
    });
  }

  // Get Order by Receipt Token Hash (For secure receipt retrieval)
  static async getOrderByTokenHash(tokenHash: string): Promise<{
    order: Order;
    voucher_code: string | null;
    router_login_url: string;
  } | null> {
    return withLock(() => {
      const db = readDB();
      const order = db.orders.find((o) => o.receipt_token_hash === tokenHash);
      if (!order) return null;

      // Check token expiry
      if (new Date(order.token_expires_at).getTime() < Date.now()) {
        return null;
      }

      let voucherCode: string | null = null;
      if (order.status === 'paid') {
        const voucher = db.vouchers.find((v) => v.order_id === order.id && v.status === 'sold');
        voucherCode = voucher ? voucher.code : null;
      }

      return {
        order,
        voucher_code: voucherCode,
        router_login_url: db.settings.router_login_url,
      };
    });
  }

  // Mark order paid and commit voucher
  static async markOrderPaid(
    orderId: string,
    paystackRef: string
  ): Promise<{ success: boolean; status: Order['status']; voucher?: Voucher }> {
    return withLock(() => {
      const db = readDB();
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) return { success: false, status: 'failed' };

      if (order.status === 'paid') {
        const existingVoucher = db.vouchers.find((v) => v.order_id === orderId);
        return { success: true, status: 'paid', voucher: existingVoucher };
      }

      const now = new Date().toISOString();

      // Find reserved voucher for this order
      let voucher = db.vouchers.find((v) => v.order_id === orderId && v.status === 'reserved');

      // If reservation was lost or expired, try to find another unused voucher of the same plan
      if (!voucher) {
        const backupVoucher = db.vouchers.find(
          (v) => v.plan_slug === order.plan_slug && v.status === 'unused'
        );
        if (backupVoucher) {
          voucher = backupVoucher;
          voucher.order_id = orderId;
        } else {
          // Critical: Paid without stock!
          order.status = 'paid_no_stock';
          order.paid_at = now;
          db.audit_log.push({
            id: `audit_alert_${Date.now()}`,
            action: 'ALERT_PAID_NO_STOCK',
            details: `Order ${order.id} paid GHS ${order.amount_pesewas / 100} but no voucher available! Immediate admin attention required.`,
            admin_id: 'system',
            ip: '127.0.0.1',
            timestamp: now,
          });
          writeDB(db);
          return { success: false, status: 'paid_no_stock' };
        }
      }

      voucher.status = 'sold';
      voucher.reserved_until = null;
      voucher.updated_at = now;

      order.status = 'paid';
      order.paid_at = now;

      db.audit_log.push({
        id: `audit_paid_${Date.now()}`,
        action: 'ORDER_PAID',
        details: `Order ${order.id} confirmed paid via Paystack (${paystackRef}). Voucher ${voucher.code} assigned.`,
        admin_id: 'system',
        ip: '127.0.0.1',
        timestamp: now,
      });

      writeDB(db);
      return { success: true, status: 'paid', voucher: { ...voucher } };
    });
  }

  // Refund Order & Void Voucher & Queue for Router Disabling
  static async refundOrder(
    orderId: string,
    reason: string,
    adminId: string,
    ip: string
  ): Promise<{ success: boolean; message: string }> {
    return withLock(() => {
      const db = readDB();
      const order = db.orders.find((o) => o.id === orderId);
      if (!order) return { success: false, message: 'Order not found' };

      if (order.status === 'refunded') {
        return { success: false, message: 'Order already refunded' };
      }

      const now = new Date().toISOString();
      order.status = 'refunded';

      // Find associated voucher
      const voucher = db.vouchers.find((v) => v.order_id === orderId);
      if (voucher) {
        voucher.status = 'void';
        voucher.updated_at = now;

        // Add to Router Disable Queue
        db.disable_router_queue.push({
          id: `dis_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          voucher_code: voucher.code,
          plan_slug: voucher.plan_slug,
          order_id: order.id,
          reason: reason || 'Customer refund processed',
          refunded_at: now,
          disabled_on_router: false,
          disabled_at: null,
        });
      }

      db.audit_log.push({
        id: `audit_refund_${Date.now()}`,
        action: 'ORDER_REFUNDED',
        details: `Order ${order.id} refunded (${reason}). Voucher ${voucher?.code || 'none'} voided and added to router disable queue.`,
        admin_id: adminId,
        ip: ip,
        timestamp: now,
      });

      writeDB(db);
      return { success: true, message: 'Order refunded and voucher voided successfully' };
    });
  }

  // Mark voucher as disabled on router
  static async markRouterDisabled(id: string, adminId: string, ip: string): Promise<boolean> {
    return withLock(() => {
      const db = readDB();
      const entry = db.disable_router_queue.find((e) => e.id === id);
      if (!entry) return false;

      entry.disabled_on_router = true;
      entry.disabled_at = new Date().toISOString();

      db.audit_log.push({
        id: `audit_router_dis_${Date.now()}`,
        action: 'ROUTER_VOUCHER_DISABLED',
        details: `Voucher ${entry.voucher_code} confirmed disabled on MikroTik router.`,
        admin_id: adminId,
        ip: ip,
        timestamp: new Date().toISOString(),
      });

      writeDB(db);
      return true;
    });
  }

  // Get Disable Router Queue
  static async getDisableRouterQueue(): Promise<DisableRouterEntry[]> {
    return withLock(() => {
      const db = readDB();
      return [...db.disable_router_queue];
    });
  }

  // Webhook Event Deduplication
  static async recordWebhookEvent(eventId: string): Promise<boolean> {
    return withLock(() => {
      const db = readDB();
      if (db.webhook_events.some((e) => e.event_id === eventId)) {
        return false; // Already processed!
      }
      db.webhook_events.push({
        event_id: eventId,
        received_at: new Date().toISOString(),
        status: 'processed',
      });
      writeDB(db);
      return true;
    });
  }

  // Rate Limiter Check (Sliding Window)
  static async checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    return withLock(() => {
      const db = readDB();
      const now = Date.now();
      const windowMs = windowSeconds * 1000;

      const record = db.rate_limits[key];
      if (!record || record.reset_at < now) {
        db.rate_limits[key] = {
          count: 1,
          reset_at: now + windowMs,
        };
        writeDB(db);
        return { allowed: true, remaining: maxRequests - 1, resetIn: windowSeconds };
      }

      if (record.count >= maxRequests) {
        const resetIn = Math.ceil((record.reset_at - now) / 1000);
        return { allowed: false, remaining: 0, resetIn };
      }

      record.count++;
      writeDB(db);
      const resetIn = Math.ceil((record.reset_at - now) / 1000);
      return { allowed: true, remaining: maxRequests - record.count, resetIn };
    });
  }

  // Stock Intelligence Report
  static async getStockReport(): Promise<OverallStockReport> {
    return withLock(() => {
      const db = readDB();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      let totalVouchers = db.vouchers.length;
      let totalAvailable = 0;
      let totalReserved = 0;
      let totalSold = 0;
      let totalVoid = 0;
      let totalRevenue = 0;
      let todayRevenue = 0;

      const packages: PackageStockReport[] = db.plans.map((p) => {
        const pkgVouchers = db.vouchers.filter((v) => v.plan_slug === p.slug);
        const available = pkgVouchers.filter((v) => v.status === 'unused').length;
        const reserved = pkgVouchers.filter((v) => v.status === 'reserved').length;
        const sold = pkgVouchers.filter((v) => v.status === 'sold').length;
        const voidCount = pkgVouchers.filter((v) => v.status === 'void').length;
        const total = pkgVouchers.length;

        totalAvailable += available;
        totalReserved += reserved;
        totalSold += sold;
        totalVoid += voidCount;

        // Calculate sales
        const planOrders = db.orders.filter((o) => o.plan_slug === p.slug && o.status === 'paid');
        const totalRev = planOrders.reduce((sum, o) => sum + o.amount_pesewas / 100, 0);
        const todayOrders = planOrders.filter(
          (o) => o.paid_at && new Date(o.paid_at).getTime() >= todayStart
        );
        const todaySales = todayOrders.length;
        const todayRev = todayOrders.reduce((sum, o) => sum + o.amount_pesewas / 100, 0);

        totalRevenue += totalRev;
        todayRevenue += todayRev;

        const isLow = available <= db.settings.low_stock_threshold;
        const isCritical = available <= db.settings.critical_stock_threshold;
        const remainingPct = total > 0 ? Math.round((available / total) * 100) : 0;

        return {
          plan_slug: p.slug,
          plan_name: p.name,
          price: p.price,
          total_imported: total,
          available,
          reserved,
          sold,
          void: voidCount,
          remaining_percentage: remainingPct,
          sales_today: todaySales,
          sales_total_revenue: totalRev,
          is_low_stock: isLow,
          is_critical_stock: isCritical,
        };
      });

      const stockPct = totalVouchers > 0 ? Math.round((totalAvailable / totalVouchers) * 100) : 0;
      const paidNoStockCount = db.orders.filter((o) => o.status === 'paid_no_stock').length;
      const stuckReservations = db.vouchers.filter((v) => v.status === 'reserved').length;

      // Identify fastest selling and nearly sold out
      let fastestSelling: string | null = null;
      let maxSales = -1;
      let nearlySoldOut: string | null = null;
      let minAvailable = Infinity;

      packages.forEach((pkg) => {
        if (pkg.sold > maxSales && pkg.sold > 0) {
          maxSales = pkg.sold;
          fastestSelling = pkg.plan_name;
        }
        if (pkg.available < minAvailable) {
          minAvailable = pkg.available;
          nearlySoldOut = pkg.plan_name;
        }
      });

      return {
        total_vouchers: totalVouchers,
        available_vouchers: totalAvailable,
        reserved_vouchers: totalReserved,
        sold_vouchers: totalSold,
        void_vouchers: totalVoid,
        stock_percentage: stockPct,
        total_revenue_ghs: totalRevenue,
        today_revenue_ghs: todayRevenue,
        paid_no_stock_count: paidNoStockCount,
        stuck_reservations_count: stuckReservations,
        fastest_selling_package: fastestSelling,
        nearly_sold_out_package: nearlySoldOut,
        packages,
      };
    });
  }

  // Orders Dashboard with filtering
  static async getOrders(filter?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    return withLock(() => {
      const db = readDB();
      let list = [...db.orders].reverse(); // newest first

      if (filter?.status && filter.status !== 'all') {
        list = list.filter((o) => o.status === filter.status);
      }

      if (filter?.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            o.paystack_ref.toLowerCase().includes(q) ||
            (o.contact_email && o.contact_email.toLowerCase().includes(q)) ||
            (o.contact_phone && o.contact_phone.includes(q))
        );
      }

      const total = list.length;
      const offset = filter?.offset || 0;
      const limit = filter?.limit || 50;
      const paginated = list.slice(offset, offset + limit);

      // Return orders without leaking full voucher codes into raw order list
      return {
        orders: paginated,
        total,
      };
    });
  }

  // CSV Voucher Import (Atomic All-Or-Nothing, max 5,000 rows, strict validation)
  static async importVouchers(
    rows: { code: string; plan: string }[],
    adminId: string,
    ip: string
  ): Promise<{
    success: boolean;
    imported_count: number;
    error?: string;
    details?: { duplicates: string[]; invalid: string[]; valid_count: number };
  }> {
    return withLock(() => {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { success: false, imported_count: 0, error: 'Empty import dataset' };
      }

      if (rows.length > 5000) {
        return { success: false, imported_count: 0, error: 'CSV exceeds maximum limit of 5,000 rows' };
      }

      const db = readDB();
      const codeRegex = /^[A-Z0-9]{6,12}$/;
      const validPlanSlugs = new Set(db.plans.map((p) => p.slug));
      const existingCodes = new Set(db.vouchers.map((v) => v.code.toUpperCase()));

      const duplicates: string[] = [];
      const invalid: string[] = [];
      const seenInFile = new Set<string>();
      const validEntries: Voucher[] = [];
      const now = new Date().toISOString();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawCode = String(row.code || '').trim().toUpperCase();
        const rawPlan = String(row.plan || '').trim().toLowerCase();

        if (!rawCode || !codeRegex.test(rawCode)) {
          invalid.push(`Row ${i + 1}: Code "${rawCode}" must match ^[A-Z0-9]{6,12}$`);
          continue;
        }

        if (!validPlanSlugs.has(rawPlan)) {
          invalid.push(`Row ${i + 1}: Unknown plan slug "${rawPlan}"`);
          continue;
        }

        if (existingCodes.has(rawCode) || seenInFile.has(rawCode)) {
          duplicates.push(rawCode);
          continue;
        }

        seenInFile.add(rawCode);
        const plan = db.plans.find((p) => p.slug === rawPlan)!;

        validEntries.push({
          id: `vouch_${rawPlan}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          code: rawCode,
          plan_id: plan.id,
          plan_slug: rawPlan,
          status: 'unused',
          order_id: null,
          reserved_until: null,
          created_at: now,
          updated_at: now,
        });
      }

      // If invalid records or duplicates found, all-or-nothing check!
      if (invalid.length > 0 || duplicates.length > 0) {
        return {
          success: false,
          imported_count: 0,
          error: `Import rejected to prevent corrupt inventory. ${duplicates.length} duplicates and ${invalid.length} invalid rows found.`,
          details: {
            duplicates: duplicates.slice(0, 50),
            invalid: invalid.slice(0, 50),
            valid_count: validEntries.length,
          },
        };
      }

      // Commit all valid entries
      db.vouchers.push(...validEntries);

      db.audit_log.push({
        id: `audit_import_${Date.now()}`,
        action: 'VOUCHERS_IMPORTED',
        details: `Successfully imported ${validEntries.length} vouchers across packages.`,
        admin_id: adminId,
        ip: ip,
        timestamp: now,
      });

      writeDB(db);
      return {
        success: true,
        imported_count: validEntries.length,
        details: { duplicates: [], invalid: [], valid_count: validEntries.length },
      };
    });
  }

  // Preview CSV Import without committing
  static async previewVoucherImport(
    rows: { code: string; plan: string }[]
  ): Promise<{
    total_rows: number;
    valid_count: number;
    duplicate_count: number;
    invalid_count: number;
    duplicates: string[];
    invalid_examples: string[];
    by_plan: Record<string, number>;
  }> {
    return withLock(() => {
      const db = readDB();
      const codeRegex = /^[A-Z0-9]{6,12}$/;
      const validPlanSlugs = new Set(db.plans.map((p) => p.slug));
      const existingCodes = new Set(db.vouchers.map((v) => v.code.toUpperCase()));

      const duplicates: string[] = [];
      const invalid: string[] = [];
      const seenInFile = new Set<string>();
      const byPlan: Record<string, number> = {};
      let validCount = 0;

      rows.forEach((row, i) => {
        const rawCode = String(row.code || '').trim().toUpperCase();
        const rawPlan = String(row.plan || '').trim().toLowerCase();

        if (!rawCode || !codeRegex.test(rawCode)) {
          invalid.push(`Row ${i + 1}: Code "${rawCode}" must match ^[A-Z0-9]{6,12}$`);
          return;
        }

        if (!validPlanSlugs.has(rawPlan)) {
          invalid.push(`Row ${i + 1}: Unknown plan slug "${rawPlan}"`);
          return;
        }

        if (existingCodes.has(rawCode) || seenInFile.has(rawCode)) {
          duplicates.push(rawCode);
          return;
        }

        seenInFile.add(rawCode);
        byPlan[rawPlan] = (byPlan[rawPlan] || 0) + 1;
        validCount++;
      });

      return {
        total_rows: rows.length,
        valid_count: validCount,
        duplicate_count: duplicates.length,
        invalid_count: invalid.length,
        duplicates: duplicates.slice(0, 30),
        invalid_examples: invalid.slice(0, 30),
        by_plan: byPlan,
      };
    });
  }

  // Safe CSV Export with Formula Injection Escaping (=, +, -, @)
  static async exportVouchersSafe(planSlug?: string): Promise<string> {
    return withLock(() => {
      const db = readDB();
      let list = db.vouchers;
      if (planSlug && planSlug !== 'all') {
        list = list.filter((v) => v.plan_slug === planSlug);
      }

      function escapeCell(val: string): string {
        let clean = String(val);
        // Formula injection protection: prepend single quote if starts with =, +, -, @
        if (/^[=+\-@]/.test(clean)) {
          clean = `'${clean}`;
        }
        if (clean.includes('"') || clean.includes(',') || clean.includes('\n')) {
          clean = `"${clean.replace(/"/g, '""')}"`;
        }
        return clean;
      }

      const headers = ['Voucher Code', 'Plan Slug', 'Status', 'Created At'];
      const rows = list.map((v) => [
        escapeCell(v.code),
        escapeCell(v.plan_slug),
        escapeCell(v.status),
        escapeCell(v.created_at),
      ]);

      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    });
  }

  // Update Plan Pricing / Specs
  static async updatePlan(
    id: string,
    updates: Partial<Pick<Plan, 'name' | 'price' | 'data_allowance' | 'validity' | 'active' | 'slug'>>,
    adminId: string,
    ip: string
  ): Promise<Plan | null> {
    return withLock(() => {
      const db = readDB();
      const plan = db.plans.find((p) => p.id === id);
      if (!plan) return null;

      if (updates.name !== undefined) plan.name = updates.name;
      if (updates.price !== undefined) {
        plan.price = Number(updates.price);
        plan.price_pesewas = Math.round(Number(updates.price) * 100);
      }
      if (updates.data_allowance !== undefined) plan.data_allowance = updates.data_allowance;
      if (updates.validity !== undefined) plan.validity = updates.validity;
      if (updates.active !== undefined) plan.active = updates.active;
      if (updates.slug !== undefined) plan.slug = updates.slug;

      plan.updated_at = new Date().toISOString();

      db.audit_log.push({
        id: `audit_plan_${Date.now()}`,
        action: 'PLAN_MODIFIED',
        details: `Modified plan ${plan.name} (${plan.slug}): price GHS ${plan.price}, validity ${plan.validity}, allowance ${plan.data_allowance}`,
        admin_id: adminId,
        ip: ip,
        timestamp: new Date().toISOString(),
      });

      writeDB(db);
      return { ...plan };
    });
  }

  // Customer Purchases retrieval by user email
  static async getCustomerOrders(email: string): Promise<
    {
      order: Order;
      voucher_code: string | null;
      router_login_url: string;
    }[]
  > {
    return withLock(() => {
      const db = readDB();
      const normEmail = email.trim().toLowerCase();
      const customerOrders = db.orders.filter(
        (o) => o.contact_email && o.contact_email.toLowerCase() === normEmail
      );

      return customerOrders.map((order) => {
        let code: string | null = null;
        if (order.status === 'paid') {
          const v = db.vouchers.find((vch) => vch.order_id === order.id && vch.status === 'sold');
          code = v ? v.code : null;
        }
        return {
          order,
          voucher_code: code,
          router_login_url: db.settings.router_login_url,
        };
      });
    });
  }

  // Audit Log Viewer
  static async getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
    return withLock(() => {
      const db = readDB();
      return [...db.audit_log].reverse().slice(0, limit);
    });
  }

  // Internal access for Auth & Webhooks
  static async _getRawDB(): Promise<DBSchema> {
    return withLock(() => readDB());
  }

  static async _saveRawDB(db: DBSchema): Promise<void> {
    return withLock(() => writeDB(db));
  }
}
