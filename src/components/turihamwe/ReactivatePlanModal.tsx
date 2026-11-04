import React, { useState } from 'react';
import { TurihamwePlan } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface ReactivatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: TurihamwePlan | null;
  onSuccess: (updatedPlan: TurihamwePlan) => void;
}

export const ReactivatePlanModal: React.FC<ReactivatePlanModalProps> = ({
  isOpen,
  onClose,
  plan,
  onSuccess,
}) => {
  const { workingBranch, hasPermission } = useAuth();
  const [justificationReason, setJustificationReason] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReactivate = hasPermission('turihamwe.reactivate_plan');

  if (!isOpen || !plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canReactivate) {
      setError('Permission denied: You do not have authorization to reactivate insurance plans.');
      return;
    }

    if (!justificationReason || justificationReason.trim().length < 5) {
      setError('A comprehensive justification reason is required for auditable reactivation (min 5 characters).');
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch(`/api/turihamwe/plans/${plan.id}/reactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
        body: JSON.stringify({
          justificationReason: justificationReason.trim(),
          newExpiryDate: newExpiryDate || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server error processing reactivation');
      }

      const data = await res.json();
      onSuccess(data.plan);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error processing reactivation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Controlled Plan Reactivation
              </h2>
              <p className="text-[11px] text-slate-400">
                Audited Administrative Procedure • Plan {plan.id}
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

        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-950 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Institutional Governance Rule:</strong> Reactivations must never be automatic. Each reactivation is immutably logged with authorizing officer, branch, and justification reason.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Member:</span>
              <span className="font-bold text-slate-800">{plan.memberName} ({plan.saccoAccountNumber})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Previous Expiry:</span>
              <span className="font-mono text-red-700 font-bold">{plan.currentExpiryDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Current Status:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                {plan.status}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              New Expiry Date (Optional Extension)
            </label>
            <input
              type="date"
              value={newExpiryDate}
              onChange={e => setNewExpiryDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-red-800 uppercase tracking-wider mb-1">
              Administrative Justification Reason *
            </label>
            <textarea
              rows={3}
              required
              value={justificationReason}
              onChange={e => setJustificationReason(e.target.value)}
              placeholder="State the institutional reason for reactivating this lapsed policy (e.g. Approved premium settlement, SACCO executive board discretion, or verified grace period settlement)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:bg-white"
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
              {submitting ? 'Reactivating...' : 'Authorize Reactivation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
