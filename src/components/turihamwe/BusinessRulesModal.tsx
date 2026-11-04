import React from 'react';
import { X, ShieldCheck, Sliders, Info, Clock, AlertCircle } from 'lucide-react';

interface BusinessRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessRulesModal: React.FC<BusinessRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Configurable Business Rules & Architecture Status
              </h2>
              <p className="text-[11px] text-slate-400">
                Phase 4 Institutional Architecture Specification
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

        <div className="p-6 space-y-4 text-xs text-slate-700">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-bold">Strict Architecture Rule:</strong> In accordance with development instructions, undefined business rules must not be invented or hardcoded. The table below documents the status of all parameters that remain configurable pending SACCO board specification.
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="px-4 py-2.5">Parameter / Policy Rule</th>
                  <th className="px-4 py-2.5">Architecture Status</th>
                  <th className="px-4 py-2.5">System Implementation Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Contribution Amount</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-900">
                      CONFIGURABLE / PENDING
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    Accepts any validated positive numeric value entered by authorized staff.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Contribution Frequency</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-900">
                      CONFIGURABLE / PENDING
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    Supports flexible or periodic intervals without rigid enforcement.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Minimum / Maximum Limits</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-900">
                      UNPRESCRIBED
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    No arbitrary ceilings or floors assumed; pending board policy.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Grace Period & Late Penalties</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-900">
                      CONFIGURABLE
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    Alert windows (30d, 14d, 7d, 0d) are informational only; no automatic financial penalties invented.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Renewal Cover Duration</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-900">
                      MODULAR DATE PICKER
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    Effective and new expiry dates explicitly selected by authorized operator.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">Reactivation Eligibility</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-100 text-blue-900">
                      CONTROLLED WORKFLOW
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    Requires explicit permission, justification note, and full audit trail without automated guessing.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs transition"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
