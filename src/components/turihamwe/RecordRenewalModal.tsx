import React, { useState } from 'react';
import { TurihamwePlan, Renewal } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { LocalRepository } from '../../db/local/localRepository';
import { RefreshCw, X, AlertCircle, Calendar, CheckCircle2, ShieldCheck } from 'lucide-react';

interface RecordRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: TurihamwePlan | null;
  onSuccess: (renewal: Renewal) => void;
}

export const RecordRenewalModal: React.FC<RecordRenewalModalProps> = ({
  isOpen,
  onClose,
  plan,
  onSuccess,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();

  const canRecordRenewal = hasPermission('turihamwe.record_renewal');

  const todayStr = new Date().toISOString().split('T')[0];

  // Calculate default 1-year extension from current expiry date or today
  const calculateDefaultNewExpiry = () => {
    if (!plan) return todayStr;
    const base = new Date(plan.currentExpiryDate > todayStr ? plan.currentExpiryDate : todayStr);
    base.setFullYear(base.getFullYear() + 1);
    return base.toISOString().split('T')[0];
  };

  const [renewalDate, setRenewalDate] = useState(todayStr);
  const [effectiveDate, setEffectiveDate] = useState(plan?.currentExpiryDate || todayStr);
  const [newExpiryDate, setNewExpiryDate] = useState(calculateDefaultNewExpiry());
  const [renewalFee, setRenewalFee] = useState<string>('');
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canRecordRenewal) {
      setError('Permission denied: You do not have authorization to process policy renewals.');
      return;
    }

    if (!newExpiryDate || newExpiryDate <= effectiveDate) {
      setError('New expiry date must be strictly after the effective date.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        planId: plan.id,
        renewalDate,
        effectiveDate,
        newExpiryDate,
        renewalFee: renewalFee ? parseFloat(renewalFee) : undefined,
        receiptReference: receiptReference.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      let createdRenewal: Renewal | null = null;

      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch('/api/turihamwe/renewals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          createdRenewal = await res.json();
        } else {
          const errData = await res.json();
          throw new Error(errData.error || 'Server error processing renewal');
        }
      } catch (networkErr: unknown) {
        const isOffline = !navigator.onLine ||
          (networkErr instanceof Error && (networkErr.message.includes('fetch') || networkErr.message.includes('Network')));

        if (isOffline) {
          createdRenewal = await LocalRepository.recordLocalRenewal({
            planId: plan.id,
            saccoAccountNumber: plan.saccoAccountNumber,
            memberName: plan.memberName,
            branchId: workingBranch!.id,
            branchName: workingBranch!.name,
            processedByUserId: user!.id,
            processedByUsername: user!.username,
            renewalDate,
            effectiveDate,
            previousExpiryDate: plan.currentExpiryDate,
            newExpiryDate,
            previousPlanStatus: plan.status,
            resultingPlanStatus: 'ACTIVE',
            renewalFee: renewalFee ? parseFloat(renewalFee) : undefined,
            receiptReference: receiptReference.trim(),
            notes: notes.trim(),
          });
        } else {
          throw networkErr;
        }
      }

      if (createdRenewal) {
        onSuccess(createdRenewal);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error executing renewal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Record Turihamwe Policy Renewal
              </h2>
              <p className="text-[11px] text-slate-400">
                Extending Coverage for Member {plan.saccoAccountNumber}
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

        {/* Notice regarding uninvented business calculations */}
        <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-200 text-[11px] text-blue-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            <strong>Configurable Architecture Note:</strong> Renewal duration, fee calculation, and grace periods remain configurable policy parameters. Specify the approved cover extension.
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Plan Summary Card */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Member Account</span>
                <span className="font-mono font-bold text-blue-900 text-sm">{plan.saccoAccountNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Member Name</span>
                <span className="font-bold text-slate-900 text-sm">{plan.memberName}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500 block">Plan ID:</span>
                <span className="font-mono font-semibold text-slate-800">{plan.id}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Current Status:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  plan.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {plan.status}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Current Expiry:</span>
                <span className="font-semibold text-slate-800">{plan.currentExpiryDate}</span>
              </div>
            </div>
          </div>

          {/* Dates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Renewal Date *
              </label>
              <input
                type="date"
                value={renewalDate}
                onChange={e => setRenewalDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Effective Date *
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                New Expiry Date *
              </label>
              <input
                type="date"
                value={newExpiryDate}
                onChange={e => setNewExpiryDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white font-bold text-emerald-900"
                required
              />
            </div>
          </div>

          {/* Fee & Receipt Ref */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Renewal Fee (UGX, Optional)
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={renewalFee}
                onChange={e => setRenewalFee(e.target.value)}
                placeholder="Configurable / As approved"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Payment Receipt Reference (Optional)
              </label>
              <input
                type="text"
                value={receiptReference}
                onChange={e => setReceiptReference(e.target.value.toUpperCase())}
                placeholder="e.g. TRH-CTR-2026-000101"
                className="w-full px-3 py-2 font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Officer Notes / Institutional Authorization
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Annual renewal processed following member request and contribution verification"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Recording Renewal...' : 'Confirm Policy Renewal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
