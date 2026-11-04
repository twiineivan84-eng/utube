import React, { useState } from 'react';
import { Contribution } from '../../types';
import { AlertTriangle, X, CheckCircle2, DollarSign } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface CorrectContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contribution: Contribution | null;
  onSuccess: (updated: Contribution) => void;
}

export const CorrectContributionModal: React.FC<CorrectContributionModalProps> = ({
  isOpen,
  onClose,
  contribution,
  onSuccess,
}) => {
  const { workingBranch } = useAuth();
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState(contribution?.remarks || '');
  const [paymentMethod, setPaymentMethod] = useState(contribution?.paymentMethod || 'CASH');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !contribution) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setError('Please provide an official justification reason for this correction (min 5 characters).');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch(`/api/turihamwe/contributions/${contribution.id}/correct`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
        body: JSON.stringify({
          reason: reason.trim(),
          remarks: remarks.trim(),
          paymentMethod,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit correction');
      }

      const data = await res.json();
      onSuccess(data.contribution);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error executing correction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-amber-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Audited Contribution Correction
              </h2>
              <p className="text-[11px] text-amber-200 font-mono">
                Ref: {contribution.receiptNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-amber-300 hover:text-white hover:bg-amber-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
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
              <span className="font-bold text-slate-800">{contribution.memberName} ({contribution.saccoAccountNumber})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-mono font-bold text-blue-900">UGX {contribution.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recorded Date:</span>
              <span>{contribution.contributionDate}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600"
            >
              <option value="CASH">Cash Over Counter</option>
              <option value="SACCO_TRANSFER">SACCO Account Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="BANK_DRAFT">Bank Draft / Cheque</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Updated Remarks / Purpose
            </label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-red-700 uppercase tracking-wider mb-1">
              Audit Justification Reason *
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a detailed administrative reason for this correction (required for institutional audit compliance)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Applying...' : 'Apply Correction & Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
