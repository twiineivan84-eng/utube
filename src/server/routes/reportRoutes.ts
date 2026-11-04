import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { ReportCategory, ReportGenerationLog } from '../../types';
import { getUgandaDateString, getUgandaYearMonth } from '../../utils/timezone';

export const reportRouter = Router();

reportRouter.use(requireAuth);

// ==========================================
// 1. GET MONTHLY PERFORMANCE SUMMARY
// ==========================================
reportRouter.get('/summary', requirePermission('reports.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const currentUgandaYm = getUgandaYearMonth();
  const year = req.query.year ? parseInt(req.query.year as string, 10) : currentUgandaYm.year;
  const month = req.query.month ? parseInt(req.query.month as string, 10) : currentUgandaYm.month;

  const canViewFinancial = Boolean(
    req.effectivePermissions?.includes('reports.view_financial') ||
    user.roleId === 'role-gm' ||
    user.roleId === 'role-accounts' ||
    user.roleId === 'role-auditor'
  );

  const summary = serverStore.getMonthlyBranchSummary({
    branchId: branchId || undefined,
    year,
    month,
    canViewFinancial,
  });

  res.json({
    success: true,
    data: summary,
    canViewFinancial,
  });
});

// ==========================================
// 2. RUN REPORT QUERY (8 CATEGORIES)
// ==========================================
reportRouter.get('/data', requirePermission('reports.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const category = (req.query.category as ReportCategory) || 'MEMBERS';
  const subType = req.query.subType as string || 'default';
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const canViewFinancial = Boolean(
    req.effectivePermissions?.includes('reports.view_financial') ||
    user.roleId === 'role-gm' ||
    user.roleId === 'role-accounts' ||
    user.roleId === 'role-auditor'
  );

  let dataset: any[] = [];
  let reportTitle = '';

  switch (category) {
    // ----------------------------------------
    // MEMBER REPORTS
    // ----------------------------------------
    case 'MEMBERS': {
      reportTitle = 'Member Registration & Portfolio Report';
      let members = serverStore.getMembers();
      if (branchId) members = members.filter(m => m.branchId === branchId);
      if (startDate) members = members.filter(m => m.registrationDate >= startDate);
      if (endDate) members = members.filter(m => m.registrationDate <= endDate);

      if (subType === 'by_branch') {
        const branchCounts: Record<string, { branchName: string; count: number; members: any[] }> = {};
        for (const m of members) {
          const bId = m.branchId || 'unassigned';
          if (!branchCounts[bId]) {
            branchCounts[bId] = { branchName: m.branchName || 'Unassigned', count: 0, members: [] };
          }
          branchCounts[bId].count++;
          branchCounts[bId].members.push(m);
        }
        dataset = Object.entries(branchCounts).map(([bId, val]) => ({
          branchId: bId,
          branchName: val.branchName,
          memberCount: val.count,
        }));
      } else {
        dataset = members.map(m => ({
          saccoAccountNumber: m.saccoAccountNumber,
          fullName: m.fullName,
          branchName: m.branchName,
          contactPhone: m.primaryPhone,
          membershipStatus: m.turihamweStatus || 'ACTIVE',
          registrationDate: m.registrationDate,
          idType: 'NATIONAL_ID',
          idNumber: m.nationalIdNumber,
        }));
      }
      break;
    }

    // ----------------------------------------
    // TURIHAMWE POLICY REPORTS
    // ----------------------------------------
    case 'TURIHAMWE': {
      reportTitle = 'Turihamwe Insurance Policy Register';
      let plans = serverStore.getPlans();
      if (branchId) plans = plans.filter(p => p.registeredBranchId === branchId);
      if (status && status !== 'ALL') plans = plans.filter(p => p.status === status);
      if (startDate) plans = plans.filter(p => p.effectiveStartDate >= startDate);
      if (endDate) plans = plans.filter(p => p.currentExpiryDate <= endDate);

      dataset = plans.map(p => {
        const base: any = {
          planId: p.id,
          planCode: p.planCode,
          saccoAccountNumber: p.saccoAccountNumber,
          memberName: p.memberName,
          branchName: p.registeredBranchName,
          status: p.status,
          effectiveStartDate: p.effectiveStartDate,
          currentExpiryDate: p.currentExpiryDate,
          beneficiaryCount: p.beneficiaryCount,
        };
        if (canViewFinancial) {
          base.totalContributionsAmount = p.totalContributionsAmount;
        }
        return base;
      });
      break;
    }

    // ----------------------------------------
    // CONTRIBUTION REPORTS (FINANCIAL CONTROLLED)
    // ----------------------------------------
    case 'CONTRIBUTIONS': {
      reportTitle = 'Turihamwe Contributions & Ledger Statement';
      let contribs = serverStore.getContributions().filter(c => c.status === 'CONFIRMED' || c.status === 'RECORDED');
      if (branchId) contribs = contribs.filter(c => c.branchId === branchId);
      if (startDate) contribs = contribs.filter(c => c.contributionDate >= startDate);
      if (endDate) contribs = contribs.filter(c => c.contributionDate <= endDate);

      dataset = contribs.map(c => ({
        receiptNumber: c.receiptNumber,
        contributionDate: c.contributionDate,
        saccoAccountNumber: c.saccoAccountNumber,
        memberName: c.memberName,
        branchName: c.branchName,
        paymentChannel: c.paymentMethod,
        receivedByStaff: c.receivedByUsername,
        amountUGX: canViewFinancial ? c.amount : '[PROTECTED: Permission reports.view_financial required]',
      }));
      break;
    }

    // ----------------------------------------
    // RENEWAL REPORTS
    // ----------------------------------------
    case 'RENEWALS': {
      reportTitle = 'Turihamwe Policy Renewals & Retention Report';
      let renewals = serverStore.getRenewals();
      if (branchId) renewals = renewals.filter(r => r.branchId === branchId);
      if (startDate) renewals = renewals.filter(r => r.renewalDate >= startDate);
      if (endDate) renewals = renewals.filter(r => r.renewalDate <= endDate);

      dataset = renewals.map(r => ({
        renewalReference: r.renewalReference,
        renewalDate: r.renewalDate,
        saccoAccountNumber: r.saccoAccountNumber,
        memberName: r.memberName,
        branchName: r.branchName,
        previousExpiryDate: r.previousExpiryDate,
        newExpiryDate: r.newExpiryDate,
        processedByStaff: r.processedByUsername,
        amountPaidUGX: canViewFinancial ? (r.renewalFee || 0) : '[PROTECTED]',
      }));
      break;
    }

    // ----------------------------------------
    // CLAIM REPORTS
    // ----------------------------------------
    case 'CLAIMS': {
      reportTitle = 'Turihamwe Claims Docket Register';
      let claims = serverStore.getClaims();
      if (branchId) claims = claims.filter(c => c.branchId === branchId);
      if (status && status !== 'ALL') claims = claims.filter(c => c.status === status);
      if (startDate) claims = claims.filter(c => c.claimDate >= startDate);
      if (endDate) claims = claims.filter(c => c.claimDate <= endDate);

      dataset = claims.map(c => ({
        claimReference: c.claimReference,
        claimDate: c.claimDate,
        saccoAccountNumber: c.saccoAccountNumber,
        memberName: c.memberName,
        beneficiaryName: c.beneficiaryName || 'Principal Member',
        branchName: c.branchName,
        category: c.claimCategory,
        status: c.status,
        incidentDate: c.incidentDate,
        preparer: c.preparerFullName,
        documentsAttached: c.supportingDocuments.length,
        paymentReference: canViewFinancial && c.paymentInfo ? c.paymentInfo.paymentReference : undefined,
      }));
      break;
    }

    // ----------------------------------------
    // PERFORMANCE REPORTS
    // ----------------------------------------
    case 'PERFORMANCE': {
      reportTitle = 'Monthly Branch Operational Performance Matrix';
      const branches = serverStore.getBranches();
      const { year: currentYear, month: currentMonth } = getUgandaYearMonth();

      dataset = branches.map(b => {
        const s = serverStore.getMonthlyBranchSummary({
          branchId: b.id,
          year: currentYear,
          month: currentMonth,
          canViewFinancial,
        });
        return {
          branchName: b.name,
          branchCode: b.code,
          activePlans: s.activePlans,
          newRegistrations: s.newRegistrations,
          renewalsCompleted: s.renewalsCompleted,
          claimsSubmitted: s.claimsSubmitted,
          claimsApproved: s.claimsApproved,
          claimsSettled: s.claimsSettled,
          smsDispatched: s.smsDispatched,
          totalContributionsUGX: canViewFinancial && s.financials ? s.financials.totalContributionsUGX : '[PROTECTED]',
        };
      });
      break;
    }

    // ----------------------------------------
    // AUDIT REPORTS
    // ----------------------------------------
    case 'AUDIT': {
      reportTitle = 'Institutional Governance & Audit Trail';
      let logs = serverStore.getAuditLogs({
        branchId: branchId || undefined,
        limit: 200,
      });
      if (startDate) logs = logs.filter(l => getUgandaDateString(l.timestamp) >= startDate);
      if (endDate) logs = logs.filter(l => getUgandaDateString(l.timestamp) <= endDate);

      dataset = logs.map(l => ({
        timestamp: l.timestamp,
        username: l.username,
        userFullName: l.userFullName,
        branchName: l.branchName,
        action: l.action,
        recordType: l.recordType,
        recordId: l.recordId,
        reason: l.reason,
      }));
      break;
    }

    // ----------------------------------------
    // SYSTEM REPORTS
    // ----------------------------------------
    case 'SYSTEM': {
      reportTitle = 'System Synchronization & Infrastructure Health';
      const syncRecords = serverStore.getSyncRecords();
      dataset = syncRecords.map(s => ({
        timestamp: s.localTimestamp,
        branchId: s.branchId,
        operation: s.operation,
        entityType: s.entityType,
        entityId: s.entityId,
        status: s.status,
        retryCount: s.retryCount,
      }));
      break;
    }
  }

  // Record Report Generation Log
  const reportLog: ReportGenerationLog = {
    id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    reportCode: `REP-${category}-${Date.now().toString().slice(-4)}`,
    reportTitle,
    reportCategory: category,
    branchId: branchId || 'ALL',
    branchName: branchId ? (serverStore.getBranchById(branchId)?.name || 'Branch') : 'Consolidated SACCO',
    generatedByUserId: user.id,
    generatedByUsername: user.username,
    generatedByUserFullName: user.fullName,
    dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All Historical Records',
    filterParamsJson: JSON.stringify({ category, subType, startDate, endDate, status, branchId }),
    isExport: false,
    recordCount: dataset.length,
    timestamp: new Date().toISOString(),
  };

  serverStore.addReportLog(reportLog);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: reportLog.branchId,
    branchName: reportLog.branchName,
    action: 'REPORT_GENERATED',
    recordType: 'REPORT',
    recordId: reportLog.reportCode,
    newValue: JSON.stringify({ category, recordCount: dataset.length, canViewFinancial }),
    reason: `Generated ${reportTitle}`,
  });

  res.json({
    success: true,
    metadata: {
      reportCode: reportLog.reportCode,
      reportTitle,
      category,
      branchName: reportLog.branchName,
      generatedAt: reportLog.timestamp,
      generatedBy: user.fullName,
      canViewFinancial,
      recordCount: dataset.length,
    },
    data: dataset,
  });
});

// ==========================================
// 3. EXPORT REPORT (EXCEL / PDF)
// ==========================================
reportRouter.post('/export', requirePermission('reports.export'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const { reportCode, reportTitle, reportCategory, exportFormat, recordCount, filterParams } = req.body;

  const log: ReportGenerationLog = {
    id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    reportCode: reportCode || `EXP-${Date.now().toString().slice(-4)}`,
    reportTitle: reportTitle || 'Official Export',
    reportCategory: reportCategory || 'MEMBERS',
    branchId: workingBranch?.id || 'ALL',
    branchName: workingBranch?.name || 'Consolidated SACCO',
    generatedByUserId: user.id,
    generatedByUsername: user.username,
    generatedByUserFullName: user.fullName,
    dateRange: filterParams?.dateRange || 'Current View',
    filterParamsJson: JSON.stringify(filterParams || {}),
    isExport: true,
    exportFormat: exportFormat || 'EXCEL',
    recordCount: recordCount || 0,
    timestamp: new Date().toISOString(),
  };

  serverStore.addReportLog(log);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: log.branchId,
    branchName: log.branchName,
    action: 'REPORT_EXPORTED',
    recordType: 'REPORT',
    recordId: log.reportCode,
    newValue: JSON.stringify({ format: log.exportFormat, title: log.reportTitle, count: log.recordCount }),
    reason: `Report exported as ${log.exportFormat} by ${user.fullName}`,
  });

  res.json({
    success: true,
    data: log,
    message: `Report export logged successfully under reference ${log.reportCode}.`,
  });
});

// ==========================================
// 4. GET REPORT GENERATION HISTORY
// ==========================================
reportRouter.get('/logs', requirePermission('reports.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const logs = serverStore.getReportLogs({
    branchId: branchId || undefined,
    reportCategory: (req.query.category as string) || undefined,
    limit: 50,
  });

  res.json({ success: true, data: logs });
});
