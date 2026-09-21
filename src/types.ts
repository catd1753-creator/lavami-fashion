/**
 * Lavami WiFi Shop — Shared TypeScript Types
 */

export type PlanSlug = 'daily' | 'weekly' | 'monthly';

export interface Plan {
  id: string;
  name: string;
  slug: PlanSlug | string;
  price: number; // in GHS (e.g. 8, 50, 150)
  price_pesewas: number; // in pesewas (e.g. 800, 5000, 15000)
  data_allowance: string; // e.g. "10 GB" or "Unlimited"
  validity: string; // e.g. "1 day", "1 week", "1 month"
  active: boolean;
  stock_status: 'in_stock' | 'low_stock' | 'sold_out';
  available_count: number;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'pending' | 'paid' | 'paid_no_stock' | 'failed' | 'refunded';

export interface Order {
  id: string;
  plan_id: string;
  plan_slug: string;
  plan_name: string;
  user_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  amount_pesewas: number;
  currency: 'GHS';
  paystack_ref: string;
  receipt_token_hash: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  token_expires_at: string;
  voucher_code?: string; // Only present in secure receipt/dashboard views
  router_url?: string;
}

export type VoucherStatus = 'unused' | 'reserved' | 'sold' | 'void';

export interface Voucher {
  id: string;
  code: string;
  plan_id: string;
  plan_slug: string;
  status: VoucherStatus;
  order_id: string | null;
  reserved_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicSettings {
  router_login_url: string;
  shop_phone: string;
  low_stock_threshold: number;
  turnstile_site_key: string | null;
  paystack_public_key: string | null;
  is_test_mode: boolean;
  tailoring_advertisement: string;
}

export interface AdminSettings extends PublicSettings {
  alert_email: string;
  alert_phone: string;
  has_paystack_secret: boolean;
  has_turnstile_secret: boolean;
  mfa_configured: boolean;
  session_timeout_minutes: number;
}

export interface PackageStockReport {
  plan_slug: string;
  plan_name: string;
  price: number;
  total_imported: number;
  available: number;
  reserved: number;
  sold: number;
  void: number;
  remaining_percentage: number;
  sales_today: number;
  sales_total_revenue: number;
  is_low_stock: boolean;
  is_critical_stock: boolean; // < 10
}

export interface OverallStockReport {
  total_vouchers: number;
  available_vouchers: number;
  reserved_vouchers: number;
  sold_vouchers: number;
  void_vouchers: number;
  stock_percentage: number;
  total_revenue_ghs: number;
  today_revenue_ghs: number;
  paid_no_stock_count: number;
  stuck_reservations_count: number;
  fastest_selling_package: string | null;
  nearly_sold_out_package: string | null;
  packages: PackageStockReport[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  details: string;
  admin_id: string;
  ip: string;
  timestamp: string;
}

export interface DisableRouterEntry {
  id: string;
  voucher_code: string;
  plan_slug: string;
  order_id: string;
  reason: string;
  refunded_at: string;
  disabled_on_router: boolean;
  disabled_at: string | null;
}

export interface RouterContext {
  loginUrl: string | null;
  destination: string | null;
  isValidHost: boolean;
  mac?: string | null;
  ip?: string | null;
}
