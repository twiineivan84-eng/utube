import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  ReportCategory,
  Branch,
  ReportGenerationLog,
  MonthlyBranchSummary
} from '../types';
import {
  BarChart3,
  Download,
  Calendar,
  Building,
  RefreshCw,
  Search,
  EyeOff,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  History,
  TrendingUp,
  FileText,
  Users,
  ShieldCheck,
  Receipt,
  RotateCw,
  FileCheck2,
  Lock,
  ArrowRight
} from 'lucide-react';

interface ReportSubtypeOption {
  value: string;
  label: string;
}

const SUBTYPES_BY_CATEGORY: Record<ReportCategory, ReportSubtypeOption[]> = {
  MEMBERS: [
    { value: 'all', label: '1. Member Full Register' },
    { value: 'by_branch', label: '2. Member Distribution by Branch' },
    { value: 'recent_registrations', label: '3. Member Registration Activity' },
  ],
  TURIHAMWE: [
    { value: 'all', label: '1. All Turihamwe Insurance Policies' },
    { value: 'active', label: '2. Active Plans Register' },
    { value: 'pending', label: '3. Pending / Inactive Plans' },
    { value: 'expired', label: '4. Expired Policies Follow-Up' },
  ],
  CONTRIBUTIONS: [
    { value: 'all', label: '1. Contributions Ledger Statement' },
    { value: 'by_date', label: '2. Contributions by Date Range' },
    { value: 'by_branch', label: '3. Contributions by Branch' },
  ],
  RENEWALS: [
    { value: 'all', label: '1. Policy Renewal History Log' },
    { value: 'upcoming', label: '2. Upcoming Renewals Window' },
    { value: 'by_branch', label: '3. Renewals by Operating Branch' },
  ],
  CLAIMS: [
    { value: 'all', label: '1. Claims Docket Master Register' },
    { value: 'awaiting_review', label: '2. Claims Awaiting Supervisor Review' },
    { value: 'awaiting_docs', label: '3. Claims Awaiting Documents' },
    { value: 'approved', label: '4. Approved Claims Awaiting/Paid' },
    { value: 'rejected', label: '5. Rejected Claims Docket' },
  ],
  PERFORMANCE: [
    { value: 'branch_matrix', label: '1. Monthly Branch Operational Matrix' },
    { value: 'turihamwe_activity', label: '2. Turihamwe Activity Breakdown' },
  ],
  AUDIT: [
    { value: 'all_logs', label: '1. Institutional Governance Audit Trail' },
    { value: 'member_changes', label: '2. Member Data Modifications' },
    { value: 'claims_actions', label: '3. Claims & Adjudication Actions' },
  ],
  SYSTEM: [
    { value: 'sync_health', label: '1. Branch Synchronization Status' },
    { value: 'events', label: '2. System Events & Infrastructure Health' },
  ],
};

export const ReportsView: React.FC = () => {
  const { user, workingBranch, hasPermission } = useAuth();

  // Navigation tabs within Reports
  const [activeTab, setActiveTab] = useState<'generate' | 'monthly_summary' | 'history'>('generate');

  // Permissions
  const canExport = hasPermission('reports.export');
  const canViewFinancial = hasPermission('reports.view_financial');
  const canMonthlyPerformance = hasPermission('reports.monthly_performance');

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>('MEMBERS');
  const [selectedSubType, setSelectedSubType] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Data & Results State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dataset, setDataset] = useState<any[]>([]);
  const [reportMetadata, setReportMetadata] = useState<{
    reportCode: string;
    reportTitle: string;
    category: string;
    branchName: string;
    generatedAt: string;
    generatedBy: string;
    canViewFinancial: boolean;
    recordCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Monthly Performance State
  const [monthlyYear, setMonthlyYear] = useState<number>(new Date().getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState<number>(new Date().getMonth() + 1);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyBranchSummary | null>(null);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState<boolean>(false);

  // Audit History State
  const [reportLogs, setReportLogs] = useState<ReportGenerationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Print ref
  const reportPrintRef = useRef<HTMLDivElement>(null);

  // Initialize branches and branch scope
  useEffect(() => {
    apiClient.getBranches().then(res => {
      if (res.success) {
        setBranches(res.data);
      }
    });

    if (user?.hasMultiBranchAccess) {
      setSelectedBranch('ALL');
    } else if (workingBranch) {
      setSelectedBranch(workingBranch.id);
    }
  }, [user, workingBranch]);

  // Handle Preset Date Ranges
  const handleApplyPreset = (preset: 'today' | 'this_month' | 'last_month' | 'this_quarter' | 'ytd') => {
    const now = new Date();
    let start = '';
    let end = now.toISOString().substring(0, 10);

    if (preset === 'today') {
      start = end;
    } else if (preset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
    } else if (preset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().substring(0, 10);
      end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().substring(0, 10);
    } else if (preset === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1).toISOString().substring(0, 10);
    } else if (preset === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1).toISOString().substring(0, 10);
    }

    setStartDate(start);
    setEndDate(end);
  };

  // Run Report Query
  const handleGenerateReport = async () => {
    setIsLoading(true);
    setExportFeedback(null);
    try {
      const res = await apiClient.getReportData({
        category: selectedCategory,
        subType: selectedSubType,
        branchId: selectedBranch === 'ALL' ? undefined : selectedBranch,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });

      if (res.success) {
        setDataset(res.data);
        setReportMetadata(res.metadata);
      }
    } catch (err) {
      console.error('Failed to run report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run Monthly Performance Summary
  const fetchMonthlySummary = async () => {
    setIsLoadingMonthly(true);
    try {
      const res = await apiClient.getMonthlyBranchSummary({
        branchId: selectedBranch === 'ALL' ? undefined : selectedBranch,
        year: monthlyYear,
        month: monthlyMonth,
      });
      if (res.success) {
        setMonthlySummary(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch monthly summary:', err);
    } finally {
      setIsLoadingMonthly(false);
    }
  };

  // Load Report Logs
  const fetchReportLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await apiClient.getReportLogs(
        selectedBranch === 'ALL' ? undefined : selectedBranch
      );
      if (res.success) {
        setReportLogs(res.data);
      }
    } catch (err) {
      console.error('Failed to load report logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'monthly_summary') {
      fetchMonthlySummary();
    } else if (activeTab === 'history') {
      fetchReportLogs();
    }
  }, [activeTab, selectedBranch, monthlyYear, monthlyMonth]);

  // Reset subtype when category changes
  useEffect(() => {
    const available = SUBTYPES_BY_CATEGORY[selectedCategory];
    if (available && available.length > 0) {
      setSelectedSubType(available[0].value);
    }
  }, [selectedCategory]);

  // Export to CSV
  const handleExportCSV = async () => {
    if (!canExport || dataset.length === 0 || !reportMetadata) return;

    // Collect headers from first row
    const keys = Object.keys(dataset[0]);
    const csvRows: string[] = [];

    // SACCO Official Header
    csvRows.push(`"NYAMUYANJA SACCO LTD - OFFICIAL REPORT"`);
    csvRows.push(`"Report: ${reportMetadata.reportTitle}"`);
    csvRows.push(`"Reference: ${reportMetadata.reportCode}"`);
    csvRows.push(`"Operating Branch: ${reportMetadata.branchName}"`);
    csvRows.push(`"Period: ${startDate && endDate ? `${startDate} to ${endDate}` : 'All Records'}"`);
    csvRows.push(`"Generated By: ${reportMetadata.generatedBy} (${user?.username})"`);
    csvRows.push(`"Generated At: ${new Date(reportMetadata.generatedAt).toLocaleString()}"`);
    csvRows.push(`"Record Count: ${reportMetadata.recordCount}"`);
    csvRows.push(''); // blank row

    // Table Header
    csvRows.push(keys.map(k => `"${k}"`).join(','));

    // Data rows
    for (const row of dataset) {
      const values = keys.map(k => {
        let val = row[k];
        if (val === undefined || val === null) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `${reportMetadata.reportCode}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Audit Log on backend
    try {
      await apiClient.exportReport({
        reportCode: reportMetadata.reportCode,
        reportTitle: reportMetadata.reportTitle,
        reportCategory: selectedCategory,
        exportFormat: 'CSV',
        recordCount: dataset.length,
        filterParams: { selectedCategory, selectedSubType, selectedBranch, startDate, endDate },
      });
      setExportFeedback(`Exported CSV successfully under ref ${reportMetadata.reportCode}. Action audited.`);
    } catch {
      // offline fallback
    }
  };

  // Export to Print / PDF
  const handlePrintPDF = async () => {
    if (!canExport || !reportMetadata) return;

    // Trigger Print
    window.print();

    // Log the print export
    try {
      await apiClient.exportReport({
        reportCode: reportMetadata.reportCode,
        reportTitle: reportMetadata.reportTitle,
        reportCategory: selectedCategory,
        exportFormat: 'PDF',
        recordCount: dataset.length,
        filterParams: { selectedCategory, selectedSubType, selectedBranch, startDate, endDate },
      });
      setExportFeedback(`Exported PDF/Print successfully under ref ${reportMetadata.reportCode}. Action audited.`);
    } catch {
      // offline fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-700" />
            Institutional Reports, Performance &amp; Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Official Nyamuyanja SACCO Management Intelligence • Multi-Branch Scoping • Financial Authorization Rules Enforced
          </p>
        </div>

        {/* Global Export actions */}
        {dataset.length > 0 && reportMetadata && canExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV / Excel
            </button>
            <button
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        )}
      </div>

      {/* Export Confirmation Feedback */}
      {exportFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportFeedback}</span>
          </div>
          <button onClick={() => setExportFeedback(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Top Level Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('generate')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'generate'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Institutional Report Register</span>
        </button>

        {canMonthlyPerformance && (
          <button
            onClick={() => setActiveTab('monthly_summary')}
            className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'monthly_summary'
                ? 'border-blue-700 text-blue-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Monthly Branch Performance Matrix</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'history'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Report Audit &amp; Export Journal</span>
        </button>
      </div>

      {/* TAB 1: INSTITUTIONAL REPORT REGISTER */}
      {activeTab === 'generate' && (
        <div className="space-y-5">
          {/* Filter Form Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="border-b pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Define Report Query Parameters</h2>
                <p className="text-[11px] text-slate-500">
                  Select module category, sub-report type, and authorized branch parameters.
                </p>
              </div>

              {/* Financial clearance badge */}
              {canViewFinancial ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                  <Receipt className="w-3 h-3 text-blue-700" />
                  Financial Clearance Active
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  Financial Columns Withheld
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Category */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Report Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value as ReportCategory)}
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900 font-medium"
                >
                  <option value="MEMBERS">Member Reports</option>
                  <option value="TURIHAMWE">Turihamwe Plan Reports</option>
                  <option value="CONTRIBUTIONS">Contribution Reports</option>
                  <option value="RENEWALS">Renewal Reports</option>
                  <option value="CLAIMS">Claim Docket Reports</option>
                  <option value="PERFORMANCE">Performance Reports</option>
                  <option value="AUDIT">Audit &amp; Governance Reports</option>
                  <option value="SYSTEM">System &amp; Sync Reports</option>
                </select>
              </div>

              {/* Sub-type */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Sub-Report Structure <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedSubType}
                  onChange={e => setSelectedSubType(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
                >
                  {(SUBTYPES_BY_CATEGORY[selectedCategory] || []).map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Scope */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">3. Operating Branch</label>
                  {!user?.hasMultiBranchAccess && (
                    <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  )}
                </div>
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  disabled={!user?.hasMultiBranchAccess}
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {user?.hasMultiBranchAccess && <option value="ALL">All Six Branches (Consolidated SACCO)</option>}
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Context Filter */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">4. Status Filter</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full p-2.5 border rounded-lg bg-white text-slate-900"
                >
                  <option value="ALL">All Statuses</option>
                  {selectedCategory === 'TURIHAMWE' && (
                    <>
                      <option value="ACTIVE">Active Policies</option>
                      <option value="PENDING">Pending Approval</option>
                      <option value="EXPIRED">Expired</option>
                      <option value="LAPSED">Lapsed</option>
                    </>
                  )}
                  {selectedCategory === 'CLAIMS' && (
                    <>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="AWAITING_DOCUMENTS">Awaiting Documents</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="CLOSED">Closed / Paid</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Date Range & Quick Presets */}
            <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Date Filters:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="p-1.5 border rounded-lg bg-white text-slate-800 font-mono text-xs"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="p-1.5 border rounded-lg bg-white text-slate-800 font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 text-[11px] mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('today')}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('this_month')}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('last_month')}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('this_quarter')}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                >
                  This Quarter
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('ytd')}
                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                >
                  YTD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-2 py-1 rounded text-slate-500 hover:text-slate-700 text-[11px]"
                >
                  Clear Dates
                </button>
              </div>

              <button
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold flex items-center justify-center gap-2 shadow-xs transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Generate Official Report</span>
              </button>
            </div>
          </div>

          {/* Report Output Card */}
          <div ref={reportPrintRef} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4 print:p-0 print:border-none">
            {isLoading ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                <RefreshCw className="w-8 h-8 text-blue-700 animate-spin mx-auto mb-3" />
                <p className="font-bold text-slate-800">Compiling Report Dataset...</p>
                <p className="text-slate-400 mt-1">Executing permission filters &amp; cryptographic audit record</p>
              </div>
            ) : reportMetadata ? (
              <>
                {/* Official Letterhead Header */}
                <div className="border-b pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-blue-900 tracking-wider">
                        Nyamuyanja SACCO Ltd • Turihamwe Management System
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                        {reportMetadata.reportTitle}
                      </h2>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <span>Scope: <strong className="text-slate-700">{reportMetadata.branchName}</strong></span>
                        <span>Date Range: <strong className="text-slate-700">{startDate && endDate ? `${startDate} to ${endDate}` : 'All Historical Records'}</strong></span>
                        <span>Generated by: <strong className="text-slate-700">{reportMetadata.generatedBy}</strong></span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 block sm:inline-block">
                        Ref: {reportMetadata.reportCode}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Timestamp: {new Date(reportMetadata.generatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Privacy Warning if financial is restricted */}
                {!canViewFinancial && (selectedCategory === 'CONTRIBUTIONS' || selectedCategory === 'PERFORMANCE') && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Notice: Monetary totals and contribution values are protected under institutional security policy.
                      Permission &apos;reports.view_financial&apos; is required to view financial sums.
                    </span>
                  </div>
                )}

                {/* Dataset Table */}
                <div className="overflow-x-auto">
                  {dataset.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No records matched the selected query parameters.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                        <tr>
                          {Object.keys(dataset[0]).map(col => (
                            <th key={col} className="px-4 py-2.5 whitespace-nowrap">
                              {col.replace(/([A-Z])/g, ' $1').toUpperCase()}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dataset.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            {Object.keys(dataset[0]).map(col => {
                              const val = row[col];
                              const isFinancialCol = col.toLowerCase().includes('amount') || col.toLowerCase().includes('ugx');

                              return (
                                <td key={col} className="px-4 py-2.5 whitespace-nowrap">
                                  {isFinancialCol && !canViewFinancial ? (
                                    <span className="text-[10px] text-slate-400 italic font-mono">
                                      [PROTECTED]
                                    </span>
                                  ) : typeof val === 'boolean' ? (
                                    val ? 'Yes' : 'No'
                                  ) : (
                                    String(val ?? '—')
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Footer summary */}
                <div className="pt-3 border-t text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Total Records: <strong className="text-slate-800">{dataset.length}</strong></span>
                  <span>End of Official Nyamuyanja SACCO Report Output</span>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs">
                <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-600">No report generated yet</p>
                <p className="text-slate-400 mt-1">
                  Configure your parameters above and click &quot;Generate Official Report&quot;.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MONTHLY PERFORMANCE MATRIX */}
      {activeTab === 'monthly_summary' && canMonthlyPerformance && (
        <div className="space-y-4">
          {/* Month/Year selector */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Year</label>
                <select
                  value={monthlyYear}
                  onChange={e => setMonthlyYear(parseInt(e.target.value, 10))}
                  className="p-2 border rounded-lg bg-white text-slate-900"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Month</label>
                <select
                  value={monthlyMonth}
                  onChange={e => setMonthlyMonth(parseInt(e.target.value, 10))}
                  className="p-2 border rounded-lg bg-white text-slate-900"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                  ].map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branch Scope</label>
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  disabled={!user?.hasMultiBranchAccess}
                  className="p-2 border rounded-lg bg-white text-slate-900 disabled:bg-slate-100"
                >
                  {user?.hasMultiBranchAccess && <option value="ALL">Consolidated (All Branches)</option>}
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={fetchMonthlySummary}
              disabled={isLoadingMonthly}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMonthly ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>

          {/* Performance Dashboard */}
          {isLoadingMonthly ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 text-blue-700 animate-spin mx-auto mb-2" />
              Loading Monthly Performance Matrix...
            </div>
          ) : monthlySummary ? (
            <div className="space-y-4">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-slate-500 font-semibold block">Active Turihamwe Policies</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{monthlySummary.activePlans}</div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Portfolio Total</span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-slate-500 font-semibold block">New Registrations MTD</span>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{monthlySummary.newRegistrations}</div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">This Accounting Month</span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-slate-500 font-semibold block">Renewals Executed MTD</span>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">{monthlySummary.renewalsCompleted}</div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Retained Policies</span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-slate-500 font-semibold block">Claims Submitted MTD</span>
                  <div className="text-2xl font-bold text-purple-700 mt-1">{monthlySummary.claimsSubmitted}</div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {monthlySummary.claimsApproved} approved / {monthlySummary.claimsSettled} settled
                  </span>
                </div>
              </div>

              {/* Financial Aggregate Block (Gated) */}
              {canViewFinancial ? (
                <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-blue-200 uppercase font-semibold text-[10px] tracking-wider block">
                      Audited Financial Flow (MTD)
                    </span>
                    <div className="text-2xl font-bold mt-1">
                      UGX {Number(monthlySummary.financials?.totalContributionsUGX || 0).toLocaleString()}
                    </div>
                    <span className="text-blue-300 text-[11px] mt-0.5 block">
                      Total contributions deposited across {monthlySummary.branchName}
                    </span>
                  </div>

                  <div className="bg-white/10 px-4 py-2.5 rounded-lg border border-white/20 text-right">
                    <span className="text-blue-200 block text-[10px] uppercase">Claims Settled Outflow</span>
                    <div className="text-lg font-bold">
                      UGX {Number(monthlySummary.financials?.benefitsPaidUGX || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-100 border border-dashed border-slate-300 text-slate-500 text-xs flex items-center justify-center gap-2">
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <span>Financial summaries are withheld. Requires permission &apos;reports.view_financial&apos;.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 3: REPORT AUDIT & EXPORT HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-500">
              Institutional Report Generation &amp; Export Audit Log • Preserves date, user, branch, and filters
            </p>
            <button
              onClick={fetchReportLogs}
              className="text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Log
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Report Reference</th>
                    <th className="px-4 py-3">Report Title</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Operating Branch</th>
                    <th className="px-4 py-3">Generated By</th>
                    <th className="px-4 py-3">Action Type</th>
                    <th className="px-4 py-3">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingLogs ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        <RefreshCw className="w-4 h-4 text-blue-600 animate-spin mx-auto mb-1" />
                        Loading report history...
                      </td>
                    </tr>
                  ) : reportLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                        No report generations logged yet.
                      </td>
                    </tr>
                  ) : (
                    reportLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {log.reportCode}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{log.reportTitle}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                            {log.reportCategory}
                          </span>
                        </td>
                        <td className="px-4 py-3">{log.branchName}</td>
                        <td className="px-4 py-3">{log.generatedByUserFullName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.isExport
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {log.isExport ? `EXPORTED (${log.exportFormat})` : 'GENERATED'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{log.recordCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
