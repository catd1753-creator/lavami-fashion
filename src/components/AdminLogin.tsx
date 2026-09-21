import { useState, useEffect } from 'react';
import { ShieldCheck, Lock, User, KeyRound, Loader2, AlertCircle, ArrowLeft, Info } from 'lucide-react';
import { LavamiLogo } from './LavamiLogo.tsx';

interface AdminLoginProps {
  onSuccess: (token: string) => void;
  onBackToShop: () => void;
}

export function AdminLogin({ onSuccess, onBackToShop }: AdminLoginProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper info for evaluation/demo
  const [mfaHelper, setMfaHelper] = useState<{
    default_user: string;
    default_password: string;
    current_valid_code: string | null;
  } | null>(null);

  useEffect(() => {
    fetch('/api/admin/mfa-helper')
      .then((res) => res.json())
      .then((data) => {
        if (data.default_user) {
          setMfaHelper(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          totp_code: totpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('lavami_admin_token', data.token);
      onSuccess(data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or MFA code';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    if (mfaHelper) {
      setUsername(mfaHelper.default_user);
      setPassword(mfaHelper.default_password);
      if (mfaHelper.current_valid_code) {
        setTotpCode(mfaHelper.current_valid_code);
      }
    }
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4 space-y-6 animate-fade-in">
      <button
        onClick={onBackToShop}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B2D17] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Return to Public Shop</span>
      </button>

      <div className="bg-white rounded-3xl shadow-xl border border-neutral-200 p-6 sm:p-7 space-y-6">
        <div className="text-center space-y-1.5">
          <LavamiLogo variant="mark" size="sm" className="mb-2" />
          <h1 className="text-xl font-black text-[#2C1810]">WiFi Admin Portal</h1>
          <p className="text-xs text-neutral-500">
            Authorized Lavami administrators only. 2FA MFA verification required.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white border border-neutral-300 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-neutral-900 focus:outline-none focus:border-[#6B2D17]"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider block mb-1">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-neutral-300 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-neutral-900 focus:outline-none focus:border-[#6B2D17]"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider">
                6-Digit Authenticator / TOTP MFA
              </label>
              <span className="text-[10px] text-neutral-400 font-semibold">RFC 6238</span>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-mfa-input"
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                className="w-full bg-white border border-neutral-300 rounded-xl py-2.5 pl-10 pr-4 text-sm font-mono tracking-widest font-bold text-neutral-900 focus:outline-none focus:border-[#6B2D17]"
                required
              />
            </div>
          </div>

          <button
            id="admin-login-btn"
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-[#6B2D17] hover:bg-[#4A1D0D] text-white shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-[#F2A902]" />
                <span>Verify MFA & Sign In</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Helper Box */}
        {mfaHelper && (
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs space-y-2">
            <div className="flex items-center justify-between font-bold text-[#6B2D17]">
              <div className="flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#F2A902]" />
                <span>Default Admin Credentials:</span>
              </div>
              <button
                type="button"
                onClick={handleFillDemo}
                className="text-[11px] underline font-extrabold text-[#6B2D17]"
              >
                Auto-Fill
              </button>
            </div>
            <div className="text-[11px] text-neutral-700 space-y-0.5">
              <div>User: <code className="font-mono bg-white px-1 py-0.5 rounded">{mfaHelper.default_user}</code></div>
              <div>Password: <code className="font-mono bg-white px-1 py-0.5 rounded">{mfaHelper.default_password}</code></div>
              <div>Current TOTP: <code className="font-mono bg-white px-1 py-0.5 rounded font-bold text-[#6B2D17]">{mfaHelper.current_valid_code || 'Auto-generated'}</code></div>
            </div>
          </div>
        )}

        <div className="text-center text-[11px] text-neutral-400">
          Admin sessions automatically expire after 15 minutes of inactivity.
        </div>
      </div>
    </div>
  );
}
