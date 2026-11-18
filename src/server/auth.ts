import {createHmac, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import type {InternalUser, PublicUser} from '../shared/srm.types';

const JWT_SECRET =
  process.env['SRM_JWT_SECRET'] || 'autocorp-srm-erp-enterprise-secret-key-2026';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derived = scryptSync(password, salt, 64);
  if (keyBuffer.length !== derived.length) return false;
  return timingSafeEqual(keyBuffer, derived);
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: PublicUser['role'];
  approverType?: PublicUser['approverType'];
  supplierId?: string;
  companyId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresInSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({alg: 'HS256', typ: 'JWT'}));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  return `${headerB64}.${payloadB64}.${base64UrlEncode(sig)}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = base64UrlEncode(
      createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest(),
    );
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(base64UrlDecode(payloadB64)) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function toPublicUser(user: InternalUser): PublicUser {
  const {
    passwordHash: _ph,
    failedLoginAttempts: _fa,
    lockedUntil: _lu,
    activeSessions: _as,
    ...pub
  } = user;
  void _ph;
  void _fa;
  void _lu;
  void _as;
  return pub;
}

// Ephemeral in-memory CAPTCHA and OTP stores
interface CaptchaEntry {
  answer: string;
  expiresAt: number;
}

interface OtpEntry {
  code: string;
  target: string;
  purpose: 'MFA' | 'RESET' | 'SUPPLIER_VERIFY';
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();
const otpStore = new Map<string, OtpEntry>();

export function createCaptchaChallenge(): {
  captchaId: string;
  question: string;
} {
  const a = Math.floor(Math.random() * 14) + 5;
  const b = Math.floor(Math.random() * 9) + 2;
  const captchaId = randomBytes(8).toString('hex');
  captchaStore.set(captchaId, {
    answer: String(a + b),
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return {captchaId, question: `${a} + ${b} = ?`};
}

export function verifyCaptchaChallenge(
  captchaId?: string,
  answer?: string,
): boolean {
  if (!captchaId || !answer) return false;
  const entry = captchaStore.get(captchaId);
  if (!entry) return false;
  captchaStore.delete(captchaId);
  if (Date.now() > entry.expiresAt) return false;
  return entry.answer === answer.trim();
}

export function issueOtp(
  target: string,
  purpose: OtpEntry['purpose'],
): {otpId: string; code: string} {
  const otpId = randomBytes(8).toString('hex');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(otpId, {
    code,
    target,
    purpose,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return {otpId, code};
}

export function verifyOtp(
  otpId: string,
  code: string,
  purpose: OtpEntry['purpose'],
): {valid: boolean; target?: string} {
  const entry = otpStore.get(otpId);
  if (!entry) return {valid: false};
  if (entry.purpose !== purpose || Date.now() > entry.expiresAt) {
    otpStore.delete(otpId);
    return {valid: false};
  }
  if (entry.code !== code.trim()) return {valid: false};
  otpStore.delete(otpId);
  return {valid: true, target: entry.target};
}
