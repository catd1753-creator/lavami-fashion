import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi,
  Package,
  Layers,
  ShoppingBag,
  Settings as SettingsIcon,
  FileText,
  AlertTriangle,
  RotateCcw,
  LogOut,
  Upload,
  Download,
  Search,
  CheckCircle2,
  RefreshCw,
  Edit2,
  Save,
  Clock,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type {
  OverallStockReport,
  Order,
  AdminSettings,
  DisableRouterEntry,
  AuditLogEntry,
  Plan,
} from '../types.ts';

interface AdminDashboardProps {
  token: string;
  onLogout: () => void;
  onBackToShop: () => void;
}

export function AdminDashboard({ token, onLogout, onBackToShop }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    'stock' | 'vouchers' | 'orders' | 'router_queue' | 'plans' | 'settings' | 'audit'
  >('stock');

  // Inactivity countdown: 15 minutes (900 seconds)
  const [secondsRemaining, setSecondsRemaining] = useState(900);
  const resetTimer = useCallback(() => setSecondsRemaining(900), []);

  useEffect(() => {
    const handleUserActivity = () => resetTimer();
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
    };
  }, [onLogout, resetTimer]);

  // Data states
  const [stockReport, setStockReport] = useState<OverallStockReport | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [routerQueue, setRouterQueue] = useState<DisableRouterEntry[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper to call admin endpoints
  const adminFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
      if (res.status === 401) {
        onLogout();
        throw new Error('Admin session expired.');
      }
      return res;
    },
    [token, onLogout]
  );

  // Load Stock Report
  const loadStock = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/stock');
      const data = await res.json();
      if (data.success) setStockReport(data.report);
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch]);

  // Load Orders
  const loadOrders = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (orderStatusFilter !== 'all') q.append('status', orderStatusFilter);
      if (orderSearch) q.append('search', orderSearch);

      const res = await adminFetch(`/api/admin/orders?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
        setOrdersTotal(data.total);
      }
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch, orderStatusFilter, orderSearch]);

  // Load Router Queue
  const loadRouterQueue = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/vouchers/disable-queue');
      const data = await res.json();
      if (data.success) setRouterQueue(data.queue);
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch]);

  // Load Plans
  const loadPlans = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/plans');
      const data = await res.json();
      if (data.success) setPlans(data.plans);
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch]);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) setSettings(data.settings);
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch]);

  // Load Audit
  const loadAudit = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/audit');
      const data = await res.json();
      if (data.success) setAuditLogs(data.logs);
    } catch (err) {
      console.error(err);
    }
  }, [adminFetch]);

  // Auto-refresh active tab data
  useEffect(() => {
    if (activeTab === 'stock') loadStock();
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'router_queue') loadRouterQueue();
    if (activeTab === 'plans') loadPlans();
    if (activeTab === 'settings') loadSettings();
    if (activeTab === 'audit') loadAudit();
  }, [activeTab, loadStock, loadOrders, loadRouterQueue, loadPlans, loadSettings, loadAudit]);

  // Release expired reservations
  const handleReleaseExpired = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/release-expired', { method: 'POST' });
      const data = await res.json();
      setStatusMessage({
        type: 'success',
        text: `Released ${data.released_count || 0} expired reservations back to inventory.`,
      });
      loadStock();
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to release expired reservations' });
    } finally {
      setLoading(false);
    }
  };

  // Process Refund
  const handleRefundOrder = async (orderId: string) => {
    const reason = window.prompt('Enter reason for refund:');
    if (!reason) return;

    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: 'Order refunded, voucher voided, and added to router disable queue.',
        });
        loadOrders();
        loadStock();
        loadRouterQueue();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Refund failed' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Error processing refund' });
    } finally {
      setLoading(false);
    }
  };

  // Mark disabled on router
  const handleMarkDisabledOnRouter = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/vouchers/disable-queue/${id}/done`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Marked voucher disabled on router.' });
        loadRouterQueue();
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Error updating queue' });
    }
  };

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<{
    total_rows: number;
    valid_count: number;
    duplicate_count: number;
    invalid_count: number;
    duplicates: string[];
    invalid_examples: string[];
    by_plan: Record<string, number>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parse CSV text to rows
  const parseCsvText = (text: string): { code: string; plan: string }[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const rows: { code: string; plan: string }[] = [];

    lines.forEach((line, index) => {
      // Skip header if line has 'code' or 'plan'
      if (index === 0 && (line.toLowerCase().includes('code') || line.toLowerCase().includes('plan'))) {
        return;
      }
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      if (parts.length >= 2) {
        rows.push({ code: parts[0], plan: parts[1].toLowerCase() });
      } else if (parts.length === 1 && parts[0]) {
        // Default to daily if not provided
        rows.push({ code: parts[0], plan: 'daily' });
      }
    });
    return rows;
  };

  // Handle CSV file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
      handlePreviewCsv(content);
    };
    reader.readAsText(file);
  };

  // Preview CSV
  const handlePreviewCsv = async (content = csvText) => {
    const rows = parseCsvText(content);
    if (rows.length === 0) {
      setStatusMessage({ type: 'error', text: 'No rows detected in CSV' });
      return;
    }
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/vouchers/preview', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (data.success) {
        setCsvPreview(data.preview);
        setStatusMessage(null);
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to preview CSV' });
    } finally {
      setLoading(false);
    }
  };

  // Commit CSV
  const handleCommitCsv = async () => {
    const rows = parseCsvText(csvText);
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/vouchers/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: `Successfully imported ${data.imported_count} vouchers!`,
        });
        setCsvText('');
        setCsvPreview(null);
        loadStock();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Import rejected: Duplicates or format errors found.',
        });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to commit import' });
    } finally {
      setLoading(false);
    }
  };

  // Safe Export CSV
  const handleExportCsv = async (planSlug = 'all') => {
    try {
      const res = await fetch(`/api/admin/vouchers/export?plan=${planSlug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lavami_vouchers_${planSlug}_${Date.now()}.csv`;
      a.click();
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to export vouchers' });
    }
  };

  // Update Plan Specs
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const handleSavePlan = async (plan: Plan) => {
    try {
      const res = await adminFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: plan.name,
          price: plan.price,
          data_allowance: plan.data_allowance,
          validity: plan.validity,
          active: plan.active,
          slug: plan.slug,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: `Plan ${plan.name} updated successfully!` });
        setEditingPlan(null);
        loadPlans();
        loadStock();
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to update plan' });
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({ type: 'success', text: 'Operational settings saved successfully!' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setLoading(false);
    }
  };

  // Format session minutes:seconds
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0]/40 text-[#2C1810]">
      {/* Top Admin Navigation Bar */}
      <header className="bg-[#6B2D17] text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F2A902] text-[#2C1810] flex items-center justify-center font-black text-sm">
              L
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-wide text-sm sm:text-base">
                  LAVAMI FASHION WIFI ADMIN
                </span>
                <span className="bg-[#F2A902]/20 text-[#F2A902] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#F2A902]/40">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-[#FFF8F0]/70">
                MikroTik Hotspot & Voucher Inventory Controller
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
            {/* 15-minute Inactivity Timer Badge */}
            <div
              className={`flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border ${
                secondsRemaining < 180
                  ? 'bg-red-500/20 text-red-200 border-red-400 animate-pulse'
                  : 'bg-white/10 text-[#FFF8F0] border-white/10'
              }`}
              title="Admin session expires after 15 minutes of inactivity"
            >
              <Clock className="w-3.5 h-3.5 text-[#F2A902]" />
              <span>Timeout: {formatTimer(secondsRemaining)}</span>
            </div>

            <button
              onClick={onBackToShop}
              className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              Public Shop
            </button>

            <button
              id="admin-logout-btn"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] px-3 py-1.5 rounded-lg transition-colors shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto scrollbar-none flex gap-1 border-t border-[#F2A902]/20">
          <button
            id="tab-stock-btn"
            onClick={() => setActiveTab('stock')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'stock'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Stock Intelligence</span>
          </button>

          <button
            id="tab-vouchers-btn"
            onClick={() => setActiveTab('vouchers')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'vouchers'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Voucher CSV Import</span>
          </button>

          <button
            id="tab-orders-btn"
            onClick={() => setActiveTab('orders')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Orders & Refunds</span>
          </button>

          <button
            id="tab-router-queue-btn"
            onClick={() => setActiveTab('router_queue')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'router_queue'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Disable on Router Queue</span>
            {routerQueue.filter((q) => !q.disabled_on_router).length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {routerQueue.filter((q) => !q.disabled_on_router).length}
              </span>
            )}
          </button>

          <button
            id="tab-plans-btn"
            onClick={() => setActiveTab('plans')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'plans'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>WiFi Plans & Pricing</span>
          </button>

          <button
            id="tab-settings-btn"
            onClick={() => setActiveTab('settings')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings & Secrets</span>
          </button>

          <button
            id="tab-audit-btn"
            onClick={() => setActiveTab('audit')}
            className={`py-2.5 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-[#F2A902] text-[#F2A902] bg-white/5'
                : 'border-transparent text-[#FFF8F0]/70 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Status Toast/Alert */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-red-50 text-red-900 border border-red-200'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-neutral-500 hover:text-neutral-900 font-bold ml-3"
            >
              ×
            </button>
          </div>
        )}

        {/* 1. STOCK INTELLIGENCE TAB */}
        {activeTab === 'stock' && stockReport && (
          <div className="space-y-6">
            {/* Top Critical Alerts */}
            {stockReport.paid_no_stock_count > 0 && (
              <div className="bg-red-50 border-2 border-red-400 p-4 rounded-2xl flex items-start gap-3 text-red-900 shadow-sm">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-black text-sm">
                    CRITICAL: {stockReport.paid_no_stock_count} Order(s) Paid Without Available Stock!
                  </h3>
                  <p className="text-xs mt-0.5 text-red-800">
                    Paystack confirmed payment, but no voucher could be assigned. Check Orders tab to resolve immediately.
                  </p>
                </div>
              </div>
            )}

            {/* Quick Intelligence Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Total Available Vouchers
                </div>
                <div className="text-3xl font-black text-[#2C1810] mt-1">
                  {stockReport.available_vouchers}
                </div>
                <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                  <span>{stockReport.stock_percentage}% of total stock</span>
                  <span>•</span>
                  <span>{stockReport.total_vouchers} total</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Total Revenue
                </div>
                <div className="text-3xl font-black text-[#6B2D17] mt-1">
                  GHS {stockReport.total_revenue_ghs}.00
                </div>
                <div className="text-xs text-emerald-700 font-semibold mt-1">
                  +GHS {stockReport.today_revenue_ghs}.00 today
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Fastest Selling Package
                </div>
                <div className="text-xl font-black text-[#2C1810] mt-2 truncate">
                  {stockReport.fastest_selling_package || 'No sales yet'}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  Nearly sold out: {stockReport.nearly_sold_out_package || 'None'}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Stuck Reservations (15m lock)
                  </div>
                  <div className="text-2xl font-black text-neutral-800 mt-1">
                    {stockReport.stuck_reservations_count} active
                  </div>
                </div>
                <button
                  id="release-expired-btn"
                  onClick={handleReleaseExpired}
                  disabled={loading}
                  className="mt-2 text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Release Expired Now</span>
                </button>
              </div>
            </div>

            {/* Package by Package Breakdown (Daily GHS 8, Weekly GHS 50, Monthly GHS 150) */}
            <div className="space-y-3">
              <h2 className="text-base font-extrabold text-[#2C1810]">
                Stock Breakdown by Package Profile
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {stockReport.packages.map((pkg) => (
                  <div
                    key={pkg.plan_slug}
                    className={`bg-white rounded-2xl p-5 border-2 shadow-xs space-y-4 ${
                      pkg.is_critical_stock
                        ? 'border-red-400 bg-red-50/20'
                        : pkg.is_low_stock
                        ? 'border-amber-300'
                        : 'border-neutral-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black text-lg text-[#2C1810]">{pkg.plan_name}</h3>
                        <div className="text-xs font-bold text-[#6B2D17]">
                          GHS {pkg.price}.00 • {pkg.plan_slug}
                        </div>
                      </div>

                      {pkg.is_critical_stock ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                          Critical ({pkg.available} left)
                        </span>
                      ) : pkg.is_low_stock ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          Low Stock
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Normal
                        </span>
                      )}
                    </div>

                    {/* Remaining Stock Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs font-bold text-neutral-600 mb-1">
                        <span>Available Stock:</span>
                        <span>
                          {pkg.available} / {pkg.total_imported} ({pkg.remaining_percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pkg.is_critical_stock
                              ? 'bg-red-500'
                              : pkg.is_low_stock
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(pkg.remaining_percentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Stock Numbers Table */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs py-2 bg-neutral-50 rounded-xl border border-neutral-100">
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase">Avail</div>
                        <div className="font-extrabold text-[#2C1810] text-sm">{pkg.available}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase">Locked</div>
                        <div className="font-extrabold text-amber-700 text-sm">{pkg.reserved}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase">Sold</div>
                        <div className="font-extrabold text-emerald-700 text-sm">{pkg.sold}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 font-bold uppercase">Void</div>
                        <div className="font-extrabold text-neutral-500 text-sm">{pkg.void}</div>
                      </div>
                    </div>

                    {/* Sales Performance */}
                    <div className="text-xs text-neutral-600 flex justify-between items-center pt-2 border-t border-neutral-100">
                      <span>Sales Today: <strong>{pkg.sales_today}</strong></span>
                      <span>Total Rev: <strong>GHS {pkg.sales_total_revenue}.00</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. VOUCHER CSV IMPORT TAB */}
        {activeTab === 'vouchers' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-[#2C1810]">Bulk Voucher Code Import</h2>
                  <p className="text-xs text-neutral-500">
                    Upload CSV or paste codes with plan slugs (e.g. <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded">daily</code>, <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded">weekly</code>, <code className="font-mono bg-neutral-100 px-1 py-0.5 rounded">monthly</code>). All-or-nothing atomic transaction.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="export-vouchers-btn"
                    onClick={() => handleExportCsv('all')}
                    className="inline-flex items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-[#6B2D17]" />
                    <span>Safe CSV Export</span>
                  </button>
                </div>
              </div>

              {/* Upload Input & Text Area */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 bg-[#6B2D17] hover:bg-[#4A1D0D] text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Select CSV File</span>
                  </button>
                  <span className="text-xs text-neutral-500">or paste CSV data below:</span>
                </div>

                <textarea
                  id="csv-textarea"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="code,plan
ABC12345,daily
XYZ98765,weekly
LVM44556,monthly"
                  rows={6}
                  className="w-full bg-white border border-neutral-300 rounded-2xl p-4 font-mono text-xs text-neutral-800 focus:outline-none focus:border-[#6B2D17]"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">
                    Max 5,000 rows • Code regex: <code className="font-mono">^[A-Z0-9]&#123;6,12&#125;$</code> • Automatic uppercase conversion
                  </span>

                  <button
                    id="preview-csv-btn"
                    onClick={() => handlePreviewCsv()}
                    disabled={loading || !csvText.trim()}
                    className="bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] px-4 py-2 rounded-xl text-xs font-extrabold shadow-xs transition-colors disabled:opacity-50"
                  >
                    Preview Import
                  </button>
                </div>
              </div>

              {/* Preview Results Table */}
              {csvPreview && (
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-3">
                    <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">
                      Validation Preview
                    </h3>
                    <div className="flex gap-3 text-xs font-bold">
                      <span className="text-emerald-700">Valid: {csvPreview.valid_count}</span>
                      <span className="text-amber-700">Duplicates: {csvPreview.duplicate_count}</span>
                      <span className="text-red-700">Invalid: {csvPreview.invalid_count}</span>
                    </div>
                  </div>

                  {/* Plan breakdown */}
                  <div className="flex gap-4 text-xs font-medium text-neutral-600">
                    {Object.entries(csvPreview.by_plan).map(([plan, count]) => (
                      <span key={plan}>
                        {plan}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>

                  {/* Errors / Warnings if any */}
                  {csvPreview.duplicates.length > 0 && (
                    <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-900 space-y-1">
                      <strong>Duplicate Codes Found (will block commit):</strong>
                      <div className="font-mono text-[11px]">{csvPreview.duplicates.join(', ')}</div>
                    </div>
                  )}

                  {csvPreview.invalid_examples.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-xl text-xs text-red-900 space-y-1">
                      <strong>Format / Plan Validation Errors:</strong>
                      <div className="text-[11px]">{csvPreview.invalid_examples.join(' | ')}</div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setCsvPreview(null)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200 transition-colors"
                    >
                      Cancel
                    </button>

                    <button
                      id="commit-import-btn"
                      onClick={handleCommitCsv}
                      disabled={loading || csvPreview.duplicate_count > 0 || csvPreview.invalid_count > 0}
                      className="px-5 py-2 rounded-xl text-xs font-extrabold bg-[#6B2D17] hover:bg-[#4A1D0D] text-white shadow-sm transition-colors disabled:opacity-40"
                    >
                      Commit {csvPreview.valid_count} Vouchers to Database
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. ORDERS & REFUNDS TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <Search className="w-4 h-4 text-neutral-400" />
                <input
                  id="order-search-input"
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Search by Paystack ref, contact, or order ID..."
                  className="w-full text-xs bg-transparent border-none focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  id="order-status-filter"
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="text-xs bg-neutral-50 border border-neutral-300 rounded-xl px-3 py-2 font-semibold text-neutral-800"
                >
                  <option value="all">All Statuses ({ordersTotal})</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="paid_no_stock">Paid No Stock</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                </select>

                <button
                  onClick={loadOrders}
                  className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-neutral-700 transition-colors"
                  aria-label="Refresh orders"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase tracking-wider border-b border-neutral-200">
                    <tr>
                      <th className="p-4">Order ID & Date</th>
                      <th className="p-4">Plan & Amount</th>
                      <th className="p-4">Contact</th>
                      <th className="p-4">Paystack Ref</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-neutral-400">
                          No orders found matching filters.
                        </td>
                      </tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id} className="hover:bg-neutral-50/70 transition-colors">
                          <td className="p-4">
                            <div className="font-mono font-bold text-neutral-800">{o.id}</div>
                            <div className="text-[10px] text-neutral-400">
                              {new Date(o.created_at).toLocaleString()}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-[#2C1810]">{o.plan_name}</div>
                            <div className="font-semibold text-[#6B2D17]">
                              GHS {o.amount_pesewas / 100}.00
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-neutral-800">
                              {o.contact_phone || o.contact_email || 'Guest'}
                            </div>
                          </td>
                          <td className="p-4">
                            <code className="font-mono text-[11px] text-neutral-600">
                              {o.paystack_ref}
                            </code>
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${
                                o.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : o.status === 'paid_no_stock'
                                  ? 'bg-red-100 text-red-800 border-red-300 animate-pulse'
                                  : o.status === 'pending'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : o.status === 'refunded'
                                  ? 'bg-neutral-100 text-neutral-600 border-neutral-300'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {o.status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            {o.status === 'paid' && (
                              <button
                                onClick={() => handleRefundOrder(o.id)}
                                className="text-xs font-bold text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition-colors"
                              >
                                Refund Order
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. DISABLE ON ROUTER QUEUE (Section 18) */}
        {activeTab === 'router_queue' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-[#2C1810]">
                  Router Disabling Queue (Refunded Vouchers)
                </h2>
                <p className="text-xs text-neutral-500">
                  When a customer refund is processed, the voucher is voided and queued here for an administrator to disable on the MikroTik router.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase tracking-wider border-b border-neutral-200">
                    <tr>
                      <th className="p-4">Voucher Code</th>
                      <th className="p-4">Plan</th>
                      <th className="p-4">Order ID</th>
                      <th className="p-4">Reason</th>
                      <th className="p-4">Refunded At</th>
                      <th className="p-4">State</th>
                      <th className="p-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {routerQueue.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-neutral-400">
                          Queue is clear. No vouchers pending router disabling.
                        </td>
                      </tr>
                    ) : (
                      routerQueue.map((q) => (
                        <tr key={q.id} className="hover:bg-neutral-50/70">
                          <td className="p-4 font-mono font-black text-sm text-[#6B2D17]">
                            {q.voucher_code}
                          </td>
                          <td className="p-4 font-semibold">{q.plan_slug}</td>
                          <td className="p-4 font-mono text-[11px] text-neutral-500">{q.order_id}</td>
                          <td className="p-4 text-neutral-700">{q.reason}</td>
                          <td className="p-4 text-neutral-500">
                            {new Date(q.refunded_at).toLocaleString()}
                          </td>
                          <td className="p-4">
                            {q.disabled_on_router ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Disabled</span>
                              </span>
                            ) : (
                              <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-full">
                                Pending Router Action
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            {!q.disabled_on_router && (
                              <button
                                onClick={() => handleMarkDisabledOnRouter(q.id)}
                                className="bg-[#6B2D17] hover:bg-[#4A1D0D] text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Mark Disabled
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 5. WIFI PLANS & PRICING TAB */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-[#2C1810]">Configurable WiFi Plans</h2>
                <p className="text-xs text-neutral-500">
                  Update plan pricing, data allowance, validity, and router profile slug. The browser always fetches authoritative pricing from the database.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {plans.map((p) => {
                  const isEditing = editingPlan?.id === p.id;
                  const current = isEditing ? editingPlan : p;

                  return (
                    <div
                      key={p.id}
                      className="border border-neutral-200 rounded-2xl p-5 space-y-3 bg-neutral-50/50"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-mono text-xs font-bold text-[#6B2D17] bg-amber-100 px-2 py-0.5 rounded">
                          {p.slug}
                        </span>
                        <button
                          onClick={() => setEditingPlan(isEditing ? null : { ...p })}
                          className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-semibold"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{isEditing ? 'Cancel' : 'Edit'}</span>
                        </button>
                      </div>

                      {isEditing ? (
                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="font-bold text-neutral-700 block mb-0.5">Plan Name</label>
                            <input
                              type="text"
                              value={current.name}
                              onChange={(e) =>
                                setEditingPlan({ ...current, name: e.target.value })
                              }
                              className="w-full bg-white border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="font-bold text-neutral-700 block mb-0.5">Price (GHS)</label>
                            <input
                              type="number"
                              value={current.price}
                              onChange={(e) =>
                                setEditingPlan({ ...current, price: Number(e.target.value) })
                              }
                              className="w-full bg-white border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="font-bold text-neutral-700 block mb-0.5">Data Allowance</label>
                            <input
                              type="text"
                              value={current.data_allowance}
                              onChange={(e) =>
                                setEditingPlan({ ...current, data_allowance: e.target.value })
                              }
                              className="w-full bg-white border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="font-bold text-neutral-700 block mb-0.5">Validity</label>
                            <input
                              type="text"
                              value={current.validity}
                              onChange={(e) =>
                                setEditingPlan({ ...current, validity: e.target.value })
                              }
                              className="w-full bg-white border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                            />
                          </div>

                          <button
                            onClick={() => handleSavePlan(current)}
                            className="w-full bg-[#6B2D17] hover:bg-[#4A1D0D] text-white py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Changes</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs">
                          <h3 className="text-base font-extrabold text-[#2C1810]">{p.name}</h3>
                          <div className="text-2xl font-black text-[#6B2D17]">GHS {p.price}.00</div>
                          <div className="text-neutral-600">Data: <strong>{p.data_allowance}</strong></div>
                          <div className="text-neutral-600">Validity: <strong>{p.validity}</strong></div>
                          <div className="text-neutral-600">Status: <strong className="text-emerald-700">Active</strong></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 6. SETTINGS & SECRETS TAB */}
        {activeTab === 'settings' && settings && (
          <div className="space-y-4">
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-6 max-w-2xl"
            >
              <div>
                <h2 className="text-lg font-black text-[#2C1810]">Operational Settings & Credentials</h2>
                <p className="text-xs text-neutral-500">
                  Update operational parameters without code changes. Sensitive secrets are protected and masked.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                {/* Router Login URL */}
                <div>
                  <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                    Authoritative MikroTik Login URL
                  </label>
                  <input
                    type="url"
                    value={settings.router_login_url}
                    onChange={(e) => setSettings({ ...settings, router_login_url: e.target.value })}
                    className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs font-mono"
                    required
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Customer &apos;?login=&apos; input host must strictly match this router host to prevent phishing portals.
                  </p>
                </div>

                {/* Stock Thresholds */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                      Low-Stock Warning (Default 50)
                    </label>
                    <input
                      type="number"
                      value={settings.low_stock_threshold}
                      onChange={(e) =>
                        setSettings({ ...settings, low_stock_threshold: Number(e.target.value) })
                      }
                      className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                      Shop Phone / Support
                    </label>
                    <input
                      type="text"
                      value={settings.shop_phone}
                      onChange={(e) => setSettings({ ...settings, shop_phone: e.target.value })}
                      className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs font-semibold"
                      required
                    />
                  </div>
                </div>

                {/* Notifications */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                      Alert Notification Email
                    </label>
                    <input
                      type="email"
                      value={settings.alert_email}
                      onChange={(e) => setSettings({ ...settings, alert_email: e.target.value })}
                      className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                      Alert Phone (SMS)
                    </label>
                    <input
                      type="text"
                      value={settings.alert_phone}
                      onChange={(e) => setSettings({ ...settings, alert_phone: e.target.value })}
                      className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs"
                      required
                    />
                  </div>
                </div>

                {/* Paystack Public & Secret */}
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#2C1810]">Paystack Configuration</span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-semibold">
                      Account in Test Review
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-600 block mb-0.5">Paystack Public Key</label>
                    <input
                      type="text"
                      value={settings.paystack_public_key || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, paystack_public_key: e.target.value })
                      }
                      placeholder="pk_test_..."
                      className="w-full bg-white border border-neutral-300 rounded-lg p-2 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-600 block mb-0.5">
                      Paystack Secret Key (Masked)
                    </label>
                    <input
                      type="password"
                      placeholder={settings.has_paystack_secret ? '••••••••••••••••••••••••' : 'sk_test_...'}
                      onChange={(e) =>
                        setSettings({ ...settings, paystack_secret_key: e.target.value } as AdminSettings)
                      }
                      className="w-full bg-white border border-neutral-300 rounded-lg p-2 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Lavami Fashion Ad Text */}
                <div>
                  <label className="font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
                    Lavami Fashion Advertisement Text (Kumasi IPT)
                  </label>
                  <textarea
                    rows={2}
                    value={settings.tailoring_advertisement}
                    onChange={(e) =>
                      setSettings({ ...settings, tailoring_advertisement: e.target.value })
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs font-medium"
                  />
                </div>

                <button
                  id="save-settings-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] py-3 rounded-xl font-extrabold text-xs shadow-sm transition-colors"
                >
                  Save Operational Configuration
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 7. AUDIT LOG TAB */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-[#2C1810]">Append-Only Audit Log</h2>
                <p className="text-xs text-neutral-500">
                  Cryptographically trackable, tamper-evident log of administrative actions, imports, refunds, and price changes.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase tracking-wider border-b border-neutral-200">
                    <tr>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4">Action</th>
                      <th className="p-4">Details</th>
                      <th className="p-4">Admin ID</th>
                      <th className="p-4">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-50/70">
                        <td className="p-4 text-[11px] text-neutral-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4 font-bold text-[#6B2D17]">{log.action}</td>
                        <td className="p-4 font-sans text-xs text-neutral-800">{log.details}</td>
                        <td className="p-4 text-[11px] text-neutral-600">{log.admin_id}</td>
                        <td className="p-4 text-[11px] text-neutral-500">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
