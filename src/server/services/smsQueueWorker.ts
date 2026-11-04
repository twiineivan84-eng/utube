import { serverStore } from '../storage/serverStore';
import { AfricasTalkingAdapter } from './africasTalkingAdapter';
import { PandoraAdapter } from './pandoraAdapter';
import { AuditService } from './auditService';
import { SmsWorkerStatus, SmsProviderDiagnostics } from '../../types';
import { config } from '../config';

export class SmsQueueWorker {
  private static instance: SmsQueueWorker;
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private status: SmsWorkerStatus = 'STOPPED';
  private intervalMs = 15000; // 15 seconds poll interval

  private constructor() {
    this.workerId = `worker-sms-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;
  }

  public static getInstance(): SmsQueueWorker {
    if (!SmsQueueWorker.instance) {
      SmsQueueWorker.instance = new SmsQueueWorker();
    }
    return SmsQueueWorker.instance;
  }

  /**
   * Start the background queue worker and automated plan expiry scheduler.
   */
  public start(): void {
    if (this.timer) {
      return;
    }

    this.status = 'RUNNING';
    const activeProvider = serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA';
    console.log(`[SMS WORKER] Background SMS Queue Worker starting with ID: ${this.workerId} (provider: ${activeProvider}, interval: ${this.intervalMs / 1000}s)`);

    // Immediate first tick then periodic
    this.tick().catch(err => {
      console.error('[SMS WORKER] Error in initial tick:', err);
    });

    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('[SMS WORKER] Unhandled error during queue processing cycle:', err);
      });
    }, this.intervalMs);

    // Prevent worker timer from blocking node process shutdown in tests
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stop the background worker cleanly.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'STOPPED';
    console.log('[SMS WORKER] Background SMS Queue Worker stopped.');
  }

  public getStatus(): SmsWorkerStatus {
    return this.status;
  }

  public getIntervalSeconds(): number {
    return this.intervalMs / 1000;
  }

  /**
   * Execute a single processing tick:
   * 1. Evaluates automated plan expiry notifications across Africa/Kampala calendar dates.
   * 2. Claims pending messages atomically and dispatches them via active provider (Pandora or Africa's Talking).
   */
  public async tick(): Promise<{ claimed: number; sent: number; retried: number; failed: number }> {
    if (this.isProcessing) {
      return { claimed: 0, sent: 0, retried: 0, failed: 0 };
    }

    this.isProcessing = true;
    let sent = 0;
    let retried = 0;
    let failed = 0;

    try {
      // Step 1: Automated Expiry Detection & Idempotent Scheduling (Requirement 1 & 2)
      try {
        const { SmsService } = await import('./smsService');
        SmsService.evaluateExpiryNotificationEvents();
      } catch (schedErr) {
        console.error('[SMS WORKER] Error evaluating automated expiry notifications:', schedErr);
      }

      // Step 2: Determine Active Provider
      const activeProvider = (serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'PANDORA' | 'AFRICAS_TALKING';

      const validation = activeProvider === 'PANDORA'
        ? PandoraAdapter.validateConfiguration()
        : AfricasTalkingAdapter.validateConfiguration();

      if (!validation.canSubmit) {
        // Provider is not configured or disabled.
        // As required: queued messages stay in the queue and are never marked as sent.
        serverStore.recordSmsTelemetry({
          lastErrorSanitized: validation.message,
          lastErrorTime: new Date().toISOString(),
        });
        return { claimed: 0, sent: 0, retried: 0, failed: 0 };
      }

      // Claim up to 15 pending messages atomically
      const claimedMessages = serverStore.claimPendingSms(this.workerId, 15);
      if (claimedMessages.length === 0) {
        return { claimed: 0, sent: 0, retried: 0, failed: 0 };
      }

      const nowIso = new Date().toISOString();
      serverStore.recordSmsTelemetry({ lastSubmissionTime: nowIso });

      for (const msg of claimedMessages) {
        try {
          msg.provider = activeProvider;

          const submission = activeProvider === 'PANDORA'
            ? await PandoraAdapter.submitMessage({
                to: msg.recipientPhone,
                messageText: msg.messageText,
                senderId: config.sms.pandora.senderId,
              })
            : await AfricasTalkingAdapter.submitMessage({
                to: msg.recipientPhone,
                messageText: msg.messageText,
                senderId: msg.branchName.toLowerCase().includes('kamubeizi') ? undefined : config.sms.senderId,
              });

          if (submission.success) {
            const isSandbox = config.sms.environment === 'SANDBOX' && activeProvider === 'AFRICAS_TALKING';
            msg.status = 'SENT';
            msg.sentAt = new Date().toISOString();
            msg.providerMessageId = submission.providerMessageId;
            msg.providerCostUGX = submission.costUGX || 30.0;
            msg.deliveryStatus = submission.deliveryStatus || (isSandbox ? 'SimulatedSandbox' : 'Submitted');
            msg.deliveryConfirmed = false;
            msg.failureReason = undefined;
            msg.lockedAt = undefined;
            msg.lockedBy = undefined;
            msg.nextRetryAt = undefined;
            msg.updatedAt = new Date().toISOString();
            serverStore.updateSmsMessage(msg);

            serverStore.recordSmsTelemetry({
              lastSuccessTime: new Date().toISOString(),
              lastSubmissionTime: new Date().toISOString(),
            });

            AuditService.log({
              userId: 'system',
              username: activeProvider === 'PANDORA' ? 'PANDORA_WORKER' : 'AFRICAS_TALKING_WORKER',
              userFullName: activeProvider === 'PANDORA' ? 'Pandora Background Queue Worker' : "Africa's Talking Background Queue Worker",
              branchId: msg.branchId,
              branchName: msg.branchName,
              action: 'SMS_SENT',
              recordType: 'SMS',
              recordId: msg.id,
              newValue: JSON.stringify({
                providerMessageId: msg.providerMessageId,
                costUGX: msg.providerCostUGX,
                recipientPhone: msg.recipientPhone,
                deliveryStatus: msg.deliveryStatus,
                deliveryConfirmed: false,
                provider: activeProvider,
              }),
              reason: activeProvider === 'PANDORA'
                ? 'Message submitted to Pandora Networks telecommunications gateway in Uganda'
                : isSandbox
                ? "Message submitted to Africa's Talking Sandbox; simulated in virtual dashboard (not routed to physical handset)"
                : 'Message submitted to Africa\'s Talking telecommunications gateway',
            });

            sent++;
          } else {
            // Submission failed
            const errorReason = submission.error || 'Transmission failed';
            const willRetry = submission.isTransientFailure && (msg.retryCount + 1 < msg.maxRetries);

            if (willRetry) {
              const delaySeconds = Math.min(15 * Math.pow(2, msg.retryCount), 3600); // 15s, 30s, 60s, max 1 hour
              const nextRetry = new Date(Date.now() + delaySeconds * 1000).toISOString();

              msg.status = 'PENDING';
              msg.retryCount += 1;
              msg.nextRetryAt = nextRetry;
              msg.failureReason = `Retry ${msg.retryCount}/${msg.maxRetries}: ${errorReason}`;
              msg.lockedAt = undefined;
              msg.lockedBy = undefined;
              msg.updatedAt = new Date().toISOString();
              serverStore.updateSmsMessage(msg);

              AuditService.log({
                userId: 'system',
                username: activeProvider === 'PANDORA' ? 'PANDORA_WORKER' : 'AFRICAS_TALKING_WORKER',
                userFullName: activeProvider === 'PANDORA' ? 'Pandora Background Queue Worker' : "Africa's Talking Background Queue Worker",
                branchId: msg.branchId,
                branchName: msg.branchName,
                action: 'SMS_FAILED',
                recordType: 'SMS',
                recordId: msg.id,
                newValue: JSON.stringify({
                  retryCount: msg.retryCount,
                  nextRetryAt: nextRetry,
                  error: errorReason,
                  provider: activeProvider,
                }),
                reason: `Temporary submission failure; scheduled for backoff retry in ${delaySeconds}s`,
              });

              retried++;
            } else {
              // Permanently failed
              msg.status = 'FAILED';
              msg.failedAt = new Date().toISOString();
              msg.failureReason = errorReason;
              msg.retryCount += 1;
              msg.nextRetryAt = undefined;
              msg.lockedAt = undefined;
              msg.lockedBy = undefined;
              msg.updatedAt = new Date().toISOString();
              serverStore.updateSmsMessage(msg);

              serverStore.addAlert({
                id: `alt-sms-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                category: 'SMS_FAILURE',
                severity: 'WARNING',
                title: `SMS Dispatch Failed to ${msg.recipientName}`,
                message: `Failed to deliver notification to ${msg.recipientPhone}: ${errorReason}. Check SMS Queue in administrative portal.`,
                branchId: msg.branchId,
                branchName: msg.branchName,
                linkTab: 'system',
                recordId: msg.id,
                requiredPermission: 'sms.retry_failed',
                status: 'UNREAD',
                readByUsers: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              AuditService.log({
                userId: 'system',
                username: activeProvider === 'PANDORA' ? 'PANDORA_WORKER' : 'AFRICAS_TALKING_WORKER',
                userFullName: activeProvider === 'PANDORA' ? 'Pandora Background Queue Worker' : "Africa's Talking Background Queue Worker",
                branchId: msg.branchId,
                branchName: msg.branchName,
                action: 'SMS_FAILED',
                recordType: 'SMS',
                recordId: msg.id,
                newValue: JSON.stringify({
                  retryCount: msg.retryCount,
                  finalError: errorReason,
                  provider: activeProvider,
                }),
                reason: 'Permanent transmission failure; staff alert created',
              });

              failed++;
            }

            serverStore.recordSmsTelemetry({
              lastErrorSanitized: errorReason,
              lastErrorTime: new Date().toISOString(),
              lastSubmissionTime: new Date().toISOString(),
            });
          }
        } catch (msgErr: any) {
          const sanitizedErr = activeProvider === 'PANDORA'
            ? PandoraAdapter.sanitizeError(msgErr.message)
            : AfricasTalkingAdapter.sanitizeError(msgErr.message);
          msg.status = 'PENDING';
          msg.lockedAt = undefined;
          msg.lockedBy = undefined;
          msg.failureReason = sanitizedErr;
          serverStore.updateSmsMessage(msg);
          failed++;
        }
      }

      return { claimed: claimedMessages.length, sent, retried, failed };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Produce comprehensive diagnostics snapshot for administration screens.
   */
  public getDiagnostics(): SmsProviderDiagnostics {
    const activeProvider = (serverStore.getSystemSetting('sms.provider') || config.sms.provider || 'PANDORA') as 'PANDORA' | 'AFRICAS_TALKING';

    const validation = activeProvider === 'PANDORA'
      ? PandoraAdapter.validateConfiguration()
      : AfricasTalkingAdapter.validateConfiguration();

    const allMessages = serverStore.getSmsMessages();
    const telemetry = serverStore.getSmsTelemetry();

    const counts = {
      total: allMessages.length,
      pending: allMessages.filter(m => m.status === 'PENDING').length,
      sending: allMessages.filter(m => m.status === 'SENDING').length,
      sent: allMessages.filter(m => m.status === 'SENT').length,
      deliveredConfirmed: allMessages.filter(m => m.deliveryConfirmed === true).length,
      failed: allMessages.filter(m => m.status === 'FAILED').length,
      retrying: allMessages.filter(m => m.status === 'PENDING' && (m.retryCount || 0) > 0).length,
    };

    if (activeProvider === 'PANDORA') {
      const pVal = validation as import('./pandoraAdapter').PandoraValidationResult;
      return {
        provider: 'Pandora Networks',
        environment: 'PRODUCTION',
        configurationStatus: pVal.status,
        configurationMessage: pVal.message,
        workerStatus: this.status,
        workerIntervalSeconds: this.getIntervalSeconds(),
        isSubmissionEnabled: pVal.canSubmit,
        senderId: pVal.senderId,
        hasApiKey: pVal.hasPassword,
        isPlaceholderKey: pVal.isPlaceholder,
        counts,
        lastSuccessfulSubmissionTime: telemetry.lastSuccessTime,
        lastSubmissionAttemptTime: telemetry.lastSubmissionTime,
        lastErrorSanitized: telemetry.lastErrorSanitized,
        lastErrorTime: telemetry.lastErrorTime,
        balanceEstimateUGX: telemetry.balanceEstimateUGX,
        sandboxNotice: !pVal.canSubmit
          ? 'Pandora SMS is the primary intended provider for Turihamwe. Outbound messages remain queued safely until authorized production credentials are configured on the backend.'
          : undefined,
        deliveryReceiptsSupported: false,
      };
    }

    const atVal = validation as import('./africasTalkingAdapter').ProviderValidationResult;
    return {
      provider: "Africa's Talking",
      environment: atVal.environment,
      configurationStatus: atVal.status,
      configurationMessage: atVal.message,
      workerStatus: this.status,
      workerIntervalSeconds: this.getIntervalSeconds(),
      isSubmissionEnabled: atVal.canSubmit,
      senderId: atVal.senderId,
      hasApiKey: atVal.hasApiKey,
      isPlaceholderKey: atVal.isPlaceholderKey,
      counts,
      lastSuccessfulSubmissionTime: telemetry.lastSuccessTime,
      lastSubmissionAttemptTime: telemetry.lastSubmissionTime,
      lastErrorSanitized: telemetry.lastErrorSanitized,
      lastErrorTime: telemetry.lastErrorTime,
      balanceEstimateUGX: telemetry.balanceEstimateUGX,
      sandboxNotice: atVal.environment === 'SANDBOX'
        ? "Africa's Talking Sandbox routes all outbound SMS messages to the Africa's Talking Web Simulator. In Sandbox mode, messages are simulated and will NEVER arrive on a physical mobile handset."
        : undefined,
      deliveryReceiptsSupported: true,
    };
  }
}

export const smsQueueWorker = SmsQueueWorker.getInstance();
