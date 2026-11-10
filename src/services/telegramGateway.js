import { getSetting } from '../db/repo.js';

/*
 * Telegram Gateway (gateway.telegram.org): sends a verification code to a phone number
 * as a Telegram message and checks the code the user types back.
 * Token: admin panel → Settings → Start questionnaire (stored in the database only).
 */

export class GatewayError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // Gateway's error code, e.g. PHONE_NUMBER_INVALID
  }
}

const BASE = 'https://gatewayapi.telegram.org';
export const CODE_LENGTH = 6;
export const CODE_TTL_SECONDS = 600;

// Errors that are the user's (bad number), not a setup problem.
const USER_ERRORS = new Set(['PHONE_NUMBER_INVALID', 'PHONE_NUMBER_NOT_AVAILABLE']);
export const isUserError = (err) => err instanceof GatewayError && USER_ERRORS.has(err.code);

async function call(method, params) {
  const token = await getSetting('telegram_gateway_token');
  if (!token) throw new GatewayError('The Telegram Gateway token isn’t set (admin panel → Settings → Start questionnaire)', 'NO_TOKEN');
  let res;
  try {
    res = await fetch(`${BASE}/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new GatewayError(`Could not reach Telegram Gateway: ${err.message}`, 'NETWORK');
  }
  const body = await res.json().catch(() => null);
  if (!body?.ok) throw new GatewayError(`Telegram Gateway: ${body?.error ?? `HTTP ${res.status}`}`, body?.error ?? `HTTP_${res.status}`);
  return body.result;
}

/** "+44 7700-900 123", "447700900123" → "+447700900123", or null if it can't be a phone number. */
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/[\s\-().]/g, '').replace(/^00/, '+');
  const e164 = digits.startsWith('+') ? digits : `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Sends a code. Returns Gateway's request_id, needed to check the code. */
export async function sendCode(phone, telegramId) {
  const result = await call('sendVerificationMessage', {
    phone_number: phone,
    code_length: CODE_LENGTH,
    ttl: CODE_TTL_SECONDS,
    payload: String(telegramId),
  });
  return result.request_id;
}

/** Checks a code: 'code_valid' | 'code_invalid' | 'code_max_attempts_exceeded' | 'expired'. */
export async function checkCode(requestId, code) {
  const result = await call('checkVerificationStatus', { request_id: requestId, code });
  return result.verification_status?.status ?? 'code_invalid';
}
