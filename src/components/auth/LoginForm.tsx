import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Branch } from '../../types';
import { SaccoLogo } from '../common/SaccoLogo';
import { RefreshCw } from 'lucide-react';

interface LoginFormProps {
  onOpenSetupAdmin?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onOpenSetupAdmin }) => {
  const { login } = useAuth();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isBranchLocked, setIsBranchLocked] = useState<boolean>(false);
  const [branchHelpText, setBranchHelpText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasCheckedBranches, setHasCheckedBranches] = useState<boolean>(false);
  const [showDevProfiles, setShowDevProfiles] = useState<boolean>(false);

  // Helper to ensure Kamubeizi is first/top in the branch dropdown where required
  const orderBranches = (branches: Branch[]): Branch[] => {
    const kamubeizi = branches.find(b => b.code === 'KAMUBEIZI' || b.name.toLowerCase().includes('kamubeizi'));
    if (!kamubeizi) return branches;
    return [kamubeizi, ...branches.filter(b => b.id !== kamubeizi.id)];
  };

  // Load branches
  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await apiClient.getBranches();
        if (res.success && res.data.length > 0) {
          const ordered = orderBranches(res.data);
          setAllBranches(ordered);
          setFilteredBranches(ordered);
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      } finally {
        setHasCheckedBranches(true);
      }
    }
    loadBranches();
  }, []);

  // When username changes, check branch restrictions (single branch vs multi branch)
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (clean.length >= 4 && clean.length <= 6) {
      apiClient.getUserBranches(clean).then(res => {
        if (res.found) {
          if (!res.hasMultiBranchAccess && res.primaryBranchId) {
            // Normal single branch user: See assigned branch, locked
            setIsBranchLocked(true);
            setSelectedBranchId(res.primaryBranchId);
            setBranchHelpText(`Assigned Branch: ${res.primaryBranchName}`);
            const matched = allBranches.filter(b => b.id === res.primaryBranchId);
            setFilteredBranches(matched.length > 0 ? matched : allBranches);
          } else if (res.hasMultiBranchAccess && res.allowedBranches.length > 0) {
            // Multi-branch user: Can select from assigned branches
            setIsBranchLocked(false);
            setFilteredBranches(res.allowedBranches);
            setBranchHelpText(`Multi-branch access (${res.allowedBranches.length} branches)`);
            if (!res.allowedBranches.some(b => b.id === selectedBranchId)) {
              setSelectedBranchId(res.allowedBranches[0]?.id || '');
            }
          }
        } else {
          setIsBranchLocked(false);
          setFilteredBranches(allBranches);
          setBranchHelpText('');
        }
      }).catch(() => {
        setIsBranchLocked(false);
        setFilteredBranches(allBranches);
      });
    } else {
      setIsBranchLocked(false);
      setFilteredBranches(allBranches);
      setBranchHelpText('');
    }
  }, [username, allBranches, selectedBranchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Username validation: Min 4, max 10 characters
    if (username.trim().length < 4 || username.trim().length > 10) {
      setErrorMessage('Username must be between 4 and 10 characters.');
      return;
    }

    if (!selectedBranchId) {
      setErrorMessage('Please select your branch.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(selectedBranchId, username.trim(), password);
      if (!result.success) {
        setErrorMessage(result.message || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedFill = (seedUsername: string, seedBranchCode: string, seedPass: string) => {
    setUsername(seedUsername);
    setPassword(seedPass);
    const targetBranch = allBranches.find(b => b.code === seedBranchCode);
    if (targetBranch) {
      setSelectedBranchId(targetBranch.id);
    }
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen w-full bg-[#f4f6f8] flex flex-col items-center justify-center p-4 sm:p-6">
      {/* REFINED MODERATE LOGIN CARD: ~420px max width, balanced padding, crisp visual balance */}
      <div className="w-full max-w-[420px] bg-white rounded-[16px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 px-6 py-8 sm:px-9 sm:py-9 flex flex-col items-center">
        
        {/* SACCO LOGO: Moderate 64px size, centered with balanced margin */}
        <div className="mb-4 flex justify-center">
          <SaccoLogo size="lg" className="justify-center" />
        </div>

        {/* TITLE: Exactly "TURIHAMWE" in dark navy, moderate 20px typography */}
        <h1 className="text-[20px] font-semibold text-[#0f2744] text-center tracking-tight mb-6">
          TURIHAMWE
        </h1>

        {/* Error message banner */}
        {errorMessage && (
          <div className="w-full mb-5 p-2.5 rounded-[8px] bg-red-50 border border-red-200 text-red-700 text-xs text-center font-medium leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          
          {/* BRANCH: Centered label, full width selector, moderate 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="branch"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Branch
            </label>
            <div className="relative w-full">
              <select
                id="branch"
                value={selectedBranchId}
                disabled={isBranchLocked || !hasCheckedBranches}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                required
                className={`w-full h-[44px] px-3.5 pr-9 bg-[#f4f5f7] border border-slate-200 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent appearance-none transition-colors ${
                  isBranchLocked ? 'cursor-not-allowed opacity-85' : 'cursor-pointer'
                }`}
              >
                <option value="" disabled>
                  Select branch
                </option>
                {filteredBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              {/* Dropdown chevron on the right */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
            {branchHelpText && (
              <p className="mt-1 text-center text-[11px] text-slate-500">
                {branchHelpText}
              </p>
            )}
          </div>

          {/* USERNAME: Centered label, full width input, moderate 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="username"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              minLength={4}
              maxLength={10}
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
              }
              autoComplete="username"
              required
              className="w-full h-[44px] px-3.5 bg-[#f4f5f7] border border-slate-200 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
            />
          </div>

          {/* PASSWORD: Centered label, full width masked input, moderate 44px height, rounded-[8px] */}
          <div>
            <label
              htmlFor="password"
              className="block text-center text-xs font-medium text-slate-700 uppercase tracking-wider mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-[44px] px-3.5 bg-[#f4f5f7] border border-slate-200 rounded-[8px] text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-colors"
            />
          </div>

          {/* LOGIN BUTTON: Centered, primary blue, moderate 84px wide, 42px high, rounded-[10px] */}
          <div className="pt-2 flex justify-center">
            <button
              type="submit"
              disabled={isLoading}
              className="w-[84px] h-[42px] bg-[#1a44b8] hover:bg-[#153896] text-white font-medium text-sm rounded-[10px] flex items-center justify-center transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                'Login'
              )}
            </button>
          </div>
        </form>

        {/* HELP MESSAGE: Centered, medium slate-gray, moderate 14px size, comfortable spacing */}
        <p className="mt-6 text-center text-[14px] text-[#556987] leading-relaxed max-w-[320px]">
          Cannot sign in? Contact an authorised administrator.
        </p>
      </div>

      {/* Discrete development & test helper (outside card) */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setShowDevProfiles(!showDevProfiles)}
          className="text-[11px] text-slate-400 hover:text-slate-600 transition"
        >
          {showDevProfiles ? 'Hide Test Profiles' : 'Show Test Profiles'}
        </button>

        {showDevProfiles && (
          <div className="mt-2.5 p-3.5 bg-white/90 backdrop-blur-xs rounded-xl border border-slate-200 max-w-[420px] mx-auto text-left shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-700">Pre-Configured Test Profiles</span>
              {onOpenSetupAdmin && (
                <button
                  type="button"
                  onClick={onOpenSetupAdmin}
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  Setup Admin
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => handleSeedFill('itadm', 'NYAMUYANJA', 'Admin@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">itadm</div>
                <div className="text-[9px] text-slate-500">IT Officer (Multi)</div>
              </button>
              <button
                type="button"
                onClick={() => handleSeedFill('gm001', 'NYAMUYANJA', 'Gm@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">gm001</div>
                <div className="text-[9px] text-slate-500">General Manager</div>
              </button>
              <button
                type="button"
                onClick={() => handleSeedFill('bmnya', 'NYAMUYANJA', 'Pass@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">bmnya</div>
                <div className="text-[9px] text-slate-500">Branch Mgr</div>
              </button>
              <button
                type="button"
                onClick={() => handleSeedFill('csh01', 'NYAMUYANJA', 'Pass@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">csh01</div>
                <div className="text-[9px] text-slate-500">Cashier</div>
              </button>
              <button
                type="button"
                onClick={() => handleSeedFill('acct1', 'NYAMUYANJA', 'Pass@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">acct1</div>
                <div className="text-[9px] text-slate-500">Accounts Asst</div>
              </button>
              <button
                type="button"
                onClick={() => handleSeedFill('audit', 'NYAMUYANJA', 'Pass@2026!')}
                className="text-left p-1.5 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 transition"
              >
                <div className="font-semibold text-blue-800">audit</div>
                <div className="text-[9px] text-slate-500">Internal Auditor</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
