import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import {
  TurihamwePlan,
  Contribution,
  Renewal,
  ExpiryRecord,
  ExpiryAlertCategory,
  Beneficiary,
  PlanReactivationLog
} from '../types';
import { LocalRepository } from '../db/local/localRepository';
import { localDb } from '../db/local/sqliteEngine';
import {
  ShieldCheck,
  Users,
  Clock,
  AlertCircle,
  PlusCircle,
  FileCheck,
  History,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  DollarSign,
  Search,
  Filter,
  Printer,
  RefreshCw,
  Edit3,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
  Lock
} from 'lucide-react';

import { RecordContributionModal } from '../components/turihamwe/RecordContributionModal';
import { ContributionReceiptModal } from '../components/turihamwe/ContributionReceiptModal';
import { CorrectContributionModal } from '../components/turihamwe/CorrectContributionModal';
import { RecordRenewalModal } from '../components/turihamwe/RecordRenewalModal';
import { ReactivatePlanModal } from '../components/turihamwe/ReactivatePlanModal';
import { notifyRecordChanged, subscribeToRecordChanges } from '../utils/systemEvents';
import { BusinessRulesModal } from '../components/turihamwe/BusinessRulesModal';
import { RegisterPlanModal } from '../components/turihamwe/RegisterPlanModal';

export const TurihamweView: React.FC = () => {
  const { user, workingBranch, hasPermission } = useAuth();
  const { syncState } = useSync();

  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'contributions' | 'renewals' | 'expiry' | 'plans' | 'beneficiaries' | 'history'
  >('overview');

  // Permission Checks
  const canRegisterPlan = hasPermission('turihamwe.register_plan');
  const canManageBeneficiaries = hasPermission('turihamwe.manage_beneficiaries');
  const canViewContributions = hasPermission('turihamwe.view_contributions') || hasPermission('transactions.view');
  const canRecordContribution = hasPermission('turihamwe.record_contribution') || hasPermission('transactions.record');
  const canEditContribution = hasPermission('transactions.edit') || hasPermission('turihamwe.record_contribution');
  const canPrintReceipt = hasPermission('transactions.print_receipts') || canRecordContribution;
  const canViewRenewals = hasPermission('turihamwe.view_renewals');
  const canRecordRenewal = hasPermission('turihamwe.record_renewal');
  const canViewExpiry = hasPermission('turihamwe.view_expiry');
  const canReactivate = hasPermission('turihamwe.reactivate_plan');
  const canViewHistory = hasPermission('turihamwe.view_history');
  const canViewFinancial = hasPermission('reports.view_financial') ||
    user?.roleId === 'role-gm' ||
    user?.roleId === 'role-auditor';

  // Data States
  const [plans, setPlans] = useState<TurihamwePlan[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [expiryRecords, setExpiryRecords] = useState<ExpiryRecord[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [reactivations, setReactivations] = useState<PlanReactivationLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters (RULE: Search strictly by SACCO account number & Member name)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [expiryCategoryFilter, setExpiryCategoryFilter] = useState<string>('ALL');
  const [dateRangeStart, setDateRangeStart] = useState<string>('');
  const [dateRangeEnd, setDateRangeEnd] = useState<string>('');

  // Modals
  const [isRecordContribOpen, setIsRecordContribOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [selectedContributionForReceipt, setSelectedContributionForReceipt] = useState<Contribution | null>(null);

  const [isCorrectContribOpen, setIsCorrectContribOpen] = useState(false);
  const [selectedContributionForCorrection, setSelectedContributionForCorrection] = useState<Contribution | null>(null);

  const [isRecordRenewalOpen, setIsRecordRenewalOpen] = useState(false);
  const [selectedPlanForRenewal, setSelectedPlanForRenewal] = useState<TurihamwePlan | null>(null);

  const [isReactivateOpen, setIsReactivateOpen] = useState(false);
  const [selectedPlanForReactivation, setSelectedPlanForReactivation] = useState<TurihamwePlan | null>(null);

  const [isRegisterPlanOpen, setIsRegisterPlanOpen] = useState(false);
  const [isBusinessRulesOpen, setIsBusinessRulesOpen] = useState(false);

  // Load Data
  const loadTurihamweData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('turihamwe_token');

    try {
      // 1. Fetch Plans
      const plansRes = await fetch(`/api/turihamwe/plans${selectedBranch ? `?branchId=${selectedBranch}` : ''}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
      });
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data);
        // Cache to local db
        for (const p of data) {
          await LocalRepository.savePlanLocally(p);
        }
      } else {
        // Fallback to local
        const localPlans = await LocalRepository.searchPlans('');
        setPlans(localPlans);
      }

      // 2. Fetch Contributions
      if (canViewContributions) {
        const contribRes = await fetch(`/api/turihamwe/contributions${selectedBranch ? `?branchId=${selectedBranch}` : ''}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (contribRes.ok) {
          const cData = await contribRes.json();
          setContributions(cData);
        } else {
          const localContribs = await localDb.contributions.toArray();
          setContributions(localContribs);
        }
      }

      // 3. Fetch Renewals
      if (canViewRenewals) {
        const renewRes = await fetch(`/api/turihamwe/renewals${selectedBranch ? `?branchId=${selectedBranch}` : ''}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (renewRes.ok) {
          const rData = await renewRes.json();
          setRenewals(rData);
        } else {
          const localRenewals = await localDb.renewals.toArray();
          setRenewals(localRenewals);
        }
      }

      // 4. Fetch Expiries
      if (canViewExpiry) {
        const expRes = await fetch(`/api/turihamwe/expiry${selectedBranch ? `?branchId=${selectedBranch}` : ''}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (expRes.ok) {
          const expData = await expRes.json();
          setExpiryRecords(expData);
        }
      }
    } catch {
      // Offline fallback
      const localPlans = await LocalRepository.searchPlans('');
      setPlans(localPlans);
      const localContribs = await localDb.contributions.toArray();
      setContributions(localContribs);
      const localRenewals = await localDb.renewals.toArray();
      setRenewals(localRenewals);
    } finally {
      setLoading(false);
    }
  }, [workingBranch, selectedBranch, canViewContributions, canViewRenewals, canViewExpiry]);

  useEffect(() => {
    loadTurihamweData();
  }, [loadTurihamweData]);

  // Subscribe to system-wide record changes so edits to members, plans, contributions, or renewals reflect immediately
  useEffect(() => {
    const unsubscribe = subscribeToRecordChanges((event) => {
      if (['MEMBER', 'PLAN', 'CONTRIBUTION', 'RENEWAL', 'BUSINESS_RULES'].includes(event.entityType)) {
        loadTurihamweData();
      }
    });
    return unsubscribe;
  }, [loadTurihamweData]);

  // Derived Summary Figures
  const totalActivePlans = plans.filter(p => p.status === 'ACTIVE').length;
  const totalContributionsAmount = canViewFinancial
    ? contributions.reduce((sum, c) => sum + (c.amount || 0), 0)
    : null;
  const expiringPlans30Days = expiryRecords.filter(r => r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).length;
  const expiredPlans = expiryRecords.filter(r => r.daysUntilExpiry < 0 || r.planStatus === 'EXPIRED').length;
  const pendingReactivations = plans.filter(p => p.status === 'REACTIVATION_PENDING').length;

  // Filtered Contributions (RULE: Search strictly by SACCO account number and Member name)
  const filteredContributions = contributions.filter(c => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchAcc = c.saccoAccountNumber.toLowerCase().includes(q);
      const matchName = c.memberName.toLowerCase().includes(q);
      if (!matchAcc && !matchName) return false;
    }
    if (selectedBranch && c.branchId !== selectedBranch) return false;
    if (selectedStatus && c.status !== selectedStatus) return false;
    if (dateRangeStart && c.contributionDate < dateRangeStart) return false;
    if (dateRangeEnd && c.contributionDate > dateRangeEnd) return false;
    return true;
  });

  // Filtered Renewals (RULE: Search strictly by SACCO account number and Member name)
  const filteredRenewals = renewals.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchAcc = r.saccoAccountNumber.toLowerCase().includes(q);
      const matchName = r.memberName.toLowerCase().includes(q);
      if (!matchAcc && !matchName) return false;
    }
    if (selectedBranch && r.branchId !== selectedBranch) return false;
    if (dateRangeStart && r.renewalDate < dateRangeStart) return false;
    if (dateRangeEnd && r.renewalDate > dateRangeEnd) return false;
    return true;
  });

  // Filtered Expiry Records
  const filteredExpiryRecords = expiryRecords.filter(e => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchAcc = e.saccoAccountNumber.toLowerCase().includes(q);
      const matchName = e.memberName.toLowerCase().includes(q);
      if (!matchAcc && !matchName) return false;
    }
    if (selectedBranch && e.branchId !== selectedBranch) return false;
    if (expiryCategoryFilter !== 'ALL' && e.alertCategory !== expiryCategoryFilter) return false;
    if (dateRangeStart && e.currentExpiryDate < dateRangeStart) return false;
    if (dateRangeEnd && e.currentExpiryDate > dateRangeEnd) return false;
    return true;
  });

  // Filtered Plans
  const filteredPlans = plans.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const matchAcc = p.saccoAccountNumber.toLowerCase().includes(q);
      const matchName = p.memberName.toLowerCase().includes(q);
      if (!matchAcc && !matchName) return false;
    }
    if (selectedBranch && p.registeredBranchId !== selectedBranch) return false;
    if (selectedStatus && p.status !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-700" />
            <h1 className="text-xl font-bold text-slate-900">
              Turihamwe Insurance Management
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
              Phase 4 Core
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Nyamuyanja SACCO Life Protection • Contributions, Renewals & Expiry Lifecycle Engine
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsBusinessRulesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-700" />
            Configurable Rules
          </button>

          {canRecordContribution && (
            <button
              onClick={() => setIsRecordContribOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition"
            >
              <DollarSign className="w-4 h-4" />
              Record Contribution
            </button>
          )}

          {canRegisterPlan && (
            <button
              onClick={() => setIsRegisterPlanOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs transition"
            >
              <PlusCircle className="w-4 h-4" />
              Register Plan
            </button>
          )}
        </div>
      </div>

      {/* Institutional Architecture Notice regarding pending rules */}
      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold">Institutional Governance Architecture:</strong> Exact contribution formulas, payment frequencies, renewal cover periods, and grace penalties remain configurable modular parameters without hardcoded assumptions. Every record is strictly linked to an existing SACCO member and account.
          </div>
        </div>
        <button
          onClick={() => setIsBusinessRulesOpen(true)}
          className="text-[11px] font-bold text-blue-700 hover:underline whitespace-nowrap shrink-0"
        >
          View Parameters &rarr;
        </button>
      </div>

      {/* Primary KPI Metrics Bar (Permission-controlled) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Plans */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Active Cover Plans</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalActivePlans}</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            Enrolled SACCO members
          </div>
        </div>

        {/* Contributions Count & Financial Total */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Contributions Logged</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{contributions.length} Records</div>
          <div className="text-[11px] text-slate-600 mt-1">
            {canViewFinancial && totalContributionsAmount !== null ? (
              <span className="font-mono font-bold text-blue-950">
                UGX {totalContributionsAmount.toLocaleString()} total
              </span>
            ) : (
              <span className="text-slate-400 italic flex items-center gap-1">
                <Lock className="w-3 h-3" /> Financial total restricted
              </span>
            )}
          </div>
        </div>

        {/* Expiring Plans (Next 30 Days) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Expiring (30 Days)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-800">{expiringPlans30Days}</div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1">
            Upcoming renewals scheduled
          </div>
        </div>

        {/* Expired / Reactivation Pending */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Expired Policies</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-700">{expiredPlans}</div>
          <div className="text-[11px] text-red-600 font-semibold mt-1">
            Controlled reactivation available
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs">
        <nav className="flex space-x-6 overflow-x-auto text-xs font-semibold py-2">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`py-2 border-b-2 transition whitespace-nowrap ${
              activeSubTab === 'overview'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Overview
          </button>
          {canViewContributions && (
            <button
              onClick={() => setActiveSubTab('contributions')}
              className={`py-2 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'contributions'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Contributions ({contributions.length})
            </button>
          )}
          {canViewRenewals && (
            <button
              onClick={() => setActiveSubTab('renewals')}
              className={`py-2 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'renewals'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Renewals ({renewals.length})
            </button>
          )}
          {canViewExpiry && (
            <button
              onClick={() => setActiveSubTab('expiry')}
              className={`py-2 border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'expiry'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Expiry & Alerts ({expiryRecords.length})
            </button>
          )}
          <button
            onClick={() => setActiveSubTab('plans')}
            className={`py-2 border-b-2 transition whitespace-nowrap ${
              activeSubTab === 'plans'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Registered Plans ({plans.length})
          </button>
          {canManageBeneficiaries && (
            <button
              onClick={() => setActiveSubTab('beneficiaries')}
              className={`py-2 border-b-2 transition whitespace-nowrap ${
                activeSubTab === 'beneficiaries'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Beneficiaries
            </button>
          )}
          {canViewHistory && (
            <button
              onClick={() => setActiveSubTab('history')}
              className={`py-2 border-b-2 transition whitespace-nowrap ${
                activeSubTab === 'history'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Policy History
            </button>
          )}
        </nav>
      </div>

      {/* Search & Filter Toolbar (STRICT SEARCH RULE: SACCO Account Number & Member Name ONLY) */}
      {activeSubTab !== 'overview' && activeSubTab !== 'history' && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by SACCO A/C or Member Name..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Date Range Start */}
            <input
              type="date"
              value={dateRangeStart}
              onChange={e => setDateRangeStart(e.target.value)}
              title="From date"
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={dateRangeEnd}
              onChange={e => setDateRangeEnd(e.target.value)}
              title="To date"
              className="px-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />

            {(dateRangeStart || dateRangeEnd || searchQuery || selectedStatus || expiryCategoryFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setDateRangeStart('');
                  setDateRangeEnd('');
                  setSelectedStatus('');
                  setExpiryCategoryFilter('ALL');
                }}
                className="text-xs text-blue-700 hover:underline font-semibold ml-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 1: OVERVIEW DASHBOARD
         ======================================================== */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Contributions Preview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-700" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Recent Contribution Records
                  </span>
                </div>
                {canViewContributions && (
                  <button
                    onClick={() => setActiveSubTab('contributions')}
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    View All &rarr;
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="px-4 py-2.5">Receipt Ref</th>
                      <th className="px-4 py-2.5">SACCO A/C</th>
                      <th className="px-4 py-2.5">Member Name</th>
                      <th className="px-4 py-2.5">Amount (UGX)</th>
                      <th className="px-4 py-2.5 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {contributions.slice(0, 5).map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-bold text-blue-900">{c.receiptNumber}</td>
                        <td className="px-4 py-2.5 font-mono">{c.saccoAccountNumber}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{c.memberName}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-900">
                          {c.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedContributionForReceipt(c);
                              setIsReceiptOpen(true);
                            }}
                            className="p-1 text-slate-500 hover:text-blue-700 rounded transition"
                            title="Print receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {contributions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          No contribution records recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upcoming Policy Expirations Preview */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Upcoming Expiries & Action Queue
                  </span>
                </div>
                {canViewExpiry && (
                  <button
                    onClick={() => setActiveSubTab('expiry')}
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    Manage Expiries &rarr;
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="px-4 py-2.5">SACCO A/C</th>
                      <th className="px-4 py-2.5">Member Name</th>
                      <th className="px-4 py-2.5">Expiry Date</th>
                      <th className="px-4 py-2.5">Alert Window</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {expiryRecords.slice(0, 5).map(e => (
                      <tr key={e.planId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-bold text-blue-900">{e.saccoAccountNumber}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{e.memberName}</td>
                        <td className="px-4 py-2.5 font-mono">{e.currentExpiryDate}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            e.daysUntilExpiry < 0
                              ? 'bg-red-100 text-red-800'
                              : e.daysUntilExpiry <= 7
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {e.daysUntilExpiry < 0
                              ? `${Math.abs(e.daysUntilExpiry)}d Overdue`
                              : `${e.daysUntilExpiry}d remaining`}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canRecordRenewal && (
                            <button
                              onClick={() => {
                                const targetPlan = plans.find(p => p.id === e.planId);
                                if (targetPlan) {
                                  setSelectedPlanForRenewal(targetPlan);
                                  setIsRecordRenewalOpen(true);
                                }
                              }}
                              className="text-blue-700 hover:underline font-bold text-[11px]"
                            >
                              Renew
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {expiryRecords.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          No pending expirations.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 2: CONTRIBUTIONS MODULE
         ======================================================== */}
      {activeSubTab === 'contributions' && canViewContributions && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase">
                Turihamwe Contributions Ledger
              </h2>
              <p className="text-xs text-slate-500">
                Independent Premium Data Capture • Member & Plan Direct Linkage
              </p>
            </div>
            {canRecordContribution && (
              <button
                onClick={() => setIsRecordContribOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Record Contribution
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                <tr>
                  <th className="px-6 py-3">Receipt Ref</th>
                  <th className="px-6 py-3">SACCO A/C</th>
                  <th className="px-6 py-3">Member Name</th>
                  <th className="px-6 py-3">Plan ID</th>
                  <th className="px-6 py-3">Amount (UGX)</th>
                  <th className="px-6 py-3">Payment Channel</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredContributions.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-mono font-bold text-blue-900">{c.receiptNumber}</td>
                    <td className="px-6 py-3 font-mono font-semibold">{c.saccoAccountNumber}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{c.memberName}</td>
                    <td className="px-6 py-3 font-mono text-slate-600">{c.planId}</td>
                    <td className="px-6 py-3 font-mono font-bold text-slate-900">
                      {c.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 uppercase text-[11px] font-semibold text-slate-600">
                      {c.paymentMethod.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-3 font-mono">{c.contributionDate}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.status === 'CONFIRMED'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : c.status === 'CORRECTED'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canPrintReceipt && (
                          <button
                            onClick={() => {
                              setSelectedContributionForReceipt(c);
                              setIsReceiptOpen(true);
                            }}
                            className="p-1 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded transition"
                            title="Print Official Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEditContribution && (
                          <button
                            onClick={() => {
                              setSelectedContributionForCorrection(c);
                              setIsCorrectContribOpen(true);
                            }}
                            className="p-1 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded transition"
                            title="Audited Correction"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContributions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-slate-400">
                      No contribution records match the specified filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 3: RENEWALS MODULE
         ======================================================== */}
      {activeSubTab === 'renewals' && canViewRenewals && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase">
                Turihamwe Policy Renewals Directory
              </h2>
              <p className="text-xs text-slate-500">
                Audited Policy Term Extensions • Previous State vs Resulting State
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                <tr>
                  <th className="px-6 py-3">Renewal Ref</th>
                  <th className="px-6 py-3">SACCO A/C</th>
                  <th className="px-6 py-3">Member Name</th>
                  <th className="px-6 py-3">Renewal Date</th>
                  <th className="px-6 py-3">Previous Expiry</th>
                  <th className="px-6 py-3">New Expiry</th>
                  <th className="px-6 py-3">Officer</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRenewals.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-mono font-bold text-blue-900">{r.renewalReference}</td>
                    <td className="px-6 py-3 font-mono font-semibold">{r.saccoAccountNumber}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{r.memberName}</td>
                    <td className="px-6 py-3 font-mono">{r.renewalDate}</td>
                    <td className="px-6 py-3 font-mono text-slate-500">{r.previousExpiryDate}</td>
                    <td className="px-6 py-3 font-mono font-bold text-emerald-800">{r.newExpiryDate}</td>
                    <td className="px-6 py-3 font-mono text-[11px] text-slate-600">{r.processedByUsername}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {r.renewalStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredRenewals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                      No policy renewal records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 4: EXPIRY MANAGEMENT & ALERTS
         ======================================================== */}
      {activeSubTab === 'expiry' && canViewExpiry && (
        <div className="space-y-4">
          {/* Alert Category Quick Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <button
              onClick={() => setExpiryCategoryFilter('ALL')}
              className={`p-3 rounded-lg border text-left transition ${
                expiryCategoryFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="font-bold">All Categories</div>
              <div className="text-[11px] opacity-80 mt-0.5">{expiryRecords.length} Total Policies</div>
            </button>

            <button
              onClick={() => setExpiryCategoryFilter('EXPIRING_30_DAYS')}
              className={`p-3 rounded-lg border text-left transition ${
                expiryCategoryFilter === 'EXPIRING_30_DAYS'
                  ? 'bg-blue-800 text-white border-blue-800'
                  : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
              }`}
            >
              <div className="font-bold">30 Days Before Expiry</div>
              <div className="text-[11px] opacity-80 mt-0.5">Early Notice Window</div>
            </button>

            <button
              onClick={() => setExpiryCategoryFilter('EXPIRING_14_DAYS')}
              className={`p-3 rounded-lg border text-left transition ${
                expiryCategoryFilter === 'EXPIRING_14_DAYS'
                  ? 'bg-amber-800 text-white border-amber-800'
                  : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <div className="font-bold">14 Days Before Expiry</div>
              <div className="text-[11px] opacity-80 mt-0.5">Second Notice Phase</div>
            </button>

            <button
              onClick={() => setExpiryCategoryFilter('EXPIRING_7_DAYS')}
              className={`p-3 rounded-lg border text-left transition ${
                expiryCategoryFilter === 'EXPIRING_7_DAYS'
                  ? 'bg-orange-800 text-white border-orange-800'
                  : 'bg-orange-50 text-orange-900 border-orange-200 hover:bg-orange-100'
              }`}
            >
              <div className="font-bold">7 Days Before Expiry</div>
              <div className="text-[11px] opacity-80 mt-0.5">Urgent Renewal Follow-up</div>
            </button>

            <button
              onClick={() => setExpiryCategoryFilter('POST_EXPIRY_FOLLOW_UP')}
              className={`p-3 rounded-lg border text-left transition ${
                expiryCategoryFilter === 'POST_EXPIRY_FOLLOW_UP'
                  ? 'bg-red-800 text-white border-red-800'
                  : 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100'
              }`}
            >
              <div className="font-bold">Post-Expiry / Lapsed</div>
              <div className="text-[11px] opacity-80 mt-0.5">Reactivation Required</div>
            </button>
          </div>

          {/* Expiry Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Expiry Monitoring Ledger
                </h3>
                <p className="text-xs text-slate-500">
                  Showing {filteredExpiryRecords.length} policies matching criteria
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                  <tr>
                    <th className="px-6 py-3">SACCO A/C</th>
                    <th className="px-6 py-3">Member Name</th>
                    <th className="px-6 py-3">Branch</th>
                    <th className="px-6 py-3">Current Expiry</th>
                    <th className="px-6 py-3">Days Until Expiry</th>
                    <th className="px-6 py-3">Alert Window</th>
                    <th className="px-6 py-3 text-right">Controlled Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredExpiryRecords.map(e => {
                    const linkedPlan = plans.find(p => p.id === e.planId);
                    return (
                      <tr key={e.planId} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-mono font-bold text-blue-900">{e.saccoAccountNumber}</td>
                        <td className="px-6 py-3 font-bold text-slate-900">{e.memberName}</td>
                        <td className="px-6 py-3">{e.branchName}</td>
                        <td className="px-6 py-3 font-mono font-semibold">{e.currentExpiryDate}</td>
                        <td className="px-6 py-3">
                          <span className={`font-mono font-bold ${
                            e.daysUntilExpiry < 0
                              ? 'text-red-700'
                              : e.daysUntilExpiry <= 7
                              ? 'text-orange-700'
                              : 'text-amber-800'
                          }`}>
                            {e.daysUntilExpiry < 0 ? `${Math.abs(e.daysUntilExpiry)} days past` : `${e.daysUntilExpiry} days`}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            e.alertCategory === 'POST_EXPIRY_FOLLOW_UP'
                              ? 'bg-red-100 text-red-900'
                              : e.alertCategory === 'EXPIRING_7_DAYS'
                              ? 'bg-orange-100 text-orange-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}>
                            {e.alertCategory.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canRecordRenewal && e.daysUntilExpiry >= 0 && linkedPlan && (
                              <button
                                onClick={() => {
                                  setSelectedPlanForRenewal(linkedPlan);
                                  setIsRecordRenewalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-[11px] transition shadow-xs"
                              >
                                Record Renewal
                              </button>
                            )}

                            {canReactivate && (e.daysUntilExpiry < 0 || e.planStatus === 'EXPIRED') && linkedPlan && (
                              <button
                                onClick={() => {
                                  setSelectedPlanForReactivation(linkedPlan);
                                  setIsReactivateOpen(true);
                                }}
                                className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded font-bold text-[11px] transition shadow-xs"
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredExpiryRecords.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        No policies match the selected alert filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 5: REGISTERED PLANS
         ======================================================== */}
      {activeSubTab === 'plans' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase">
                Active & Enrolled Turihamwe Insurance Policies
              </h2>
              <p className="text-xs text-slate-500">
                Primary Master Coverage Directory Linked to SACCO Member Identifiers
              </p>
            </div>
            {canRegisterPlan && (
              <button
                onClick={() => setIsRegisterPlanOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Register New Plan
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
                <tr>
                  <th className="px-6 py-3">Plan ID</th>
                  <th className="px-6 py-3">SACCO A/C</th>
                  <th className="px-6 py-3">Member Name</th>
                  <th className="px-6 py-3">Branch</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Effective Date</th>
                  <th className="px-6 py-3">Current Expiry</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredPlans.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-mono font-bold text-blue-900">{p.id}</td>
                    <td className="px-6 py-3 font-mono font-semibold">{p.saccoAccountNumber}</td>
                    <td className="px-6 py-3 font-bold text-slate-900">{p.memberName}</td>
                    <td className="px-6 py-3">{p.registeredBranchName || 'SACCO Branch'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : p.status === 'EXPIRED'
                          ? 'bg-red-50 text-red-800 border border-red-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono">{p.effectiveStartDate}</td>
                    <td className="px-6 py-3 font-mono font-semibold">{p.currentExpiryDate}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canRecordContribution && (
                          <button
                            onClick={() => {
                              setSelectedPlanForRenewal(p);
                              setIsRecordContribOpen(true);
                            }}
                            className="text-emerald-700 hover:underline font-bold text-[11px]"
                          >
                            + Contrib
                          </button>
                        )}
                        {canRecordRenewal && (
                          <button
                            onClick={() => {
                              setSelectedPlanForRenewal(p);
                              setIsRecordRenewalOpen(true);
                            }}
                            className="text-blue-700 hover:underline font-bold text-[11px]"
                          >
                            Renew
                          </button>
                        )}
                        {canReactivate && (p.status === 'EXPIRED' || p.status === 'SUSPENDED') && (
                          <button
                            onClick={() => {
                              setSelectedPlanForReactivation(p);
                              setIsReactivateOpen(true);
                            }}
                            className="text-amber-700 hover:underline font-bold text-[11px]"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                      No Turihamwe plans found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 6: BENEFICIARIES
         ======================================================== */}
      {activeSubTab === 'beneficiaries' && canManageBeneficiaries && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase">
                Beneficiary Linkage Directory
              </h2>
              <p className="text-xs text-slate-500">
                Audited Member-Beneficiary Linkages • Claim Entitlement Allocation
              </p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border text-xs text-slate-700 space-y-2">
            <div className="font-bold text-slate-900">Auditable Beneficiary Structure Rules:</div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>Beneficiaries are strictly tied to the member&apos;s SACCO account number and plan ID.</li>
              <li>Percentage allocations must not exceed 100% aggregate per member plan.</li>
              <li>Every addition, modification, or removal records user, timestamp, branch, and justification in the immutable audit trail.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 7: POLICY HISTORY
         ======================================================== */}
      {activeSubTab === 'history' && canViewHistory && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase">
                Immutable Turihamwe Policy Lifecycle Logs
              </h2>
              <p className="text-xs text-slate-500">
                All lifecycle transitions, contribution captures, renewals, and controlled reactivations
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="px-4 py-2.5">Date / Time</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Reference / Record</th>
                  <th className="px-4 py-2.5">Officer</th>
                  <th className="px-4 py-2.5">Branch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {renewals.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-semibold text-blue-900">RENEWAL_RECORDED</td>
                    <td className="px-4 py-2.5 font-mono">{r.renewalReference} ({r.saccoAccountNumber})</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{r.processedByUsername}</td>
                    <td className="px-4 py-2.5">{r.branchName || 'SACCO Branch'}</td>
                  </tr>
                ))}
                {contributions.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-semibold text-emerald-900">
                      {c.status === 'CORRECTED' ? 'CONTRIBUTION_CORRECTED' : 'CONTRIBUTION_RECORDED'}
                    </td>
                    <td className="px-4 py-2.5 font-mono">{c.receiptNumber} ({c.saccoAccountNumber})</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">{c.receivedByUsername}</td>
                    <td className="px-4 py-2.5">{c.branchName || 'SACCO Branch'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODALS
         ======================================================== */}
      {/* 1. Record Contribution Modal */}
      <RecordContributionModal
        isOpen={isRecordContribOpen}
        onClose={() => {
          setIsRecordContribOpen(false);
          setSelectedPlanForRenewal(null);
        }}
        preselectedPlan={selectedPlanForRenewal}
        onSuccess={newContrib => {
          setSelectedContributionForReceipt(newContrib);
          setIsReceiptOpen(true);
          notifyRecordChanged('CONTRIBUTION', 'CREATED', newContrib.id, newContrib);
          loadTurihamweData();
        }}
      />

      {/* 2. Official Printable Receipt Modal */}
      <ContributionReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setSelectedContributionForReceipt(null);
        }}
        contribution={selectedContributionForReceipt}
      />

      {/* 3. Audited Correction Modal */}
      <CorrectContributionModal
        isOpen={isCorrectContribOpen}
        onClose={() => {
          setIsCorrectContribOpen(false);
          setSelectedContributionForCorrection(null);
        }}
        contribution={selectedContributionForCorrection}
        onSuccess={corrected => {
          notifyRecordChanged('CONTRIBUTION', 'CORRECTED', corrected?.id || 'contrib', corrected);
          loadTurihamweData();
        }}
      />

      {/* 4. Record Renewal Modal */}
      <RecordRenewalModal
        isOpen={isRecordRenewalOpen}
        onClose={() => {
          setIsRecordRenewalOpen(false);
          setSelectedPlanForRenewal(null);
        }}
        plan={selectedPlanForRenewal}
        onSuccess={newRenewal => {
          notifyRecordChanged('RENEWAL', 'CREATED', (newRenewal as any)?.id || 'renewal', newRenewal);
          loadTurihamweData();
        }}
      />

      {/* 5. Controlled Reactivation Modal */}
      <ReactivatePlanModal
        isOpen={isReactivateOpen}
        onClose={() => {
          setIsReactivateOpen(false);
          setSelectedPlanForReactivation(null);
        }}
        plan={selectedPlanForReactivation}
        onSuccess={reactivatedPlan => {
          notifyRecordChanged('PLAN', 'UPDATED', (reactivatedPlan as any)?.id || 'plan', reactivatedPlan);
          loadTurihamweData();
        }}
      />

      {/* 6. Register Plan Modal */}
      <RegisterPlanModal
        isOpen={isRegisterPlanOpen}
        onClose={() => setIsRegisterPlanOpen(false)}
        onSuccess={newPlan => {
          notifyRecordChanged('PLAN', 'CREATED', (newPlan as any)?.id || 'plan', newPlan);
          loadTurihamweData();
        }}
      />

      {/* 7. Configurable Business Rules Modal */}
      <BusinessRulesModal
        isOpen={isBusinessRulesOpen}
        onClose={() => setIsBusinessRulesOpen(false)}
      />
    </div>
  );
};
