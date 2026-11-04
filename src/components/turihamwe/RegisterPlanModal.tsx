import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { TurihamwePlan, SaccoMember } from '../../types';
import { LocalRepository } from '../../db/local/localRepository';
import { localDb } from '../../db/local/sqliteEngine';
import { notifyRecordChanged } from '../../utils/systemEvents';
import { ShieldCheck, X, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';

interface RegisterPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (plan: TurihamwePlan) => void;
  preselectedMember?: SaccoMember | null;
}

export const RegisterPlanModal: React.FC<RegisterPlanModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedMember,
}) => {
  const { user, workingBranch, hasPermission } = useAuth();

  const [saccoAccountNumber, setSaccoAccountNumber] = useState(preselectedMember?.saccoAccountNumber || '');
  const [member, setMember] = useState<SaccoMember | null>(preselectedMember || null);
  const [effectiveStartDate, setEffectiveStartDate] = useState(new Date().toISOString().split('T')[0]);

  // Default initial expiry = 1 year later
  const defaultExpiry = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  };

  const [currentExpiryDate, setCurrentExpiryDate] = useState(defaultExpiry());
  const [notes, setNotes] = useState('');
  const [searching, setSearching] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canRegister = hasPermission('turihamwe.register_plan');

  if (!isOpen) return null;

  const verifyMember = async (accountNo: string) => {
    const clean = accountNo.trim().toUpperCase();
    if (!clean) return;
    setSearching(true);
    setMemberError(null);

    try {
      let found: SaccoMember | null = null;
      try {
        const token = localStorage.getItem('turihamwe_token');
        const res = await fetch(`/api/members/${clean}`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            'x-working-branch': workingBranch?.id || '',
          },
        });
        if (res.ok) found = await res.json();
      } catch {
        // Fallback to local
      }

      if (!found) {
        const local = await LocalRepository.getMemberByAccount(clean);
        if (local) found = local;
      }

      if (!found) {
        setMember(null);
        setMemberError(`SACCO member account "${clean}" not found.`);
      } else {
        setMember(found);
        setMemberError(null);
      }
    } catch {
      setMemberError('Error verifying SACCO member');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRegister) {
      setSubmitError('Permission denied: You do not have authorization to register Turihamwe plans.');
      return;
    }

    if (!member) {
      setSubmitError('Please verify a valid SACCO member.');
      return;
    }

    if (!effectiveStartDate || !currentExpiryDate || currentExpiryDate <= effectiveStartDate) {
      setSubmitError('Expiry date must be after the effective start date.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        saccoAccountNumber: member.saccoAccountNumber,
        effectiveStartDate,
        currentExpiryDate,
        notes: notes.trim(),
      };

      const token = localStorage.getItem('turihamwe_token');
      const res = await fetch('/api/turihamwe/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'x-working-branch': workingBranch?.id || '',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Server error creating plan');
      }

      const createdPlan = await res.json();

      // Persist plan in local store and update member's insurance status across system
      await LocalRepository.savePlanLocally(createdPlan);
      const localMem = await localDb.members.get(createdPlan.saccoAccountNumber);
      if (localMem) {
        localMem.turihamweStatus = 'ACTIVE';
        localMem.updatedAt = new Date().toISOString();
        await localDb.members.put(localMem);
      }

      notifyRecordChanged('PLAN', 'CREATED', createdPlan.id, createdPlan);
      onSuccess(createdPlan);
      onClose();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error registering plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Enroll Member in Turihamwe Plan
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

        {submitError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Member SACCO Account Number *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={saccoAccountNumber}
                onChange={e => setSaccoAccountNumber(e.target.value.toUpperCase())}
                onBlur={() => verifyMember(saccoAccountNumber)}
                placeholder="e.g. NYA-001042"
                className="flex-1 px-3 py-2 font-mono uppercase bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
              <button
                type="button"
                onClick={() => verifyMember(saccoAccountNumber)}
                disabled={searching || !saccoAccountNumber.trim()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {searching ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            {memberError && <p className="text-[11px] text-red-600 mt-1">{memberError}</p>}
          </div>

          {member && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="font-bold text-slate-900">{member.fullName}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Branch:</span>
                <span className="text-slate-700">{member.branchName || 'SACCO Branch'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Effective Start Date *
              </label>
              <input
                type="date"
                value={effectiveStartDate}
                onChange={e => setEffectiveStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Current Expiry Date *
              </label>
              <input
                type="date"
                value={currentExpiryDate}
                onChange={e => setCurrentExpiryDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:bg-white font-semibold"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Enrolment Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Standard member insurance cover enrolment"
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
              disabled={submitting || !member}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Registering...' : 'Register Policy Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
