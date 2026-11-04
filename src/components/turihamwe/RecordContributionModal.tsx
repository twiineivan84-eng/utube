import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TurihamwePlan, SaccoMember, Contribution } from '../../types';
import { LocalRepository } from '../../db/local/localRepository';
import { localDb } from '../../db/local/sqliteEngine';
import { notifyRecordChanged } from '../../utils/systemEvents';
import { ShieldCheck, X, AlertCircle, DollarSign, Calendar, CreditCard, User, FileText, CheckCircle2 } from 'lucide-react';

interface RecordContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (contribution: Contribution) => void;
  preselectedPlan?: TurihamwePlan | null;
}

export const RecordContributionModal: React.FC<RecordContributionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedPlan,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();

  const [saccoAccountNumber, setSaccoAccountNumber] = useState('');
  const [member, setMember] = useState<SaccoMember | null>(null);
  const [plan, setPlan] = useState<TurihamwePlan | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'SACCO_TRANSFER' | 'MOBILE_MONEY' | 'BANK_DRAFT'>('CASH');
  const [contributionDate, setContributionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [periodCoveredStart, setPeriodCoveredStart] = useState<string>('');
  const [periodCoveredEnd, setPeriodCoveredEnd] = useState<string>('');
  const [remarks, setRemarks] = useState('');

  const [searching, setSearching] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canRecord = hasPermission('turihamwe.record_contribution') || hasPermission('transactions.record');

  // Load preselected plan if provided
  useEffect(() => {
    if (preselectedPlan) {
      setPlan(preselectedPlan);
      setSaccoAccountNumber(preselectedPlan.saccoAccountNumber);
      // Fetch member
      fetchMemberAndPlan(preselectedPlan.saccoAccountNumber);
    } else {
      resetForm();
    }
  }, [preselectedPlan, isOpen]);

  const resetForm = () => {
    setSaccoAccountNumber('');
    setMember(null);
    setPlan(null);
    setAmount('');
    setPaymentMethod('CASH');
    setContributionDate(new Date().toISOString().split('T')[0]);
    setPeriodCoveredStart('');
    setPeriodCoveredEnd('');
    setRemarks('');
    setMemberError(null);
    setSubmitError(null);
  };

  const fetchMemberAndPlan = async (accountNo: string) => {
    const cleanAcc = accountNo.trim().toUpperCase();
    if (!cleanAcc) {
      setMember(null);
      setPlan(null);
      setMemberError(null);
      return;
    }

    setSearching(true);
    setMemberError(null);

    try {
      // 1. Fetch Member
      let foundMember: SaccoMember | null = null;
      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch(`/api/members/${cleanAcc}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (res.ok) {
          foundMember = await res.json();
        }
      } catch {
        // Fallback to local
      }

      if (!foundMember) {
        const localMem = await LocalRepository.getMemberByAccount(cleanAcc);
        if (localMem) foundMember = localMem;
      }

      if (!foundMember) {
        setMember(null);
        setPlan(null);
        setMemberError(`Member with SACCO account "${cleanAcc}" does not exist.`);
        setSearching(false);
        return;
      }

      setMember(foundMember);

      // 2. Fetch Plan
      let foundPlan: TurihamwePlan | null = null;
      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch(`/api/turihamwe/plans/account/${cleanAcc}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (res.ok) {
          foundPlan = await res.json();
        }
      } catch {
        // Fallback to local
      }

      if (!foundPlan) {
        const localP = await LocalRepository.getPlanByAccount(cleanAcc);
        if (localP) foundPlan = localP;
      }

      if (!foundPlan) {
        setPlan(null);
        setMemberError(`Member ${cleanAcc} is verified, but has no registered Turihamwe insurance plan. A plan must be enrolled before recording contributions.`);
      } else {
        setPlan(foundPlan);
        setMemberError(null);
        // Pre-fill suggested period if applicable
        if (foundPlan.effectiveStartDate && foundPlan.currentExpiryDate) {
          setPeriodCoveredStart(foundPlan.effectiveStartDate);
          setPeriodCoveredEnd(foundPlan.currentExpiryDate);
        }
      }
    } catch (err: unknown) {
      setMemberError(err instanceof Error ? err.message : 'Error validating member.');
    } finally {
      setSearching(false);
    }
  };

  const handleAccountBlur = () => {
    if (saccoAccountNumber.trim()) {
      fetchMemberAndPlan(saccoAccountNumber);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!canRecord) {
      setSubmitError('Permission denied: You do not have authorization to record Turihamwe contributions.');
      return;
    }

    if (!member) {
      setSubmitError('Please verify a valid SACCO member account.');
      return;
    }

    if (!plan) {
      setSubmitError('This member does not have an active Turihamwe plan to credit.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setSubmitError('Please enter a valid contribution amount in UGX.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        saccoAccountNumber: member.saccoAccountNumber,
        planId: plan.id,
        amount: numAmount,
        paymentMethod,
        contributionDate,
        periodCoveredStart: periodCoveredStart || undefined,
        periodCoveredEnd: periodCoveredEnd || undefined,
        remarks: remarks.trim() || undefined,
      };

      let createdContribution: Contribution | null = null;
      let recordedViaApi = false;

      // Attempt online API first
      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch('/api/turihamwe/contributions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          createdContribution = await res.json();
          recordedViaApi = true;
        } else {
          const errData = await res.json();
          throw new Error(errData.error || 'Server rejected contribution record');
        }
      } catch (networkErr: unknown) {
        // If offline or network error, save locally
        const isOffline = !navigator.onLine ||
          (networkErr instanceof Error && (networkErr.message.includes('fetch') || networkErr.message.includes('Network')));

        if (isOffline) {
          createdContribution = await LocalRepository.recordLocalContribution({
            saccoAccountNumber: member.saccoAccountNumber,
            memberName: member.fullName,
            planId: plan.id,
            branchId: workingBranch!.id,
            branchName: workingBranch!.name,
            receivedByUserId: user!.id,
            receivedByUsername: user!.username,
            amount: numAmount,
            paymentMethod,
            contributionDate,
            periodCoveredStart,
            periodCoveredEnd,
            remarks: remarks.trim(),
          });
        } else {
          throw networkErr;
        }
      }

      if (createdContribution) {
        // Cache to local db if recorded via API
        if (recordedViaApi) {
          await localDb.contributions.put(createdContribution);
          const localPlan = await localDb.plans.get(plan.id);
          if (localPlan) {
            localPlan.totalContributionsAmount = (localPlan.totalContributionsAmount || 0) + createdContribution.amount;
            localPlan.lastContributionDate = createdContribution.contributionDate;
            localPlan.updatedAt = new Date().toISOString();
            await localDb.plans.put(localPlan);
          }
        }
        notifyRecordChanged('CONTRIBUTION', 'CREATED', createdContribution.id, createdContribution);
        onSuccess(createdContribution);
        onClose();
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record contribution.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Record Turihamwe Contribution
              </h2>
              <p className="text-[11px] text-slate-400">
                Operating Branch: <span className="text-white font-semibold">{workingBranch?.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice regarding uninvented business rules */}
        <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-200 text-[11px] text-blue-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            <strong>Configurable Parameter Note:</strong> Contribution amounts remain unprescribed pending SACCO board specification. Enter the actual amount received.
          </span>
        </div>

        {/* Error Alerts */}
        {submitError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Member SACCO Account Lookup */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              SACCO Account Number *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={saccoAccountNumber}
                onChange={e => setSaccoAccountNumber(e.target.value.toUpperCase())}
                onBlur={handleAccountBlur}
                placeholder="e.g. NYA-001042"
                className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
              <button
                type="button"
                onClick={() => fetchMemberAndPlan(saccoAccountNumber)}
                disabled={searching || !saccoAccountNumber.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
              >
                {searching ? 'Verifying...' : 'Verify Member'}
              </button>
            </div>
            {memberError && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{memberError}</p>
            )}
          </div>

          {/* Member & Plan Verification Card */}
          {member && (
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900">{member.fullName}</span>
                <span className="text-[10px] font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded font-bold">
                  {member.saccoAccountNumber}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-center justify-between">
                <span>Branch: {member.branchName || 'SACCO Branch'}</span>
                <span>Phone: {member.primaryPhone}</span>
              </div>

              {plan ? (
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                  <div>
                    <span className="text-slate-500">Linked Plan: </span>
                    <span className="font-mono font-bold text-blue-900">{plan.id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    plan.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {plan.status}
                  </span>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-red-200 text-[11px] text-red-700 font-semibold">
                  No active Turihamwe plan registered for this member.
                </div>
              )}
            </div>
          )}

          {/* Amount & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Contribution Amount (UGX) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">UGX</span>
                <input
                  type="number"
                  min="1"
                  step="500"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 75000"
                  className="w-full pl-12 pr-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Payment Channel *
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white font-semibold"
                required
              >
                <option value="CASH">Cash Over Counter</option>
                <option value="SACCO_TRANSFER">SACCO Account Transfer</option>
                <option value="MOBILE_MONEY">Mobile Money (MTN/Airtel)</option>
                <option value="BANK_DRAFT">Bank Draft / Cheque</option>
              </select>
            </div>
          </div>

          {/* Transaction Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Contribution Date *
            </label>
            <input
              type="date"
              value={contributionDate}
              onChange={e => setContributionDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
              required
            />
          </div>

          {/* Coverage Period (Optional) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cover Start (Optional)
              </label>
              <input
                type="date"
                value={periodCoveredStart}
                onChange={e => setPeriodCoveredStart(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cover End (Optional)
              </label>
              <input
                type="date"
                value={periodCoveredEnd}
                onChange={e => setPeriodCoveredEnd(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Remarks / Narrative */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Remarks / Transaction Notes
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Annual policy contribution payment received at teller counter"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          {/* Modal Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !member || !plan}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Recording...' : 'Record & Generate Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
