import { config } from '../config';
import { SmsConfigurationStatus } from '../../types';

export interface PandoraValidationResult {
  status: SmsConfigurationStatus;
  provider: 'PANDORA';
  canSubmit: boolean;
  message: string;
  senderId: string;
  hasUsername: boolean;
  hasPassword: boolean;
  isPlaceholder: boolean;
  apiUrl: string;
}

export interface PandoraSubmissionResult {
  success: boolean;
  providerMessageId?: string;
  costUGX?: number;
  deliveryStatus?: string;
  statusCode?: number;
  error?: string;
  isTransientFailure?: boolean;
  deliveryConfirmed?: boolean;
}

export interface PandoraConnectionTestResult {
  connected: boolean;
  provider: 'PANDORA';
  balanceUGX?: string | null;
  message: string;
  error?: string;
  checkedAt: string;
}

export class PandoraAdapter {
  private static readonly DEFAULT_API_URL = 'https://www.sms.thepandoranetworks.com/API/send_sms/';
  private static readonly DEFAULT_BALANCE_URL = 'https://www.sms.thepandoranetworks.com/API/balance_inquiry.php';

  /**
   * Redact passwords, usernames, and secret tokens so sensitive credentials
   * are NEVER leaked into error messages, audit logs, or telemetry payloads.
   */
  public static sanitizeError(errorText: string | undefined | null): string {
    if (!errorText) return 'Unknown provider communication error';
    let sanitized = String(errorText);

    const password = config.sms.pandora?.password;
    if (password && password.length > 2) {
      sanitized = sanitized.split(password).join('[REDACTED]');
    }

    const username = config.sms.pandora?.username;
    if (username && username.length > 2) {
      sanitized = sanitized.split(username).join('[REDACTED]');
    }

    sanitized = sanitized.replace(/password[:=]\s*['"]?[^&'"\s]+['"]?/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/username[:=]\s*['"]?[^&'"\s]+['"]?/gi, 'username=[REDACTED]');
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

    return sanitized;
  }

  /**
   * Validate configuration status for Pandora SMS.
   * Never throws so callers can safely inspect system diagnostics.
   */
  public static validateConfiguration(): PandoraValidationResult {
    const isEnabled = config.sms.enabled;
    const pandoraCfg = config.sms.pandora || {
      apiUrl: PandoraAdapter.DEFAULT_API_URL,
      balanceUrl: PandoraAdapter.DEFAULT_BALANCE_URL,
      username: '',
      password: '',
      senderId: 'NYAMUYANJA',
    };

    const rawUsername = (pandoraCfg.username || '').trim();
    const rawPassword = (pandoraCfg.password || '').trim();
    const rawSenderId = (pandoraCfg.senderId || 'NYAMUYANJA').trim();

    const hasUsername = Boolean(rawUsername);
    const hasPassword = Boolean(rawPassword);

    const isPlaceholder =
      !hasUsername ||
      !hasPassword ||
      rawUsername.toLowerCase().includes('placeholder') ||
      rawPassword.toLowerCase().includes('placeholder') ||
      rawUsername === 'pandora_user' ||
      rawPassword === 'pandora_pass';

    if (!isEnabled) {
      return {
        status: 'DISABLED',
        provider: 'PANDORA',
        canSubmit: false,
        message: 'SMS provider dispatch is disabled via SMS_ENABLED=false.',
        senderId: rawSenderId,
        hasUsername,
        hasPassword,
        isPlaceholder,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    if (isPlaceholder || !hasUsername || !hasPassword) {
      return {
        status: 'MISSING',
        provider: 'PANDORA',
        canSubmit: false,
        message:
          'Pandora SMS submission is not configured on this deployment, so queued messages stay in the queue and are never marked as sent. Provider credentials are held only by the secure backend service, never by this interface.',
        senderId: rawSenderId,
        hasUsername,
        hasPassword,
        isPlaceholder: true,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    // Validate Sender ID: Alphanumeric max 11 characters (GSM standard)
    if (rawSenderId.length > 11) {
      return {
        status: 'INVALID',
        provider: 'PANDORA',
        canSubmit: false,
        message: `Invalid Sender ID '${rawSenderId}': Exceeds 11-character maximum alphanumeric limit required by Ugandan telcos and Pandora SMS. Use 'NYAMUYANJA' (10 chars).`,
        senderId: rawSenderId,
        hasUsername,
        hasPassword,
        isPlaceholder: false,
        apiUrl: pandoraCfg.apiUrl,
      };
    }

    return {
      status: 'CONFIGURED',
      provider: 'PANDORA',
      canSubmit: true,
      message: 'Pandora SMS is configured and ready for transactional dispatch to Ugandan networks.',
      senderId: rawSenderId,
      hasUsername: true,
      hasPassword: true,
      isPlaceholder: false,
      apiUrl: pandoraCfg.apiUrl,
    };
  }

  /**
   * Normalizes a phone number for Uganda networks (MTN, Airtel).
   * E.g. "+256701234567" -> "256701234567" or "+256701234567"
   */
  public static normalizeUgandanPhone(phone: string): string {
    let clean = phone.replace(/[^0-9+]/g, '');
    if (clean.startsWith('0')) {
      clean = '256' + clean.substring(1);
    } else if (clean.startsWith('+256')) {
      clean = clean.substring(1);
    } else if (!clean.startsWith('256')) {
      clean = '256' + clean;
    }
    return clean;
  }

  /**
   * Sanitizes and normalizes an alphanumeric Sender ID to comply with GSM-7 max 11 chars.
   */
  public static sanitizeSenderId(senderId?: string): string {
    const raw = (senderId || config.sms.pandora.senderId || 'NYAMUYANJA').trim();
    const alphanumeric = raw.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumeric.length > 11) {
      return alphanumeric.substring(0, 11);
    }
    return alphanumeric || 'NYAMUYANJA';
  }

  /**
   * Safely submit an SMS via Pandora Networks official API.
   * Endpoint: https://www.sms.thepandoranetworks.com/API/send_sms/
   * Parameters: Number, Message, Sender, Username, Password, message_type=non_customised, message_category=bulk
   */
  public static async submitMessage(params: {
    to: string;
    messageText: string;
    senderId?: string;
  }): Promise<PandoraSubmissionResult> {
    const validation = this.validateConfiguration();
    if (!validation.canSubmit) {
      return {
        success: false,
        error: validation.message,
        isTransientFailure: false,
      };
    }

    const pandoraCfg = config.sms.pandora;
    const recipient = this.normalizeUgandanPhone(params.to);

    // Validate normalized recipient
    if (!recipient.startsWith('256') || recipient.length !== 12) {
      return {
        success: false,
        error: `Invalid Uganda phone number '${params.to}'. Must be a 12-digit number beginning with 256 (e.g. 256772123456).`,
        isTransientFailure: false,
      };
    }

    // Sender ID: Default to NYAMUYANJA (max 11 chars)
    let sender = (params.senderId || pandoraCfg.senderId || 'NYAMUYANJA').trim();
    if (sender.length > 11) {
      sender = sender.substring(0, 11);
    }

    const payload = new URLSearchParams({
      Username: pandoraCfg.username,
      Password: pandoraCfg.password || '',
      Number: recipient,
      Message: params.messageText,
      Sender: sender,
      message_type: 'non_customised',
      message_category: 'bulk',
    });

    const apiUrl = pandoraCfg.apiUrl || this.DEFAULT_API_URL;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12-second timeout

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
        },
        body: payload.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Response might be a plain text status or HTML error
      }

      if (response.ok) {
        // Pandora API returns JSON with { success: true, message: "..." } or { status: "success" }
        const isSuccess =
          parsed?.success === true ||
          parsed?.status === 'success' ||
          (typeof parsed?.message === 'string' && parsed.message.toLowerCase().includes('success')) ||
          rawText.toLowerCase().includes('success');

        if (isSuccess) {
          const providerMsgId =
            parsed?.message_id ||
            parsed?.id ||
            parsed?.transaction_ref ||
            rawText.match(/ID:\s*([A-Za-z0-9_-]+)/i)?.[1] ||
            `pandora-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

          return {
            success: true,
            providerMessageId: providerMsgId,
            costUGX: 30.0, // Standard Uganda SMS rate
            deliveryStatus: 'Submitted',
            statusCode: 200,
            deliveryConfirmed: false, // Handset delivery requires DLR; HTTP success is provider submission confirmation
          };
        } else {
          const rawErr = parsed?.error_message || parsed?.error || parsed?.message || rawText || 'Pandora SMS rejected message submission';
          return {
            success: false,
            statusCode: response.status,
            error: this.sanitizeError(rawErr),
            isTransientFailure: false,
          };
        }
      }

      // HTTP Error Handling
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          statusCode: response.status,
          error: 'Pandora SMS Authentication Failed: Invalid Username or Password.',
          isTransientFailure: false,
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          statusCode: 429,
          error: 'Pandora SMS Rate Limit Exceeded: Eligible for retry.',
          isTransientFailure: true,
        };
      }

      return {
        success: false,
        statusCode: response.status,
        error: this.sanitizeError(`Pandora API returned HTTP ${response.status}: ${rawText.substring(0, 200)}`),
        isTransientFailure: response.status >= 500,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'Network timeout: Pandora API did not respond within 12 seconds. Submission outcome uncertain; scheduled for guarded retry.',
          isTransientFailure: true,
        };
      }

      return {
        success: false,
        error: this.sanitizeError(`Network communication error with Pandora SMS: ${err.message}`),
        isTransientFailure: true,
      };
    }
  }

  /**
   * Diagnostic connection and balance verification.
   * Strictly queries balance endpoint; DOES NOT send any SMS messages.
   */
  public static async testConnection(): Promise<PandoraConnectionTestResult> {
    const validation = this.validateConfiguration();
    const checkedAt = new Date().toISOString();

    if (!validation.canSubmit) {
      return {
        connected: false,
        provider: 'PANDORA',
        message: validation.message,
        error: validation.message,
        checkedAt,
      };
    }

    const pandoraCfg = config.sms.pandora;
    const balanceUrl = pandoraCfg.balanceUrl || this.DEFAULT_BALANCE_URL;
    const url = new URL(balanceUrl);
    url.searchParams.set('username', pandoraCfg.username);
    url.searchParams.set('password', pandoraCfg.password || '');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const raw = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {}

      if (response.ok) {
        const balance =
          parsed?.balance !== undefined
            ? String(parsed.balance)
            : parsed?.credits !== undefined
            ? String(parsed.credits)
            : raw.replace(/[^0-9.]/g, '') || 'Active';

        return {
          connected: true,
          provider: 'PANDORA',
          balanceUGX: balance,
          message: `Connection successful: Pandora SMS gateway reachable. Available balance/credits: ${balance}`,
          checkedAt,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          connected: false,
          provider: 'PANDORA',
          message: 'Authentication failed: Invalid Pandora username or password.',
          error: 'Authentication failed: Invalid credentials.',
          checkedAt,
        };
      }

      return {
        connected: false,
        provider: 'PANDORA',
        message: `Pandora balance endpoint returned HTTP ${response.status}`,
        error: this.sanitizeError(raw.substring(0, 150)),
        checkedAt,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        connected: false,
        provider: 'PANDORA',
        message: 'Could not connect to Pandora balance API.',
        error: this.sanitizeError(err.message),
        checkedAt,
      };
    }
  }
}
