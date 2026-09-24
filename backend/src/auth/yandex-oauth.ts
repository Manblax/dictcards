import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CookieOptions } from 'express';

export const YANDEX_COOKIE = 'yandex_oauth';
const TTL_MS = 10 * 60 * 1000;

export class YandexAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function yandexConfig() {
  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;
  if (
    !clientId ||
    !clientSecret ||
    (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET)
  ) {
    throw new YandexAuthError('yandex_not_configured');
  }
  return {
    clientId,
    clientSecret,
    callbackUrl:
      process.env.YANDEX_CALLBACK_URL ||
      'http://localhost:3001/auth/yandex/callback',
  };
}

export function yandexCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/yandex',
  };
}

function signature(payload: string) {
  return createHmac(
    'sha256',
    process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
  )
    .update(`yandex-oauth:${payload}`)
    .digest();
}

export function startYandexOAuth() {
  const config = yandexConfig();
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ state, verifier, expiresAt: Date.now() + TTL_MS }),
  ).toString('base64url');
  const url = new URL('https://oauth.yandex.ru/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: 'login:email login:info',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  return {
    url: url.toString(),
    cookie: `${payload}.${signature(payload).toString('base64url')}`,
    maxAge: TTL_MS,
  };
}

export function verifyYandexState(
  cookieHeader: string | undefined,
  state: unknown,
): string {
  try {
    const cookies = cookieHeader
      ?.split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${YANDEX_COOKIE}=`));
    if (cookies?.length !== 1 || typeof state !== 'string' || !state)
      throw new Error();
    const value = decodeURIComponent(
      cookies[0].slice(YANDEX_COOKIE.length + 1),
    );
    const [payload, encodedSignature, extra] = value.split('.');
    if (!payload || !encodedSignature || extra !== undefined) throw new Error();
    const received = Buffer.from(encodedSignature, 'base64url');
    const expected = signature(payload);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new Error();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      state: unknown;
      verifier: unknown;
      expiresAt: unknown;
    };
    if (
      data.state !== state ||
      typeof data.expiresAt !== 'number' ||
      data.expiresAt <= Date.now() ||
      typeof data.verifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(data.verifier)
    )
      throw new Error();
    return data.verifier;
  } catch {
    throw new YandexAuthError('yandex_state_invalid');
  }
}

export async function fetchYandexProfile(code: string, verifier: string) {
  const config = yandexConfig();
  const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenResponse.ok) throw new YandexAuthError('yandex_auth_failed');
  const token: unknown = await tokenResponse.json();
  if (
    !token ||
    typeof token !== 'object' ||
    !('access_token' in token) ||
    typeof token.access_token !== 'string' ||
    !token.access_token
  )
    throw new YandexAuthError('yandex_auth_failed');
  const profileResponse = await fetch(
    'https://login.yandex.ru/info?format=json',
    {
      headers: { Authorization: `OAuth ${token.access_token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!profileResponse.ok) throw new YandexAuthError('yandex_auth_failed');
  const profile: unknown = await profileResponse.json();
  if (
    !profile ||
    typeof profile !== 'object' ||
    !('id' in profile) ||
    typeof profile.id !== 'string' ||
    !profile.id.trim() ||
    !('client_id' in profile) ||
    profile.client_id !== config.clientId
  )
    throw new YandexAuthError('yandex_profile_invalid');
  return {
    id: profile.id,
    email:
      'default_email' in profile && typeof profile.default_email === 'string'
        ? profile.default_email
        : undefined,
    login:
      'login' in profile && typeof profile.login === 'string'
        ? profile.login
        : undefined,
  };
}
