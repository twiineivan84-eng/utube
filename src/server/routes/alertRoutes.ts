import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { AuditService } from '../services/auditService';
import { SystemAlert, AlertStatus } from '../../types';

export const alertRouter = Router();

alertRouter.use(requireAuth);

// ==========================================
// 1. GET SYSTEM ALERTS (PERMISSION & BRANCH SCOPED)
// ==========================================
alertRouter.get('/', requirePermission('alerts.view'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const status = req.query.status as AlertStatus | undefined;
  const category = req.query.category as string | undefined;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  let alerts = serverStore.getAlerts({
    branchId: branchId || undefined,
    status,
    category,
  });

  // Filter alerts by user permissions: only show alerts user is authorized to act on
  if (req.effectivePermissions) {
    alerts = alerts.filter(a => {
      if (!a.requiredPermission) return true;
      return req.effectivePermissions!.includes(a.requiredPermission);
    });
  }

  const unreadCount = alerts.filter(a => a.status === 'UNREAD').length;

  res.json({
    success: true,
    data: alerts,
    unreadCount,
    total: alerts.length,
  });
});

// ==========================================
// 2. MARK ALERT AS READ
// ==========================================
alertRouter.post('/:id/read', requirePermission('alerts.view'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const alert = serverStore.getAlertById(id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }

  serverStore.markAlertRead(id, user.id);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: alert.branchId,
    branchName: alert.branchName,
    action: 'ALERT_DISMISSED',
    recordType: 'ALERT',
    recordId: alert.id,
    reason: `User acknowledged notification alert '${alert.title}'`,
  });

  res.json({ success: true, message: 'Alert marked as read' });
});

// ==========================================
// 3. RESOLVE ALERT
// ==========================================
alertRouter.post('/:id/resolve', requirePermission('alerts.manage'), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const alert = serverStore.getAlertById(id);
  if (!alert) {
    res.status(404).json({ success: false, error: 'Alert not found' });
    return;
  }

  serverStore.resolveAlert(id, user.id);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: alert.branchId,
    branchName: alert.branchName,
    action: 'ALERT_RESOLVED',
    recordType: 'ALERT',
    recordId: alert.id,
    reason: `Operational alert '${alert.title}' resolved by officer`,
  });

  res.json({ success: true, message: 'Alert marked as resolved' });
});

// ==========================================
// 4. CREATE ALERT (SYSTEM OR MANUAL)
// ==========================================
alertRouter.post('/', requirePermission('alerts.manage'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  const { category, severity, title, message, linkTab, recordId, requiredPermission } = req.body;

  if (!category || !title || !message) {
    res.status(400).json({ success: false, error: 'category, title, and message are required' });
    return;
  }

  const newAlert: SystemAlert = {
    id: `alt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    category,
    severity: severity || 'INFO',
    title: title.trim(),
    message: message.trim(),
    branchId: workingBranch?.id || 'ALL',
    branchName: workingBranch?.name || 'Consolidated SACCO',
    linkTab,
    recordId,
    requiredPermission,
    status: 'UNREAD',
    readByUsers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverStore.addAlert(newAlert);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: newAlert.branchId,
    branchName: newAlert.branchName,
    action: 'ALERT_CREATED',
    recordType: 'ALERT',
    recordId: newAlert.id,
    newValue: JSON.stringify(newAlert),
    reason: `Manual operational alert created by ${user.fullName}`,
  });

  res.status(201).json({ success: true, data: newAlert });
});
