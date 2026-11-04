import React from 'react';
import { Contribution } from '../../types';
import { CheckCircle2, Printer, X, ShieldCheck, Building2, Calendar, User, Hash } from 'lucide-react';

interface ContributionReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  contribution: Contribution | null;
}

export const ContributionReceiptModal: React.FC<ContributionReceiptModalProps> = ({
  isOpen,
  onClose,
  contribution,
}) => {
  if (!isOpen || !contribution) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Official Contribution Receipt
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Content */}
        <div className="p-6 space-y-6 text-slate-800 print:p-0">
          {/* Header */}
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <h2 className="text-lg font-semibold text-blue-950 uppercase tracking-tight">
              Nyamuyanja SACCO Ltd
            </h2>
            <p className="text-[11px] font-semibold text-slate-600">
              Turihamwe Insurance Management System
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Isingiro District, Western Uganda • Reg No: SACCO/2004/082
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              OFFICIAL CONTRIBUTION RECEIPT
            </div>
          </div>

          {/* Reference & Date Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Receipt Ref</span>
              <span className="font-mono font-bold text-blue-900 text-xs">
                {contribution.receiptNumber}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Transaction Date</span>
              <span className="font-semibold text-slate-800">
                {contribution.contributionDate}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Branch</span>
              <span className="font-semibold text-slate-800">
                {contribution.branchName || 'SACCO Branch'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Receiving Officer</span>
              <span className="font-semibold text-slate-800 font-mono">
                {contribution.receivedByUsername || 'Staff'}
              </span>
            </div>
          </div>

          {/* Member & Plan Details */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Member Account:</span>
              <span className="font-mono font-bold text-blue-900">{contribution.saccoAccountNumber}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Member Full Name:</span>
              <span className="font-bold text-slate-900">{contribution.memberName}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Turihamwe Plan ID:</span>
              <span className="font-mono text-slate-800">{contribution.planId}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-semibold text-slate-800 uppercase">{contribution.paymentMethod.replace('_', ' ')}</span>
            </div>
            {contribution.periodCoveredStart && contribution.periodCoveredEnd && (
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Coverage Term:</span>
                <span className="font-medium text-slate-700">
                  {contribution.periodCoveredStart} to {contribution.periodCoveredEnd}
                </span>
              </div>
            )}
            {contribution.remarks && (
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Remarks / Purpose:</span>
                <span className="font-medium text-slate-700 text-right max-w-xs">{contribution.remarks}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Receipt Status:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {contribution.status}
              </span>
            </div>
          </div>

          {/* Total Amount Box */}
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <span className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider block">
              Contribution Amount Received
            </span>
            <span className="text-2xl font-semibold text-blue-950 font-mono tabular-nums tracking-tight mt-1 block">
              UGX {contribution.amount.toLocaleString()}
            </span>
            <span className="text-[10px] text-blue-700 mt-1 block">
              Recorded in Turihamwe Insurance Ledger • Independent Financial Capture
            </span>
          </div>

          {/* Footer & Disclaimer */}
          <div className="text-center text-[10px] text-slate-500 space-y-1 pt-2 border-t border-dashed border-slate-200">
            <p>This is a computer-generated receipt from the Turihamwe Management System.</p>
            <p className="font-mono text-[9px] text-slate-400">
              Timestamp: {new Date(contribution.createdAt).toUTCString()} • Ref: {contribution.receiptNumber}
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Official Receipt
          </button>
        </div>
      </div>
    </div>
  );
};
