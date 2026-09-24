import { createHash } from 'node:crypto';
import {
  fetchYandexProfile,
  startYandexOAuth,
  verifyYandexState,
  YANDEX_COOKIE,
  yandexCookieOptions,
} from './yandex-oauth';

describe('Yandex OAuth protocol', () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();
  const response = (body: unknown, ok = true) => ({
    ok,
    json: async () => body,
  });

  beforeEach(() => {
    process.env.YANDEX_CLIENT_ID = 'client';
    process.env.YANDEX_CLIENT_SECRET = 'secret';
    process.env.JWT_SECRET = 'test-signing-key';
    process.env.YANDEX_CALLBACK_URL =
      'https://api.example.com/auth/yandex/callback';
    fetchMock.mockReset();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('binds a random state to the browser and uses PKCE S256', () => {
    const first = startYandexOAuth();
    const second = startYandexOAuth();
    const url = new URL(first.url);
    const state = url.searchParams.get('state');
    const verifier = verifyYandexState(
      `other=x; ${YANDEX_COOKIE}=${first.cookie}`,
      state,
    );
    expect(url.origin).toBe('https://oauth.yandex.ru');
    expect(url.searchParams.get('redirect_uri')).toBe(
      process.env.YANDEX_CALLBACK_URL,
    );
    expect(url.searchParams.get('scope')).toBe('login:email login:info');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(second.cookie).not.toBe(first.cookie);
    expect(first.maxAge).toBe(600_000);
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('rejects missing, mismatched, malformed, duplicate, tampered, and expired state cookies', () => {
    jest.useFakeTimers();
    const flow = startYandexOAuth();
    const state = new URL(flow.url).searchParams.get('state');
    const cookie = `${YANDEX_COOKIE}=${flow.cookie}`;
    for (const [header, value] of [
      [undefined, state],
      [cookie, 'wrong'],
      [cookie, undefined],
      [cookie, [state]],
      [`${YANDEX_COOKIE}=%broken`, state],
      [`${cookie}; ${cookie}`, state],
      [`${YANDEX_COOKIE}=x${flow.cookie}`, state],
      [`${cookie}.extra`, state],
    ]) {
      expect(() =>
        verifyYandexState(header as string | undefined, value),
      ).toThrow('yandex_state_invalid');
    }
    jest.advanceTimersByTime(600_001);
    expect(() => verifyYandexState(cookie, state)).toThrow(
      'yandex_state_invalid',
    );
  });

  it('sets host-only HttpOnly cookies, with Secure required in production', () => {
    process.env.NODE_ENV = 'production';
    expect(yandexCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/auth/yandex',
    });
    delete process.env.JWT_SECRET;
    expect(startYandexOAuth).toThrow('yandex_not_configured');
  });

  it('requires client configuration', () => {
    delete process.env.YANDEX_CLIENT_SECRET;
    expect(startYandexOAuth).toThrow('yandex_not_configured');
  });

  it('exchanges the code server-side and retrieves the profile with an OAuth header', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'provider-token' }))
      .mockResolvedValueOnce(
        response({
          id: '42',
          client_id: 'client',
          default_email: 'user@yandex.ru',
          login: 'user',
        }),
      );
    await expect(fetchYandexProfile('1234567', 'verifier')).resolves.toEqual({
      id: '42',
      email: 'user@yandex.ru',
      login: 'user',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth.yandex.ru/token');
    expect(Object.fromEntries(init.body)).toEqual({
      grant_type: 'authorization_code',
      code: '1234567',
      client_id: 'client',
      client_secret: 'secret',
      code_verifier: 'verifier',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://login.yandex.ru/info?format=json',
    );
    expect(fetchMock.mock.calls[1][1].headers).toEqual({
      Authorization: 'OAuth provider-token',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each([null, {}, { access_token: '' }, { access_token: 123 }])(
    'rejects malformed token response %j',
    async (body) => {
      fetchMock.mockResolvedValueOnce(response(body));
      await expect(fetchYandexProfile('code', 'verifier')).rejects.toThrow(
        'yandex_auth_failed',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    {},
    { id: '', client_id: 'client' },
    { id: '42', client_id: 'other' },
    { id: 42, client_id: 'client' },
  ])('rejects invalid profile %j', async (profile) => {
    fetchMock
      .mockResolvedValueOnce(response({ access_token: 'token' }))
      .mockResolvedValueOnce(response(profile));
    await expect(fetchYandexProfile('code', 'verifier')).rejects.toThrow(
      'yandex_profile_invalid',
    );
  });

  it.each([0, 1])('handles an API failure at step %s', async (step) => {
    if (step === 1)
      fetchMock.mockResolvedValueOnce(response({ access_token: 'token' }));
    fetchMock.mockResolvedValueOnce(
      response({ error: 'invalid_grant' }, false),
    );
    await expect(fetchYandexProfile('used-code', 'verifier')).rejects.toThrow(
      'yandex_auth_failed',
    );
  });

  it.each([0, 1])(
    'aborts a slow request at step %s after 10 seconds',
    async (step) => {
      jest.useFakeTimers();
      const timeout = jest
        .spyOn(AbortSignal, 'timeout')
        .mockImplementation((ms) => {
          const controller = new AbortController();
          setTimeout(() => controller.abort(new Error('timeout')), ms);
          return controller.signal;
        });
      if (step === 1)
        fetchMock.mockResolvedValueOnce(response({ access_token: 'token' }));
      fetchMock.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(init.signal.reason),
            );
          }),
      );
      const assertion = expect(
        fetchYandexProfile('code', 'verifier'),
      ).rejects.toThrow('timeout');
      await jest.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(timeout).toHaveBeenLastCalledWith(10_000);
    },
  );
});
