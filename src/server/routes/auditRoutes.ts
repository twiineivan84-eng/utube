import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { AuditService } from '../services/auditService';

export const auditRouter = Router();

// View audit logs - protected by audit.view_logs permission
// Supports filtering by: date range, user, branch, action, entity, record/reference, search query
auditRouter.get('/', requireAuth, requirePermission('audit.view_logs'), (req: AuthenticatedRequest, res: Response) => {
  const branchId = req.query.branchId as string;
  const userId = req.query.userId as string;
  const action = req.query.action as string;
  const recordType = req.query.recordType as string;
  const recordId = req.query.recordId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const searchQuery = req.query.q as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;

  // Single-branch non-auditor users can only view their own working branch logs
  const isAuditorOrGM =
    req.effectivePermissions?.includes('admin.system_settings') ||
    req.effectivePermissions?.includes('reports.view_financial') ||
    req.user?.hasMultiBranchAccess;

  const targetBranchId = isAuditorOrGM ? branchId : req.workingBranch?.id;

  const logs = AuditService.getLogs({
    branchId: targetBranchId,
    userId,
    action,
    recordType,
    recordId,
    startDate,
    endDate,
    searchQuery,
    limit,
  });

  res.json({
    success: true,
    data: logs,
    total: logs.length,
  });
});

// Detailed inspection of specific audit log entry
auditRouter.get('/:id', requireAuth, requirePermission('audit.view_logs'), (req: AuthenticatedRequest, res: Response) => {
  const log = AuditService.getLogById(req.params.id);
  if (!log) {
    res.status(404).json({ success: false, message: 'Audit log record not found.' });
    return;
  }

  // Branch isolation verification
  const isAuditorOrGM =
    req.effectivePermissions?.includes('admin.system_settings') ||
    req.effectivePermissions?.includes('reports.view_financial') ||
    req.user?.hasMultiBranchAccess;

  if (!isAuditorOrGM && log.branchId !== req.workingBranch?.id) {
    res.status(403).json({ success: false, message: 'Access to this branch audit record is restricted.' });
    return;
  }

  res.json({
    success: true,
    data: log,
  });
});

// Export audit logs report (audits the export action itself)
auditRouter.post('/export', requireAuth, requirePermission('audit.view_logs'), (req: AuthenticatedRequest, res: Response) => {
  const { format, branchId, startDate, endDate, action, recordType } = req.body;

  const isAuditorOrGM =
    req.effectivePermissions?.includes('admin.system_settings') ||
    req.effectivePermissions?.includes('reports.view_financial') ||
    req.user?.hasMultiBranchAccess;

  const targetBranchId = isAuditorOrGM ? branchId : req.workingBranch?.id;

  const logs = AuditService.getLogs({
    branchId: targetBranchId,
    action,
    recordType,
    startDate,
    endDate,
    limit: 1000,
  });

  // Log the export event in audit trail
  AuditService.log({
    userId: req.user!.id,
    username: req.user!.username,
    userFullName: req.user!.fullName,
    branchId: req.workingBranch!.id,
    branchName: req.workingBranch!.name,
    action: 'REPORT_EXPORTED',
    recordType: 'AUDIT',
    newValue: `Exported ${logs.length} audit records in ${format || 'CSV'} format`,
    reason: `Institutional audit log extraction (${startDate || 'All'} to ${endDate || 'Current'})`,
  });

  res.json({
    success: true,
    data: logs,
    count: logs.length,
    format: format || 'CSV',
    exportedAt: new Date().toISOString(),
  });
});
