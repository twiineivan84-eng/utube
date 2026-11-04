import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Receipt, Plus, Printer, Search, ArrowDownCircle, CheckCircle2 } from 'lucide-react';

export const TransactionsView: React.FC = () => {
  const { workingBranch, hasPermission } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'records' | 'intake'>('records');

  const canRecord = hasPermission('transactions.record');
  const canPrint = hasPermission('transactions.print_receipts');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-700" />
            Financial Transactions & Contributions
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Nyamuyanja SACCO Branch Operations • Branch Context: <strong className="text-slate-700">{workingBranch?.name}</strong>
          </p>
        </div>

        {canRecord && (
          <button
            onClick={() => setActiveSubTab('intake')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Record Turihamwe Contribution
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Branch Transaction Journal
          </div>
          <span className="text-xs text-slate-500">
            Independent Record Keeping (Does not post directly to external banking server)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b uppercase">
              <tr>
                <th className="px-6 py-3">Receipt No.</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">SACCO A/C</th>
                <th className="px-6 py-3">Member Name</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Amount (UGX)</th>
                <th className="px-6 py-3">Branch</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr className="hover:bg-slate-50">
                <td className="px-6 py-3 font-mono font-bold text-blue-900">RCP-2026-0812</td>
                <td className="px-6 py-3">2026-09-23</td>
                <td className="px-6 py-3 font-mono font-bold text-slate-800">NYA-001042</td>
                <td className="px-6 py-3 font-semibold text-slate-900">Kato Emmanuel</td>
                <td className="px-6 py-3">CASH</td>
                <td className="px-6 py-3 font-mono font-bold text-emerald-800">UGX 50,000</td>
                <td className="px-6 py-3 text-slate-600">Nyamuyanja Branch</td>
                <td className="px-6 py-3 text-right">
                  {canPrint && (
                    <button className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold">
                      <Printer className="w-3.5 h-3.5" />
                      Print Receipt
                    </button>
                  )}
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-6 py-3 font-mono font-bold text-blue-900">RCP-2026-0811</td>
                <td className="px-6 py-3">2026-09-22</td>
                <td className="px-6 py-3 font-mono font-bold text-slate-800">NYA-002109</td>
                <td className="px-6 py-3 font-semibold text-slate-900">Mukasa Ronald</td>
                <td className="px-6 py-3">MOBILE MONEY</td>
                <td className="px-6 py-3 font-mono font-bold text-emerald-800">UGX 50,000</td>
                <td className="px-6 py-3 text-slate-600">Kagarama Branch</td>
                <td className="px-6 py-3 text-right">
                  {canPrint && (
                    <button className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold">
                      <Printer className="w-3.5 h-3.5" />
                      Print Receipt
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
