import { config } from '../config';
import { SmsConfigurationStatus } from '../../types';

export interface ProviderValidationResult {
  status: SmsConfigurationStatus;
  environment: 'SANDBOX' | 'PRODUCTION';
  canSubmit: boolean;
  message: string;
  senderId: string;
  hasApiKey: boolean;
  isPlaceholderKey: boolean;
}

export interface ProviderSubmissionResult {
  success: boolean;
  providerMessageId?: string;
  costUGX?: number;
  deliveryStatus?: string;
  statusCode?: number;
  error?: string;
  isTransientFailure?: boolean;
  deliveryConfirmed?: boolean;
}

export interface ProviderConnectionTestResult {
  connected: boolean;
  environment: 'SANDBOX' | 'PRODUCTION';
  balanceUGX?: string | null;
  message: string;
  error?: string;
  checkedAt: string;
}

export class AfricasTalkingAdapter {
  private static readonly SANDBOX_BASE_URL = 'https://api.sandbox.africastalking.com';
  private static readonly PRODUCTION_BASE_URL = 'https://api.africastalking.com';

  /**
   * Sanitize strings to ensure API keys, authorization tokens, or sensitive credentials
   * are NEVER leaked into error messages, audit logs, or telemetry payloads.
   */
  public static sanitizeError(errorText: string | undefined | null): string {
    if (!errorText) return 'Unknown provider communication error';
    let sanitized = String(errorText);

    // Redact API keys and potential tokens
    const currentApiKey = config.sms.apiKey;
    if (currentApiKey && currentApiKey.length > 4) {
      sanitized = sanitized.split(currentApiKey).join('[REDACTED_API_KEY]');
    }

    // Generic pattern redaction for tokens or secrets
    sanitized = sanitized.replace(/apiKey[:=]\s*['"]?[a-zA-Z0-9_-]+['"]?/gi, 'apiKey=[REDACTED]');
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/atsk_[a-zA-Z0-9_-]+/gi, '[REDACTED_AT_KEY]');

    return sanitized;
  }

  /**
   * Validate configuration status against deployment environment requirements.
   * Never throws so caller can safely determine diagnostic state.
   */
  public static validateConfiguration(): ProviderValidationResult {
    const isEnabled = config.sms.enabled;
    const environment = config.sms.environment;
    const rawApiKey = (config.sms.apiKey || '').trim();
    const username = (config.sms.username || '').trim();
    const senderId = (config.sms.senderId || '').trim();

    const hasApiKey = Boolean(rawApiKey);
    const isPlaceholderKey =
      rawApiKey.includes('placeholder') ||
      rawApiKey.includes('atsk_sandbox_development_key') ||
      rawApiKey === 'atsk_...' ||
      rawApiKey.length < 8;

    if (!isEnabled) {
      return {
        status: 'DISABLED',
        environment,
        canSubmit: false,
        message: 'SMS provider dispatch is disabled via SMS_ENABLED=false.',
        senderId,
        hasApiKey,
        isPlaceholderKey,
      };
    }

    if (!hasApiKey) {
      return {
        status: 'MISSING',
        environment,
        canSubmit: false,
        message: "Africa's Talking submission is not configured on this deployment, so queued messages stay in the queue and are never marked as sent. Provider credentials are held only by the secure backend service, never by this interface.",
        senderId,
        hasApiKey: false,
        isPlaceholderKey: false,
      };
    }

    if (isPlaceholderKey) {
      return {
        status: 'MISSING',
        environment,
        canSubmit: false,
        message: "Africa's Talking submission is not configured on this deployment, so queued messages stay in the queue and are never marked as sent. Provider credentials are held only by the secure backend service, never by this interface.",
        senderId,
        hasApiKey: true,
        isPlaceholderKey: true,
      };
    }

    if (environment === 'PRODUCTION') {
      if (!username || username.toLowerCase() === 'sandbox') {
        return {
          status: 'INVALID',
          environment,
          canSubmit: false,
          message: 'Invalid configuration: AT_USERNAME cannot be "sandbox" when SMS_ENVIRONMENT is set to PRODUCTION.',
          senderId,
          hasApiKey,
          isPlaceholderKey,
        };
      }
      if (!senderId) {
        return {
          status: 'INVALID',
          environment,
          canSubmit: false,
          message: 'Invalid configuration: AT_SENDER_ID must be specified for production deployment.',
          senderId: '',
          hasApiKey,
          isPlaceholderKey,
        };
      }
    }

    return {
      status: 'CONFIGURED',
      environment,
      canSubmit: true,
      message: `Africa's Talking ${environment} gateway configured and ready.`,
      senderId,
      hasApiKey: true,
      isPlaceholderKey: false,
    };
  }

  /**
   * Safe connection and credentials verification.
   * Queries the Africa's Talking User / Account balance endpoint.
   * CRITICAL: This tests authentication and connectivity WITHOUT sending any SMS.
   */
  public static async testConnection(): Promise<ProviderConnectionTestResult> {
    const validation = this.validateConfiguration();
    const checkedAt = new Date().toISOString();

    if (!validation.canSubmit) {
      return {
        connected: false,
        environment: validation.environment,
        balanceUGX: null,
        message: validation.message,
        error: validation.message,
        checkedAt,
      };
    }

    const isSandbox = validation.environment === 'SANDBOX';
    const baseUrl = isSandbox ? this.SANDBOX_BASE_URL : this.PRODUCTION_BASE_URL;
    const username = isSandbox ? 'sandbox' : (config.sms.username || '').trim();
    const apiKey = (config.sms.apiKey || '').trim();

    const targetUrl = `${baseUrl}/version1/user?username=${encodeURIComponent(username)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'apiKey': apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errDesc = `HTTP ${response.status} ${response.statusText}`;
        if (response.status === 401 || response.status === 403) {
          errDesc = 'Authentication failed: Invalid Africa\'s Talking API credentials for this environment.';
        } else if (errorBody) {
          errDesc += `: ${errorBody.slice(0, 120)}`;
        }

        return {
          connected: false,
          environment: validation.environment,
          balanceUGX: null,
          message: 'Connection failed: ' + errDesc,
          error: this.sanitizeError(errDesc),
          checkedAt,
        };
      }

      const data: any = await response.json();
      const balance = data?.UserData?.balance || null;

      return {
        connected: true,
        environment: validation.environment,
        balanceUGX: balance,
        message: `Successfully connected to Africa's Talking ${validation.environment} API.${balance ? ' Account balance: ' + balance : ''}`,
        checkedAt,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const cleanError = isTimeout
        ? 'Connection timed out after 8 seconds reaching Africa\'s Talking API.'
        : `Network error: ${err.message || 'Unable to establish HTTPS connection'}`;

      return {
        connected: false,
        environment: validation.environment,
        balanceUGX: null,
        message: cleanError,
        error: this.sanitizeError(cleanError),
        checkedAt,
      };
    }
  }

  /**
   * Submit an SMS message to Africa's Talking API.
   * Strictly adheres to the official Africa's Talking REST API specification.
   */
  public static async submitMessage(params: {
    to: string;
    messageText: string;
    senderId?: string;
  }): Promise<ProviderSubmissionResult> {
    const validation = this.validateConfiguration();

    if (!validation.canSubmit) {
      return {
        success: false,
        error: validation.message,
        isTransientFailure: false,
      };
    }

    const isSandbox = validation.environment === 'SANDBOX';
    const baseUrl = isSandbox ? this.SANDBOX_BASE_URL : this.PRODUCTION_BASE_URL;
    const username = isSandbox ? 'sandbox' : (config.sms.username || '').trim();
    const apiKey = (config.sms.apiKey || '').trim();
    const endpoint = `${baseUrl}/version1/messaging`;

    // Prepare body parameters
    const bodyParams = new URLSearchParams();
    bodyParams.append('username', username);
    bodyParams.append('to', params.to);
    bodyParams.append('message', params.messageText);

    // In production, specify sender ID if configured
    const effectiveSenderId = params.senderId || config.sms.senderId;
    if (!isSandbox && effectiveSenderId) {
      bodyParams.append('from', effectiveSenderId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apiKey': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: bodyParams.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        let failureDesc = `Africa's Talking HTTP ${response.status}`;
        const isTransient = response.status >= 500 || response.status === 429;

        if (response.status === 401) {
          failureDesc = 'Africa\'s Talking API Key unauthorized (401).';
        } else if (response.status === 403) {
          failureDesc = 'Africa\'s Talking access forbidden (403): Check account permissions or environment.';
        } else if (errorText) {
          failureDesc += `: ${errorText.slice(0, 150)}`;
        }

        return {
          success: false,
          error: this.sanitizeError(failureDesc),
          isTransientFailure: isTransient,
        };
      }

      const data: any = await response.json();
      const recipients = data?.SMSMessageData?.Recipients;
      const overallMessage = data?.SMSMessageData?.Message || '';

      if (!Array.isArray(recipients) || recipients.length === 0) {
        return {
          success: false,
          error: this.sanitizeError(overallMessage || 'Africa\'s Talking response returned no recipient acknowledgements.'),
          isTransientFailure: false,
        };
      }

      const recipient = recipients[0];
      const statusCode = typeof recipient.statusCode === 'number' ? recipient.statusCode : parseInt(recipient.statusCode, 10);
      const recipientStatus = recipient.status || 'Unknown';

      // 101: Success (accepted for dispatch), 102: Waiting for message to be sent
      if (recipientStatus === 'Success' || statusCode === 101 || statusCode === 102) {
        let costUGX = 30.0;
        if (recipient.cost) {
          const parsed = parseFloat(String(recipient.cost).replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed) && parsed > 0) costUGX = parsed;
        }

        // Africa's Talking initial response indicates submission acceptance (statusCode 101/102).
        // Authoritative handset delivery confirmation is only provided asynchronously via delivery reports.
        // In Sandbox mode, messages are routed exclusively to the Africa's Talking Simulator, not physical phones.
        const deliveryStatus = recipientStatus || (isSandbox ? 'SimulatedSandbox' : 'Submitted');

        return {
          success: true,
          providerMessageId: recipient.messageId || `ATX_${Date.now()}`,
          costUGX,
          deliveryStatus,
          statusCode,
          deliveryConfirmed: false,
        };
      }

      // Map Africa's Talking specific error codes to helpful, sanitized messages
      let mappedError = `Provider rejected recipient (Status: ${recipientStatus}, Code: ${statusCode})`;
      let isTransient = false;

      switch (statusCode) {
        case 401:
          mappedError = 'RiskHold: Message flagged by provider security risk checks.';
          break;
        case 402:
          mappedError = 'InvalidSenderId: The requested Sender ID is not approved for this account.';
          break;
        case 403:
          mappedError = 'InvalidPhoneNumber: Recipient phone number format rejected by telecom provider.';
          break;
        case 404:
          mappedError = 'UnsupportedNumberType: Destination phone number type is unsupported for SMS.';
          break;
        case 405:
          mappedError = 'InsufficientBalance: Africa\'s Talking account balance is insufficient to dispatch SMS.';
          break;
        case 406:
          mappedError = 'UserInBlacklist: Recipient number is on telecommunication do-not-disturb blacklist.';
          break;
        case 407:
          mappedError = 'CouldNotRoute: Telecom routing path unavailable. Eligible for retry.';
          isTransient = true;
          break;
        case 500:
        case 501:
        case 502:
          mappedError = `Gateway error (${statusCode}) at telecommunications provider. Eligible for retry.`;
          isTransient = true;
          break;
        default:
          if (recipientStatus) {
            mappedError = `Africa's Talking submission rejected: ${recipientStatus}`;
          }
      }

      return {
        success: false,
        statusCode,
        deliveryStatus: recipientStatus,
        error: this.sanitizeError(mappedError),
        isTransientFailure: isTransient,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const errMsg = isTimeout
        ? 'Submission timed out after 10 seconds waiting for Africa\'s Talking gateway.'
        : `Network exception communicating with Africa\'s Talking API: ${err.message || 'Connection lost'}`;

      return {
        success: false,
        error: this.sanitizeError(errMsg),
        isTransientFailure: true, // Network timeouts are transient
      };
    }
  }
}
