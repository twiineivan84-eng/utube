import { SmsMessage, SmsTemplate, NotificationEvent, TurihamwePlan, SaccoMember, TurihamweClaim } from '../../types';
import { serverStore } from '../storage/serverStore';
import { AuditService } from './auditService';
import { config } from '../config';
import { AfricasTalkingAdapter } from './africasTalkingAdapter';
import { PandoraAdapter } from './pandoraAdapter';
import { smsQueueWorker } from './smsQueueWorker';
import { diffInUgandaCalendarDays, getUgandaDateString } from '../../utils/timezone';

/**
 * EXACT APPROVED SMS EXPIRY NOTIFICATION TEMPLATE
 * Requirement 2: Approved by project owner. Exact wording, spelling, and punctuation.
 * Single GSM-7 segment (133 characters <= 160 characters).
 */
export const APPROVED_EXPIRY_SMS_TEXT =
  'NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba';

export class SmsService {
  /**
   * Replace template variables such as [Member Name], [Expiry Date], etc.
   */
  public static interpolateTemplate(
    templateText: string,
    variables: Record<string, string | number | undefined>
  ): string {
    let result = templateText;
    for (const [key, val] of Object.entries(variables)) {
      const cleanVal = val !== undefined && val !== null ? String(val) : '';
      // Support [Key] and [key] format
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      result = result.replace(regex, cleanVal);
    }
    return result;
  }

  /**
   * Format phone number to E.164 Uganda format (+256...)
   */
  public static formatUgandanPhone(phone: string): string {
    let clean = phone.replace(/[^0-9+]/g, '');
    if (clean.startsWith('0')) {
      clean = '+256' + clean.substring(1);
    } else if (clean.startsWith('256')) {
      clean = '+' + clean;
    } else if (!clean.startsWith('+')) {
      clean = '+256' + clean;
    }
    return clean;
  }

  /**
   * Queue an SMS message with strict deduplication
   */
  public static queueMessage(params: {
    recipientPhone: string;
    recipientName: string;
    messageText: string;
    branchId: string;
    branchName: string;
    queuedByUserId: string;
    queuedByUserFullName: string;
    saccoAccountNumber?: string;
    planId?: string;
    claimId?: string;
    eventId?: string;
    eventReferenceKey?: string;
    templateCategory?: any;
  }): { message?: SmsMessage; isDuplicate: boolean; duplicateReason?: string } {
    // 1. Strict Duplicate Check
    if (params.eventReferenceKey) {
      const existing = serverStore.getSmsMessages().find(
        m => m.eventReferenceKey === params.eventReferenceKey && (m.status === 'SENT' || m.status === 'PENDING' || m.status === 'SENDING')
      );
      if (existing) {
        return {
          isDuplicate: true,
          duplicateReason: `Duplicate prevented: SMS with key '${params.eventReferenceKey}' already in status ${existing.status} (ID: ${existing.id})`,
        };
      }
    }

    const formattedPhone = this.formatUgandanPhone(params.recipientPhone);

    const newMessage: SmsMessage = {
      id: `sms-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventId: params.eventId,
      eventReferenceKey: params.eventReferenceKey,
      recipientPhone: formattedPhone,
      recipientName: params.recipientName,
      saccoAccountNumber: params.saccoAccountNumber,
      planId: params.planId,
      claimId: params.claimId,
      branchId: params.branchId,
      branchName: params.branchName,
      messageText: params.messageText,
      templateCategory: params.templateCategory,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      provider: (serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'AFRICAS_TALKING' | 'PANDORA',
      queuedByUserId: params.queuedByUserId,
      queuedByUserFullName: params.queuedByUserFullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };

    serverStore.addSmsMessage(newMessage);

    AuditService.log({
      userId: params.queuedByUserId,
      username: params.queuedByUserFullName,
      userFullName: params.queuedByUserFullName,
      branchId: params.branchId,
      branchName: params.branchName,
      action: 'SMS_QUEUED',
      recordType: 'SMS',
      recordId: newMessage.id,
      newValue: JSON.stringify({
        recipient: formattedPhone,
        eventKey: params.eventReferenceKey,
        length: (params.messageText || '').length,
        provider: newMessage.provider,
      }),
      reason: 'Outbound SMS notification queued in system pipeline',
    });

    return { message: newMessage, isDuplicate: false };
  }

  /**
   * Dispatch an SMS message through the designated provider API (Pandora or Africa's Talking)
   */
  public static async dispatchMessage(messageId: string): Promise<{ success: boolean; message: SmsMessage; error?: string }> {
    const sms = serverStore.getSmsById(messageId);
    if (!sms) {
      throw new Error(`SMS record with ID ${messageId} not found`);
    }

    if (sms.status === 'SENT') {
      return { success: true, message: sms };
    }

    const activeProvider = (sms.provider || serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'AFRICAS_TALKING' | 'PANDORA';

    // 1. Provider configuration validation
    const validation = activeProvider === 'PANDORA'
      ? PandoraAdapter.validateConfiguration()
      : AfricasTalkingAdapter.validateConfiguration();

    if (!validation.canSubmit) {
      // Retain queued messages in PENDING without claiming they are sent
      sms.failureReason = validation.message;
      sms.lockedAt = undefined;
      sms.lockedBy = undefined;
      serverStore.updateSmsMessage(sms);

      serverStore.recordSmsTelemetry({
        lastErrorSanitized: validation.message,
        lastErrorTime: new Date().toISOString(),
      });

      return {
        success: false,
        message: sms,
        error: validation.message,
      };
    }

    // Mark as SENDING while in transit
    sms.status = 'SENDING';
    sms.provider = activeProvider;
    sms.lastAttemptAt = new Date().toISOString();
    sms.updatedAt = new Date().toISOString();
    serverStore.updateSmsMessage(sms);

    // 2. Provider submission
    const submission = activeProvider === 'PANDORA'
      ? await PandoraAdapter.submitMessage({
          to: sms.recipientPhone,
          messageText: sms.messageText,
          senderId: config.sms.pandora.senderId,
        })
      : await AfricasTalkingAdapter.submitMessage({
          to: sms.recipientPhone,
          messageText: sms.messageText,
          senderId: config.sms.senderId,
        });

    if (submission.success) {
      const isSandbox = config.sms.environment === 'SANDBOX' && activeProvider === 'AFRICAS_TALKING';
      sms.status = 'SENT';
      sms.sentAt = new Date().toISOString();
      sms.providerMessageId = submission.providerMessageId;
      sms.providerCostUGX = submission.costUGX || 30.0;
      sms.deliveryStatus = submission.deliveryStatus || (isSandbox ? 'SimulatedSandbox' : 'Submitted');
      sms.deliveryConfirmed = false;
      sms.failureReason = undefined;
      sms.nextRetryAt = undefined;
      sms.lockedAt = undefined;
      sms.lockedBy = undefined;
      sms.updatedAt = new Date().toISOString();
      serverStore.updateSmsMessage(sms);

      serverStore.recordSmsTelemetry({
        lastSuccessTime: new Date().toISOString(),
        lastSubmissionTime: new Date().toISOString(),
      });

      AuditService.log({
        userId: 'system',
        username: activeProvider === 'PANDORA' ? 'PANDORA_GATEWAY' : 'AFRICAS_TALKING_GATEWAY',
        userFullName: activeProvider === 'PANDORA' ? 'Pandora SMS Gateway' : "Africa's Talking SMS Gateway",
        branchId: sms.branchId,
        branchName: sms.branchName,
        action: 'SMS_SENT',
        recordType: 'SMS',
        recordId: sms.id,
        newValue: JSON.stringify({
          providerMsgId: sms.providerMessageId,
          costUGX: sms.providerCostUGX,
          recipient: sms.recipientPhone,
          deliveryStatus: sms.deliveryStatus,
          deliveryConfirmed: false,
          provider: activeProvider,
        }),
        reason: activeProvider === 'PANDORA'
          ? 'SMS submitted to Pandora Networks telecommunications gateway in Uganda'
          : isSandbox
          ? "SMS accepted by Africa's Talking Sandbox; routed to virtual simulator (not physical GSM handset)"
          : "SMS accepted by Africa's Talking gateway; queued for mobile telecom dispatch",
      });

      return { success: true, message: sms };
    } else {
      const errorMsg = submission.error || 'Submission failed';
      const willRetry = submission.isTransientFailure && (sms.retryCount + 1 < sms.maxRetries);

      if (willRetry) {
        sms.retryCount += 1;
        const delaySeconds = Math.min(15 * Math.pow(2, sms.retryCount - 1), 3600);
        sms.nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        sms.status = 'PENDING';
        sms.failureReason = `Retry ${sms.retryCount}/${sms.maxRetries}: ${errorMsg}`;
      } else {
        sms.status = 'FAILED';
        sms.failedAt = new Date().toISOString();
        sms.failureReason = errorMsg;
        sms.retryCount += 1;
        sms.nextRetryAt = undefined;

        // Create alert for staff
        serverStore.addAlert({
          id: `alt-sms-${Date.now()}`,
          category: 'SMS_FAILURE',
          severity: 'WARNING',
          title: `SMS Dispatch Failed to ${sms.recipientName}`,
          message: `Failed to deliver notification to ${sms.recipientPhone}: ${sms.failureReason}. Click to retry in SMS Queue.`,
          branchId: sms.branchId,
          branchName: sms.branchName,
          linkTab: 'system',
          recordId: sms.id,
          requiredPermission: 'sms.retry_failed',
          status: 'UNREAD',
          readByUsers: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      sms.lockedAt = undefined;
      sms.lockedBy = undefined;
      sms.updatedAt = new Date().toISOString();
      serverStore.updateSmsMessage(sms);

      serverStore.recordSmsTelemetry({
        lastErrorSanitized: errorMsg,
        lastErrorTime: new Date().toISOString(),
        lastSubmissionTime: new Date().toISOString(),
      });

      AuditService.log({
        userId: 'system',
        username: 'SMS_GATEWAY',
        userFullName: activeProvider === 'PANDORA' ? 'Pandora SMS Gateway' : "Africa's Talking Gateway",
        branchId: sms.branchId,
        branchName: sms.branchName,
        action: 'SMS_FAILED',
        recordType: 'SMS',
        recordId: sms.id,
        newValue: JSON.stringify({ error: sms.failureReason, retries: sms.retryCount, provider: activeProvider }),
        reason: 'SMS transmission failed; alert generated for branch review',
      });

      return { success: false, message: sms, error: sms.failureReason };
    }
  }

  /**
   * Process all pending messages in queue via worker
   */
  public static async processQueue(): Promise<{ processed: number; sent: number; failed: number }> {
    const res = await smsQueueWorker.tick();
    return {
      processed: res.claimed,
      sent: res.sent,
      failed: res.failed,
    };
  }

  /**
   * Automatically detect and queue plan expiry notification events.
   * - Requirement 1: Africa/Kampala timezone (UTC+3), automatic scheduling,
   *   recovers overdue unsent reminders after downtime, durable idempotency.
   * - Requirement 2: Exact approved wording:
   *   "NYAMUYANJA SACCO nekumanyisa ku sente zawe za Turihamwe zihwireyo noshabwa kushashura obutarenzya ebiro mushanju (7) kuriga erizooba"
   */
  public static evaluateExpiryNotificationEvents(options?: { simulatedDate?: Date | string }): { eventsCreated: number; messagesQueued: number } {
    const plans = serverStore.getPlans().filter(p => p.status === 'ACTIVE' || p.status === 'EXPIRED');
    const now = options?.simulatedDate ? new Date(options.simulatedDate) : new Date();
    const todayUganda = getUgandaDateString(now);
    let eventsCreated = 0;
    let messagesQueued = 0;

    for (const plan of plans) {
      if (!plan.currentExpiryDate) continue;

      // Exact Uganda calendar day difference (Africa/Kampala, UTC+3)
      const diffDays = diffInUgandaCalendarDays(plan.currentExpiryDate, now);

      let eventType: string | null = null;
      let templateCategory: any = null;
      let isExpiryNotice = false;

      if (diffDays === 0) {
        // Plan expires today in Uganda
        eventType = 'EXPIRY_DUE_TODAY';
        templateCategory = 'EXPIRY_DATE_NOTICE';
        isExpiryNotice = true;
      } else if (diffDays < 0 && diffDays >= -7) {
        // Missed reminder / offline recovery: plan reached expiry during downtime and was not reminded
        eventType = 'EXPIRY_OVERDUE_RECOVERY';
        templateCategory = 'EXPIRY_DATE_NOTICE';
        isExpiryNotice = true;
      } else if (diffDays === 30 && plan.status === 'ACTIVE') {
        eventType = 'EXPIRY_30_DAYS';
        templateCategory = 'EXPIRY_REMINDER_30_DAYS';
      } else if (diffDays === 14 && plan.status === 'ACTIVE') {
        eventType = 'EXPIRY_14_DAYS';
        templateCategory = 'EXPIRY_REMINDER_14_DAYS';
      } else if (diffDays === 7 && plan.status === 'ACTIVE') {
        eventType = 'EXPIRY_7_DAYS';
        templateCategory = 'EXPIRY_REMINDER_7_DAYS';
      }

      if (eventType && templateCategory) {
        // Durable idempotency: Unique event identity based on plan ID and its recorded expiry date
        const deduplicationKey = isExpiryNotice
          ? `PLAN_EXPIRY_AUTO::${plan.id}::${plan.currentExpiryDate}`
          : `${eventType}::${plan.id}::${todayUganda}`;

        const existingEvent = serverStore.getNotificationEvents().find(e => e.deduplicationKey === deduplicationKey);
        const existingSms = serverStore.getSmsMessages().find(
          m => m.eventReferenceKey === deduplicationKey && (m.status === 'SENT' || m.status === 'PENDING' || m.status === 'SENDING')
        );

        if (!existingEvent && !existingSms) {
          const member = serverStore.getMemberByAccountNumber(plan.saccoAccountNumber);
          if (member && member.primaryPhone) {
            const newEvent: NotificationEvent = {
              id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              eventType: eventType as any,
              deduplicationKey,
              saccoAccountNumber: plan.saccoAccountNumber,
              memberName: member.fullName,
              recipientPhone: member.primaryPhone,
              planId: plan.id,
              branchId: plan.registeredBranchId,
              branchName: plan.registeredBranchName || 'Nyamuyanja Branch',
              description: isExpiryNotice
                ? `Automated expiry notification on plan ${plan.planCode || plan.id} reaching expiry date ${plan.currentExpiryDate}`
                : `Automated advance notification (${diffDays} days remaining) for policy ${plan.planCode || plan.id}`,
              processed: true,
              processedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            };

            serverStore.addNotificationEvent(newEvent);
            eventsCreated++;

            let messageContent = '';
            if (isExpiryNotice) {
              // EXACT approved text (Requirement 2) - strictly preserved without alteration
              messageContent = APPROVED_EXPIRY_SMS_TEXT;
            } else {
              const template = serverStore.getSmsTemplates().find(t => t.category === templateCategory && t.isActive) ||
                serverStore.getSmsTemplates().find(t => t.category === 'EXPIRY_REMINDER_30_DAYS' && t.isActive);

              const defaultText = `Dear [Member Name], your Turihamwe cover with Nyamuyanja SACCO expires on [Expiry Date]. Please renew at [Branch] before the expiry date to maintain your funeral coverage benefits.`;
              const templateText = template?.templateText || defaultText;

              messageContent = this.interpolateTemplate(templateText, {
                'Member Name': member.fullName,
                'Expiry Date': plan.currentExpiryDate,
                'Branch': plan.registeredBranchName || 'Nyamuyanja Branch',
                'Policy Code': plan.planCode || plan.id,
                'Account Number': member.saccoAccountNumber,
              });
            }

            const queueResult = this.queueMessage({
              recipientPhone: member.primaryPhone,
              recipientName: member.fullName,
              messageText: messageContent,
              branchId: plan.registeredBranchId,
              branchName: plan.registeredBranchName || 'Nyamuyanja Branch',
              queuedByUserId: 'system',
              queuedByUserFullName: 'Turihamwe Automated Lifecycle Scheduler',
              saccoAccountNumber: member.saccoAccountNumber,
              planId: plan.id,
              eventId: newEvent.id,
              eventReferenceKey: deduplicationKey,
              templateCategory,
            });

            if (!queueResult.isDuplicate && queueResult.message) {
              newEvent.smsMessageId = queueResult.message.id;
              serverStore.updateNotificationEvent(newEvent);
              messagesQueued++;
            }
          }
        }
      }
    }

    return { eventsCreated, messagesQueued };
  }

  /**
   * Process Africa's Talking Delivery Report (DLR) callback idempotently.
   */
  public static processDeliveryReport(params: {
    id: string;
    status: string;
    phoneNumber?: string;
    networkCode?: string;
    failureReason?: string;
  }): { success: boolean; found: boolean; message?: SmsMessage; isIdempotent?: boolean } {
    const { id, status, phoneNumber, networkCode, failureReason } = params;
    if (!id || !status) {
      return { success: false, found: false };
    }

    const existingMessage = serverStore.getSmsByProviderMessageId(id);
    if (!existingMessage) {
      return { success: true, found: false };
    }

    const normalizedStatus = String(status).trim();
    const now = new Date().toISOString();

    // Idempotency: skip if already recorded with same receipt status
    if (existingMessage.deliveryReceiptRawStatus === normalizedStatus) {
      return { success: true, found: true, message: existingMessage, isIdempotent: true };
    }

    existingMessage.deliveryReceiptAt = now;
    existingMessage.deliveryReceiptRawStatus = normalizedStatus;
    if (networkCode) existingMessage.deliveryReceiptNetworkCode = String(networkCode);

    if (normalizedStatus === 'Success') {
      existingMessage.deliveryStatus = 'Delivered';
      existingMessage.deliveryConfirmed = true;
      existingMessage.updatedAt = now;
      serverStore.updateSmsMessage(existingMessage);

      AuditService.log({
        userId: 'system',
        username: 'AFRICAS_TALKING_DLR',
        userFullName: "Africa's Talking Delivery Receipt",
        branchId: existingMessage.branchId,
        branchName: existingMessage.branchName,
        action: 'SMS_DELIVERY_CONFIRMED',
        recordType: 'SMS',
        recordId: existingMessage.id,
        newValue: JSON.stringify({
          providerMessageId: id,
          recipient: phoneNumber || existingMessage.recipientPhone,
          networkCode,
          status: normalizedStatus,
        }),
        reason: 'Telecommunications operator confirmed successful delivery to recipient handset',
      });
    } else if (['Failed', 'Rejected', 'AbsentSubscriber', 'Expired'].includes(normalizedStatus)) {
      existingMessage.deliveryStatus = normalizedStatus;
      existingMessage.deliveryConfirmed = false;
      existingMessage.status = 'FAILED';
      const reasonText = AfricasTalkingAdapter.sanitizeError(
        failureReason || `Telco delivery failure: ${normalizedStatus} (Network: ${networkCode || 'N/A'})`
      );
      existingMessage.failureReason = reasonText;
      existingMessage.failedAt = now;
      existingMessage.updatedAt = now;
      serverStore.updateSmsMessage(existingMessage);

      AuditService.log({
        userId: 'system',
        username: 'AFRICAS_TALKING_DLR',
        userFullName: "Africa's Talking Delivery Receipt",
        branchId: existingMessage.branchId,
        branchName: existingMessage.branchName,
        action: 'SMS_DELIVERY_FAILED',
        recordType: 'SMS',
        recordId: existingMessage.id,
        newValue: JSON.stringify({
          providerMessageId: id,
          recipient: phoneNumber || existingMessage.recipientPhone,
          networkCode,
          status: normalizedStatus,
          reason: reasonText,
        }),
        reason: `Telecommunications operator reported delivery failure: ${normalizedStatus}`,
      });
    } else {
      existingMessage.deliveryStatus = normalizedStatus;
      existingMessage.deliveryConfirmed = false;
      existingMessage.updatedAt = now;
      serverStore.updateSmsMessage(existingMessage);
    }

    return { success: true, found: true, message: existingMessage };
  }
}
