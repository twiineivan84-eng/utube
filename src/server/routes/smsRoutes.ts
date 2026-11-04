import { Router, Response } from 'express';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { serverStore } from '../storage/serverStore';
import { config } from '../config';
import { AuditService } from '../services/auditService';
import { SmsService } from '../services/smsService';
import { AfricasTalkingAdapter } from '../services/africasTalkingAdapter';
import { PandoraAdapter } from '../services/pandoraAdapter';
import { smsQueueWorker } from '../services/smsQueueWorker';
import { SmsTemplate, SmsMessage } from '../../types';

export const smsRouter = Router();

smsRouter.use(requireAuth);

// ==========================================
// 1. GET SMS TEMPLATES
// ==========================================
smsRouter.get('/templates', (req: AuthenticatedRequest, res: Response) => {
  const category = req.query.category as string | undefined;
  const branchId = req.workingBranch?.id;

  const templates = serverStore.getSmsTemplates({
    category,
    branchId: req.user?.hasMultiBranchAccess ? undefined : branchId,
  });

  res.json({ success: true, data: templates });
});

// ==========================================
// 2. CREATE SMS TEMPLATE
// ==========================================
smsRouter.post('/templates', requirePermission('sms.manage_templates'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { code, name, category, templateText, availableVariables } = req.body;

  if (!code || !name || !category || !templateText) {
    res.status(400).json({ success: false, error: 'code, name, category, and templateText are required' });
    return;
  }

  const newTemplate: SmsTemplate = {
    id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    code: code.toUpperCase().trim(),
    name: name.trim(),
    category,
    templateText: templateText.trim(),
    availableVariables: Array.isArray(availableVariables) ? availableVariables : ['[Member Name]', '[Expiry Date]', '[Branch]'],
    isActive: true,
    createdByUserId: user.id,
    createdByUserFullName: user.fullName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverStore.addSmsTemplate(newTemplate);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: req.workingBranch?.id || 'ALL',
    branchName: req.workingBranch?.name || 'Central Head Office',
    action: 'SMS_TEMPLATE_CREATED',
    recordType: 'SMS_TEMPLATE',
    recordId: newTemplate.id,
    newValue: JSON.stringify(newTemplate),
    reason: `Created SMS template '${newTemplate.name}'`,
  });

  res.status(201).json({ success: true, data: newTemplate });
});

// ==========================================
// 3. UPDATE SMS TEMPLATE
// ==========================================
smsRouter.put('/templates/:id', requirePermission('sms.manage_templates'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const template = serverStore.getSmsTemplateById(id);

  if (!template) {
    res.status(404).json({ success: false, error: 'Template not found' });
    return;
  }

  const { name, templateText, isActive, availableVariables } = req.body;
  const prev = JSON.stringify(template);

  if (name) template.name = name.trim();
  if (templateText) template.templateText = templateText.trim();
  if (isActive !== undefined) template.isActive = Boolean(isActive);
  if (Array.isArray(availableVariables)) template.availableVariables = availableVariables;

  template.updatedByUserId = user.id;
  template.updatedByUserFullName = user.fullName;
  template.updatedAt = new Date().toISOString();

  serverStore.updateSmsTemplate(template);

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: req.workingBranch?.id || 'ALL',
    branchName: req.workingBranch?.name || 'Central Head Office',
    action: 'SMS_TEMPLATE_UPDATED',
    recordType: 'SMS_TEMPLATE',
    recordId: template.id,
    previousValue: prev,
    newValue: JSON.stringify(template),
    reason: `Updated SMS template '${template.name}'`,
  });

  res.json({ success: true, data: template });
});

// ==========================================
// 4. GET SMS QUEUE / LOGS
// ==========================================
smsRouter.get('/queue', requirePermission('sms.view_queue'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const status = req.query.status as string | undefined;
  const searchQuery = req.query.searchQuery as string | undefined;
  const saccoAccountNumber = req.query.saccoAccountNumber as string | undefined;

  let branchId = req.query.branchId as string | undefined;
  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const messages = serverStore.getSmsMessages({
    branchId: branchId || undefined,
    status: status || undefined,
    searchQuery: searchQuery || undefined,
    saccoAccountNumber: saccoAccountNumber || undefined,
  });

  res.json({ success: true, data: messages, total: messages.length });
});

// ==========================================
// 5. SEND / QUEUE INDIVIDUAL SMS
// ==========================================
smsRouter.post('/send', requirePermission('sms.send'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;

  if (!workingBranch) {
    res.status(400).json({ success: false, error: 'No active operating branch context' });
    return;
  }

  const {
    recipientPhone,
    recipientName,
    messageText,
    saccoAccountNumber,
    planId,
    claimId,
    eventReferenceKey,
    templateCategory,
    dispatchImmediately,
  } = req.body;

  if (!recipientPhone || !recipientName || !messageText) {
    res.status(400).json({ success: false, error: 'recipientPhone, recipientName, and messageText are required' });
    return;
  }

  const queueResult = SmsService.queueMessage({
    recipientPhone,
    recipientName,
    messageText,
    branchId: workingBranch.id,
    branchName: workingBranch.name,
    queuedByUserId: user.id,
    queuedByUserFullName: user.fullName,
    saccoAccountNumber,
    planId,
    claimId,
    eventReferenceKey,
    templateCategory,
  });

  if (queueResult.isDuplicate) {
    res.status(409).json({ success: false, error: queueResult.duplicateReason, isDuplicate: true });
    return;
  }

  const queued = queueResult.message!;

  if (dispatchImmediately) {
    const dispatchResult = await SmsService.dispatchMessage(queued.id);
    res.json({
      success: dispatchResult.success,
      data: dispatchResult.message,
      message: dispatchResult.success ? 'SMS dispatched successfully via Africa\'s Talking.' : `SMS queued with failure: ${dispatchResult.error}`,
    });
    return;
  }

  res.status(201).json({
    success: true,
    data: queued,
    message: 'SMS notification queued successfully for transmission.',
  });
});

// ==========================================
// 6. RETRY FAILED SMS
// ==========================================
smsRouter.post('/queue/:id/retry', requirePermission('sms.retry_failed'), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const sms = serverStore.getSmsById(id);
  if (!sms) {
    res.status(404).json({ success: false, error: 'SMS record not found' });
    return;
  }

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: sms.branchId,
    branchName: sms.branchName,
    action: 'SMS_RETRIED',
    recordType: 'SMS',
    recordId: sms.id,
    reason: `Manual retry initiated by ${user.fullName}`,
  });

  const result = await SmsService.dispatchMessage(sms.id);
  res.json({
    success: result.success,
    data: result.message,
    message: result.success ? 'Message successfully dispatched upon retry.' : `Retry attempted: ${result.error}`,
  });
});

// ==========================================
// 7. BATCH PROCESS QUEUE
// ==========================================
smsRouter.post('/process-queue', requirePermission('sms.send'), async (_req: AuthenticatedRequest, res: Response) => {
  const result = await SmsService.processQueue();
  res.json({
    success: true,
    data: result,
    message: `Processed ${result.processed} queued messages: ${result.sent} sent, ${result.failed} failed.`,
  });
});

// ==========================================
// 8. GET NOTIFICATION EVENTS HISTORY
// ==========================================
smsRouter.get('/notifications', requirePermission('sms.view_notifications'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  let branchId = req.query.branchId as string | undefined;

  if (!user.hasMultiBranchAccess && workingBranch) {
    branchId = workingBranch.id;
  }

  const events = serverStore.getNotificationEvents({
    branchId: branchId || undefined,
    eventType: (req.query.eventType as string) || undefined,
  });

  res.json({ success: true, data: events, total: events.length });
});

// ==========================================
// 9. EVALUATE AUTOMATED EXPIRY EVENTS
// ==========================================
smsRouter.post('/evaluate-expiries', requirePermission('sms.configure_events'), (_req: AuthenticatedRequest, res: Response) => {
  const result = SmsService.evaluateExpiryNotificationEvents();
  res.json({
    success: true,
    data: result,
    message: `Evaluated policies: generated ${result.eventsCreated} notification events, queued ${result.messagesQueued} SMS messages.`,
  });
});

// ==========================================
// 10. GET PROVIDER DIAGNOSTICS
// ==========================================
smsRouter.get('/diagnostics', requirePermission('sms.view_queue'), (_req: AuthenticatedRequest, res: Response) => {
  const diagnostics = smsQueueWorker.getDiagnostics();
  res.json({
    success: true,
    data: diagnostics,
  });
});

// ==========================================
// 10B. GET / SET ACTIVE PROVIDER
// ==========================================
smsRouter.get('/provider', requirePermission('sms.view_queue'), (_req: AuthenticatedRequest, res: Response) => {
  const activeProvider = serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA';
  res.json({
    success: true,
    provider: activeProvider,
    activeSenderId: activeProvider === 'PANDORA' ? config.sms.pandora.senderId : config.sms.senderId,
  });
});

smsRouter.post('/provider', requirePermission('admin.system_settings'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const { provider } = req.body;

  if (!['PANDORA', 'AFRICAS_TALKING'].includes(provider)) {
    res.status(400).json({ success: false, error: "Invalid provider. Must be 'PANDORA' or 'AFRICAS_TALKING'." });
    return;
  }

  serverStore.updateSystemSettings({ 'sms.provider': provider });

  AuditService.log({
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    branchId: workingBranch?.id || 'ALL',
    branchName: workingBranch?.name || 'Central Head Office',
    action: 'SYSTEM_SETTING_CHANGED',
    recordType: 'SMS',
    recordId: 'sms.provider',
    newValue: provider,
    reason: `Switched active SMS dispatch provider to ${provider}`,
  });

  res.json({
    success: true,
    provider,
    message: `Active SMS gateway provider successfully switched to ${provider}.`,
  });
});

// ==========================================
// 11. TEST PROVIDER CONNECTION (SAFE: NO SMS SENT)
// ==========================================
smsRouter.post('/test-connection', requirePermission('sms.view_queue'), async (req: AuthenticatedRequest, res: Response) => {
  const targetProvider = (req.body?.provider || serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'PANDORA' | 'AFRICAS_TALKING';

  const result = targetProvider === 'PANDORA'
    ? await PandoraAdapter.testConnection()
    : await AfricasTalkingAdapter.testConnection();

  res.json({
    success: result.connected,
    provider: targetProvider,
    data: result,
    message: result.message,
  });
});

// ==========================================
// 12. EXPLICIT ADMIN TEST DISPATCH (SANDBOX/LIVE)
// ==========================================
smsRouter.post('/test-send', requirePermission('sms.send'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const workingBranch = req.workingBranch;
  const { recipientPhone, confirmSandboxTest } = req.body;

  if (!confirmSandboxTest) {
    res.status(400).json({ success: false, error: 'Administrative confirmation required to execute provider test dispatch.' });
    return;
  }

  if (!recipientPhone) {
    res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    return;
  }

  const formattedPhone = SmsService.formatUgandanPhone(recipientPhone);
  const activeProvider = (req.body?.provider || serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'PANDORA' | 'AFRICAS_TALKING';

  const validation = activeProvider === 'PANDORA'
    ? PandoraAdapter.validateConfiguration()
    : AfricasTalkingAdapter.validateConfiguration();

  if (!validation.canSubmit) {
    res.status(400).json({
      success: false,
      error: validation.message,
      configurationStatus: validation.status,
      provider: activeProvider,
    });
    return;
  }

  const testMessageText = `[ADMIN DIAGNOSTIC TEST] Nyamuyanja SACCO Turihamwe SMS delivery test via ${activeProvider === 'PANDORA' ? 'Pandora Networks' : "Africa's Talking"} at ${new Date().toLocaleTimeString()}.`;

  const queueResult = SmsService.queueMessage({
    recipientPhone: formattedPhone,
    recipientName: `Test Recipient (${user.username})`,
    messageText: testMessageText,
    branchId: workingBranch?.id || 'br-nya',
    branchName: workingBranch?.name || 'Central Head Office',
    queuedByUserId: user.id,
    queuedByUserFullName: user.fullName,
    eventReferenceKey: `ADMIN-TEST-${Date.now()}`,
    templateCategory: 'CUSTOM_ANNOUNCEMENT',
  });

  if (queueResult.isDuplicate || !queueResult.message) {
    res.status(409).json({ success: false, error: 'Duplicate test dispatch prevented.' });
    return;
  }

  const dispatchResult = await SmsService.dispatchMessage(queueResult.message.id);

  res.json({
    success: dispatchResult.success,
    data: dispatchResult.message,
    message: dispatchResult.success
      ? `Provider accepted test message (ID: ${dispatchResult.message.providerMessageId}).`
      : `Provider rejected dispatch: ${dispatchResult.error}`,
  });
});

// ==========================================
// 13. WORKER CONTROL: START / STOP
// ==========================================
smsRouter.post('/worker/start', requirePermission('admin.system_settings'), (_req: AuthenticatedRequest, res: Response) => {
  smsQueueWorker.start();
  res.json({
    success: true,
    message: 'SMS Queue Worker started successfully.',
    workerStatus: smsQueueWorker.getStatus(),
  });
});

smsRouter.post('/worker/stop', requirePermission('admin.system_settings'), (_req: AuthenticatedRequest, res: Response) => {
  smsQueueWorker.stop();
  res.json({
    success: true,
    message: 'SMS Queue Worker stopped.',
    workerStatus: smsQueueWorker.getStatus(),
  });
});

// ==========================================
// 14. AFRICA'S TALKING DELIVERY REPORT (DLR) CALLBACK
// ==========================================
/**
 * Africa's Talking Delivery Reports (DLR) Webhook.
 * Official specification:
 * POST parameters (application/x-www-form-urlencoded or JSON):
 * - id: unique message ID returned during submission (e.g. ATXid_...)
 * - status: 'Success' | 'Sent' | 'Submitted' | 'Buffered' | 'Rejected' | 'Failed' | 'AbsentSubscriber' | 'Expired'
 * - phoneNumber: recipient's phone number
 * - networkCode: telco network operator code (e.g. 64101)
 * - failureReason: optional failure explanation
 */
const handleDeliveryReport = (req: any, res: Response) => {
  // Validate optional secret token if configured on backend
  const callbackToken = process.env.SMS_CALLBACK_TOKEN;
  if (callbackToken) {
    const providedToken = req.query.token || req.headers['x-callback-token'];
    if (providedToken !== callbackToken) {
      res.status(401).json({ success: false, error: 'Unauthorized delivery report callback' });
      return;
    }
  }

  const { id, status, phoneNumber, networkCode, failureReason } = req.body;

  if (!id || !status) {
    res.status(400).json({ success: false, error: 'id and status parameters are required' });
    return;
  }

  const result = SmsService.processDeliveryReport({
    id,
    status,
    phoneNumber,
    networkCode,
    failureReason,
  });

  if (!result.found) {
    res.status(200).json({
      success: true,
      message: 'Delivery report received but no matching internal message found',
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: result.isIdempotent
      ? 'Delivery report already processed (idempotent)'
      : `Delivery report for message ${id} updated to ${status}`,
    deliveryConfirmed: result.message?.deliveryConfirmed ?? false,
  });
};

smsRouter.post('/delivery-report', handleDeliveryReport);
smsRouter.post('/callback', handleDeliveryReport);

