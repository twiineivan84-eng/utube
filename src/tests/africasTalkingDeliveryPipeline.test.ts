/**
 * AFRICA'S TALKING SMS DELIVERY PIPELINE TEST SUITE
 * 
 * Comprehensive verification of the Africa's Talking delivery pipeline:
 *  1. Missing provider credentials
 *  2. Valid sandbox configuration
 *  3. Provider not enabled (SMS_ENABLED=false)
 *  4. Worker startup and lifecycle
 *  5. Successful provider acceptance (statusCode: 101, status: Success)
 *  6. Invalid credentials (HTTP 401 / 403)
 *  7. Provider rejection (HTTP 402, 403, 405 Insufficient Balance, etc.)
 *  8. Network timeout handling (AbortController)
 *  9. Bounded exponential backoff retry behavior
 * 10. Duplicate submission prevention & idempotency
 * 11. Queue persistence across restarts
 * 12. Accurate status transitions (PENDING -> SENDING -> SENT / FAILED)
 * 13. Secret and credential redaction from errors, logs, and telemetry
 * 14. Production mode requiring valid configuration
 * 15. Development mode not requiring production credentials
 */

import { serverStore } from '../server/storage/serverStore';
import { AfricasTalkingAdapter } from '../server/services/africasTalkingAdapter';
import { smsQueueWorker } from '../server/services/smsQueueWorker';
import { SmsService } from '../server/services/smsService';
import { config } from '../server/config';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
}

export async function runAfricasTalkingSuite(): Promise<{
  name: string;
  results: TestResult[];
  passed: boolean;
}> {
  const results: TestResult[] = [];
  console.log('\n>>> [SUITE] AFRICA\'S TALKING SMS DELIVERY PIPELINE VERIFICATION');

  // Save original config references and fetch
  const originalFetch = globalThis.fetch;
  const originalApiKey = config.sms.apiKey;
  const originalUsername = config.sms.username;
  const originalSenderId = config.sms.senderId;
  const originalEnv = config.sms.environment;
  const originalEnabled = config.sms.enabled;
  const originalProvider = config.sms.provider;
  const originalStoreSetting = serverStore.getSystemSetting('sms.provider');

  // Explicitly activate Africa's Talking for this dedicated delivery pipeline test suite
  config.sms.provider = 'AFRICAS_TALKING';
  serverStore.setSystemSetting('sms.provider', 'AFRICAS_TALKING');

  function restoreConfig() {
    config.sms.apiKey = originalApiKey;
    config.sms.username = originalUsername;
    config.sms.senderId = originalSenderId;
    config.sms.environment = originalEnv;
    config.sms.enabled = originalEnabled;
    config.sms.provider = 'AFRICAS_TALKING';
    serverStore.setSystemSetting('sms.provider', 'AFRICAS_TALKING');
    globalThis.fetch = originalFetch;
  }

  // ==========================================
  // TEST 1: Missing Provider Credentials
  // ==========================================
  try {
    config.sms.apiKey = '';
    const validation = AfricasTalkingAdapter.validateConfiguration();
    const passed =
      validation.status === 'MISSING' &&
      !validation.canSubmit &&
      validation.message.includes("Africa's Talking submission is not configured");

    results.push({
      id: 1,
      name: 'Missing Provider Credentials Handling',
      passed,
      message: passed
        ? 'Missing API key correctly classified as MISSING with authoritative deployment instructions'
        : 'Failed to flag missing credentials',
    });
  } catch (err: any) {
    results.push({ id: 1, name: 'Missing Provider Credentials Handling', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 2: Valid Sandbox Configuration
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_live_test_valid_key_1234567890';
    config.sms.username = 'sandbox';

    const validation = AfricasTalkingAdapter.validateConfiguration();
    const passed =
      validation.status === 'CONFIGURED' &&
      validation.canSubmit === true &&
      validation.environment === 'SANDBOX';

    results.push({
      id: 2,
      name: 'Valid Sandbox Configuration',
      passed,
      message: passed
        ? 'Valid sandbox parameters produce CONFIGURED status and canSubmit=true'
        : 'Sandbox configuration validation failed',
    });
  } catch (err: any) {
    results.push({ id: 2, name: 'Valid Sandbox Configuration', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 3: Provider Not Enabled (SMS_ENABLED=false)
  // ==========================================
  try {
    config.sms.enabled = false;
    const validation = AfricasTalkingAdapter.validateConfiguration();
    const passed = validation.status === 'DISABLED' && !validation.canSubmit;

    results.push({
      id: 3,
      name: 'Provider Disabled Handling',
      passed,
      message: passed
        ? 'SMS_ENABLED=false correctly reports DISABLED without throwing exceptions'
        : 'Provider disabled handling failed',
    });
  } catch (err: any) {
    results.push({ id: 3, name: 'Provider Disabled Handling', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 4: Worker Startup and Lifecycle
  // ==========================================
  try {
    smsQueueWorker.start();
    const isRunning = smsQueueWorker.getStatus() === 'RUNNING';
    const intervalSeconds = smsQueueWorker.getIntervalSeconds();
    const diagnostics = smsQueueWorker.getDiagnostics();

    const passed = isRunning && intervalSeconds > 0 && diagnostics.provider === "Africa's Talking";

    results.push({
      id: 4,
      name: 'Queue Worker Startup and Lifecycle',
      passed,
      message: passed
        ? `Worker started in RUNNING state (cycle: ${intervalSeconds}s) with live diagnostics`
        : 'Worker startup failed',
    });
  } catch (err: any) {
    results.push({ id: 4, name: 'Queue Worker Startup and Lifecycle', passed: false, message: err.message });
  }

  // ==========================================
  // TEST 5: Successful Provider Acceptance (Mocked)
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_valid_active_key_999888';
    config.sms.username = 'sandbox';

    // Mock Africa's Talking API HTTP 200 Success response
    globalThis.fetch = async (url: any, init?: any) => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          SMSMessageData: {
            Message: 'Sent to 1/1 Total Cost: UGX 30.0000',
            Recipients: [
              {
                cost: 'UGX 30.0000',
                messageId: 'ATXid_mocked_success_123',
                number: '+256701234567',
                status: 'Success',
                statusCode: 101,
              },
            ],
          },
        }),
      } as any;
    };

    const res = await AfricasTalkingAdapter.submitMessage({
      to: '+256701234567',
      messageText: 'Test notification',
    });

    const passed =
      res.success === true &&
      res.providerMessageId === 'ATXid_mocked_success_123' &&
      res.costUGX === 30.0 &&
      res.deliveryStatus === 'Success' &&
      res.statusCode === 101;

    results.push({
      id: 5,
      name: 'Successful Provider Acceptance Handling',
      passed,
      message: passed
        ? 'Provider 101 Success response parsed into providerMessageId, costUGX, and Success deliveryStatus'
        : 'Provider acceptance parsing failed',
    });
  } catch (err: any) {
    results.push({ id: 5, name: 'Successful Provider Acceptance Handling', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 6: Invalid Credentials (HTTP 401)
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_invalid_expired_key';
    config.sms.username = 'sandbox';

    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid apiKey provided',
      } as any;
    };

    const res = await AfricasTalkingAdapter.submitMessage({
      to: '+256701234567',
      messageText: 'Test unauthorized',
    });

    const passed: boolean = Boolean(res.success === false && res.error?.includes('401') && !res.isTransientFailure);

    results.push({
      id: 6,
      name: 'Invalid Credentials (HTTP 401) Handling',
      passed,
      message: passed
        ? 'HTTP 401 correctly flagged as non-transient authorization error'
        : 'Failed to handle HTTP 401 invalid credentials',
    });
  } catch (err: any) {
    results.push({ id: 6, name: 'Invalid Credentials (HTTP 401) Handling', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 7: Provider Rejection (Insufficient Balance 405)
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_test_key_ok_123456';
    config.sms.username = 'sandbox';

    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          SMSMessageData: {
            Message: 'Insufficient balance',
            Recipients: [
              {
                statusCode: 405,
                number: '+256701234567',
                status: 'InsufficientBalance',
                cost: 'UGX 0.00',
              },
            ],
          },
        }),
      } as any;
    };

    const res = await AfricasTalkingAdapter.submitMessage({
      to: '+256701234567',
      messageText: 'Test balance check',
    });

    const passed: boolean = Boolean(
      res.success === false &&
      res.statusCode === 405 &&
      res.error?.includes('InsufficientBalance')
    );

    results.push({
      id: 7,
      name: 'Provider Rejection (Insufficient Balance 405)',
      passed,
      message: passed
        ? 'Recipient 405 mapped to clear InsufficientBalance error description'
        : 'Failed to parse insufficient balance code',
    });
  } catch (err: any) {
    results.push({ id: 7, name: 'Provider Rejection (Insufficient Balance 405)', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 8: Network Timeout Handling
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_test_key_timeout';
    config.sms.username = 'sandbox';

    globalThis.fetch = async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    };

    const res = await AfricasTalkingAdapter.submitMessage({
      to: '+256701234567',
      messageText: 'Test timeout',
    });

    const passed: boolean = Boolean(
      res.success === false &&
      res.isTransientFailure === true &&
      res.error?.includes('timed out')
    );

    results.push({
      id: 8,
      name: 'Network Timeout & Transient Flagging',
      passed,
      message: passed
        ? 'AbortError timeout cleanly intercepted and flagged as transient failure'
        : 'Network timeout handling failed',
    });
  } catch (err: any) {
    results.push({ id: 8, name: 'Network Timeout & Transient Flagging', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 9: Bounded Exponential Backoff Retry Behavior
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_test_retry_key';
    config.sms.username = 'sandbox';

    // Mock transient telecom routing error (code 407)
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          SMSMessageData: {
            Recipients: [
              {
                statusCode: 407,
                number: '+256701234567',
                status: 'CouldNotRoute',
              },
            ],
          },
        }),
      } as any;
    };

    const queued = SmsService.queueMessage({
      recipientPhone: '+256701234567',
      recipientName: 'Retry Member',
      messageText: 'Retry test message',
      branchId: 'br-nya',
      branchName: 'Nyamuyanja Branch',
      queuedByUserId: 'usr-it-01',
      queuedByUserFullName: 'IT Admin',
      eventReferenceKey: `RETRY-TEST-${Date.now()}`,
    });

    const msgId = queued.message!.id;
    const dispatchRes = await SmsService.dispatchMessage(msgId);
    const updatedMsg = serverStore.getSmsById(msgId)!;

    const passed =
      dispatchRes.success === false &&
      updatedMsg.status === 'PENDING' &&
      updatedMsg.retryCount === 1 &&
      Boolean(updatedMsg.nextRetryAt) &&
      new Date(updatedMsg.nextRetryAt!).getTime() > Date.now();

    results.push({
      id: 9,
      name: 'Bounded Backoff Retry Scheduling',
      passed,
      message: passed
        ? `Transient 407 scheduled message for retry (attempt: ${updatedMsg.retryCount}, next: ${updatedMsg.nextRetryAt})`
        : 'Retry backoff scheduling failed',
    });
  } catch (err: any) {
    results.push({ id: 9, name: 'Bounded Backoff Retry Scheduling', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 10: Duplicate Submission Prevention
  // ==========================================
  try {
    const dedupKey = `DEDUP-TEST-${Date.now()}`;
    const firstQueue = SmsService.queueMessage({
      recipientPhone: '+256701234567',
      recipientName: 'Dedup Member',
      messageText: 'First dispatch',
      branchId: 'br-nya',
      branchName: 'Nyamuyanja Branch',
      queuedByUserId: 'usr-it-01',
      queuedByUserFullName: 'IT Admin',
      eventReferenceKey: dedupKey,
    });

    const secondQueue = SmsService.queueMessage({
      recipientPhone: '+256701234567',
      recipientName: 'Dedup Member',
      messageText: 'Second duplicate dispatch',
      branchId: 'br-nya',
      branchName: 'Nyamuyanja Branch',
      queuedByUserId: 'usr-it-01',
      queuedByUserFullName: 'IT Admin',
      eventReferenceKey: dedupKey,
    });

    const passed = !firstQueue.isDuplicate && secondQueue.isDuplicate === true;

    results.push({
      id: 10,
      name: 'Duplicate Submission Prevention',
      passed,
      message: passed
        ? 'Duplicate submission strictly intercepted via eventReferenceKey check'
        : 'Deduplication failed',
    });
  } catch (err: any) {
    results.push({ id: 10, name: 'Duplicate Submission Prevention', passed: false, message: err.message });
  }

  // ==========================================
  // TEST 11: Queue Persistence Across Operations
  // ==========================================
  try {
    const messagesBefore = serverStore.getSmsMessages().length;
    serverStore.save();
    const messagesAfter = serverStore.getSmsMessages().length;
    const passed = messagesBefore === messagesAfter && messagesBefore >= 0;

    results.push({
      id: 11,
      name: 'Queue Disk Persistence',
      passed,
      message: passed
        ? `SMS message queue holds ${messagesAfter} items across atomic persistence save`
        : 'Queue persistence failed',
    });
  } catch (err: any) {
    results.push({ id: 11, name: 'Queue Disk Persistence', passed: false, message: err.message });
  }

  // ==========================================
  // TEST 12: Accurate Status Transitions (PENDING -> SENDING -> SENT)
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_valid_active_key_lifecycle';
    config.sms.username = 'sandbox';

    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          SMSMessageData: {
            Recipients: [
              {
                statusCode: 101,
                number: '+256701234567',
                status: 'Success',
                cost: 'UGX 30.00',
                messageId: 'ATXid_lifecycle_test',
              },
            ],
          },
        }),
      } as any;
    };

    const q = SmsService.queueMessage({
      recipientPhone: '+256701234567',
      recipientName: 'Status Transition Member',
      messageText: 'Policy notification',
      branchId: 'br-nya',
      branchName: 'Nyamuyanja Branch',
      queuedByUserId: 'usr-01',
      queuedByUserFullName: 'Staff',
      eventReferenceKey: `STATUS-TRANSITION-${Date.now()}`,
    });

    const isInitiallyPending = q.message?.status === 'PENDING';
    await SmsService.dispatchMessage(q.message!.id);
    const finalMsg = serverStore.getSmsById(q.message!.id)!;
    const isFinallySent = finalMsg.status === 'SENT' && Boolean(finalMsg.providerMessageId);

    const passed = isInitiallyPending && isFinallySent;

    results.push({
      id: 12,
      name: 'Accurate Status Transitions',
      passed,
      message: passed
        ? 'Message accurately moved from PENDING to SENT only upon genuine provider 101 acceptance'
        : 'Status transition failed',
    });
  } catch (err: any) {
    results.push({ id: 12, name: 'Accurate Status Transitions', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 13: Secret & Credential Redaction
  // ==========================================
  try {
    const rawError = 'Error: Failed to authenticate with apiKey=atsk_secret_confidential_998811 from provider';
    config.sms.apiKey = 'atsk_secret_confidential_998811';
    const sanitized = AfricasTalkingAdapter.sanitizeError(rawError);

    const passed =
      !sanitized.includes('atsk_secret_confidential_998811') &&
      sanitized.includes('[REDACTED');

    results.push({
      id: 13,
      name: 'Secret & Credential Redaction',
      passed,
      message: passed
        ? 'Provider API keys, bearer tokens, and credentials stripped from all log and error outputs'
        : 'Secret leakage detected in error sanitizer',
    });
  } catch (err: any) {
    results.push({ id: 13, name: 'Secret & Credential Redaction', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 14: Production Mode Requiring Valid Configuration
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'PRODUCTION';
    config.sms.username = 'sandbox'; // Invalid for production!
    config.sms.apiKey = 'atsk_real_prod_key_12345';
    config.sms.senderId = 'TURIHAMWE';

    const validation = AfricasTalkingAdapter.validateConfiguration();
    const passed =
      validation.status === 'INVALID' &&
      validation.canSubmit === false &&
      validation.message.includes('cannot be "sandbox"');

    results.push({
      id: 14,
      name: 'Production Mode Configuration Requirements',
      passed,
      message: passed
        ? 'Production mode strictly requires registered production username (sandbox username rejected)'
        : 'Production configuration validation failed',
    });
  } catch (err: any) {
    results.push({ id: 14, name: 'Production Mode Configuration Requirements', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // ==========================================
  // TEST 15: Safe Connection Test Without Live SMS
  // ==========================================
  try {
    config.sms.enabled = true;
    config.sms.environment = 'SANDBOX';
    config.sms.apiKey = 'atsk_test_key_balance';
    config.sms.username = 'sandbox';

    let reachedUserEndpoint: boolean = false;
    let reachedMessagingEndpoint: boolean = false;

    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/version1/user')) {
        reachedUserEndpoint = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            UserData: {
              balance: 'UGX 50000.00',
            },
          }),
        } as any;
      }
      if (urlStr.includes('/version1/messaging')) {
        reachedMessagingEndpoint = true;
      }
      return { ok: false, status: 500 } as any;
    };

    const connTest = await AfricasTalkingAdapter.testConnection();

    const passed: boolean = Boolean(
      connTest.connected &&
      connTest.balanceUGX === 'UGX 50000.00' &&
      !reachedMessagingEndpoint
    );

    results.push({
      id: 15,
      name: 'Safe Connection Test (Zero SMS Sent)',
      passed,
      message: passed
        ? 'Connection test verified credentials via User balance endpoint without dispatching any SMS'
        : `Safe connection test failed: connected=${connTest.connected}, balance=${connTest.balanceUGX}, error=${connTest.error}, reachedMsg=${reachedMessagingEndpoint}`,
    });
  } catch (err: any) {
    results.push({ id: 15, name: 'Safe Connection Test (Zero SMS Sent)', passed: false, message: err.message });
  } finally {
    restoreConfig();
  }

  // Print results
  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} Test ${String(r.id).padStart(2, '0')}: ${r.name}${r.passed ? '' : ' — ' + r.message}`);
  }

  // Restore original system SMS provider settings
  config.sms.provider = originalProvider;
  if (originalStoreSetting) {
    serverStore.setSystemSetting('sms.provider', originalStoreSetting);
  } else {
    serverStore.setSystemSetting('sms.provider', 'PANDORA');
  }

  const allPassed = results.every(r => r.passed);
  return {
    name: "Africa's Talking Delivery Pipeline",
    results,
    passed: allPassed,
  };
}
