import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { YandexAuthError } from './yandex-oauth';

describe('Yandex auth HTTP routes', () => {
  let app: INestApplication;
  const originalEnv = { ...process.env };
  const loginWithYandexCode = jest.fn();
  const result = {
    access_token: 'app-token',
    user: { id: 'user-id', username: 'demo', email: 'demo@yandex.ru' },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { loginWithYandexCode } }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    process.env.YANDEX_CLIENT_ID = 'client';
    process.env.YANDEX_CLIENT_SECRET = 'secret';
    process.env.JWT_SECRET = 'test-signing-key';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    loginWithYandexCode.mockReset().mockResolvedValue(result);
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  afterAll(async () => {
    await app.close();
  });

  async function start() {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.get('/auth/yandex').expect(302);
    const state = new URL(response.headers.location as string).searchParams.get(
      'state',
    )!;
    return { agent, state, response };
  }

  it('redirects credentials in the fragment, clears the cookie and refuses a callback replay', async () => {
    const { agent, state, response } = await start();
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(response.headers['set-cookie'][0]).toContain('Path=/auth/yandex');
    const callback = await agent
      .get('/auth/yandex/callback')
      .query({ state, code: '1234567' })
      .expect(302);
    const url = new URL(callback.headers.location as string);
    expect(url.origin + url.pathname + url.search).toBe(
      'http://localhost:3000/auth/callback?provider=yandex',
    );
    expect(Object.fromEntries(new URLSearchParams(url.hash.slice(1)))).toEqual({
      access_token: result.access_token,
      ...result.user,
    });
    expect(callback.headers['cache-control']).toBe('no-store');
    expect(callback.headers['referrer-policy']).toBe('no-referrer');
    expect(callback.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect(loginWithYandexCode).toHaveBeenCalledWith(
      '1234567',
      expect.stringMatching(/^[\w-]{43}$/),
    );
    const replay = await agent
      .get('/auth/yandex/callback')
      .query({ state, code: '1234567' })
      .expect(302);
    expect(replay.headers.location).toContain('error=yandex_state_invalid');
    expect(loginWithYandexCode).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ error: 'access_denied' }, 'yandex_access_denied'],
    [{}, 'yandex_code_missing'],
    [{ code: ['one', 'two'] }, 'yandex_code_missing'],
    [{ state: 'wrong', code: 'code' }, 'yandex_state_invalid'],
  ])(
    'rejects invalid callback %j before exchanging a code',
    async (query, expected) => {
      const { agent, state } = await start();
      const response = await agent
        .get('/auth/yandex/callback')
        .query({ state, ...query })
        .expect(302);
      expect(response.headers.location).toContain(`error=${expected}`);
      expect(loginWithYandexCode).not.toHaveBeenCalled();
      expect(response.headers['set-cookie'][0]).toContain(
        'Expires=Thu, 01 Jan 1970',
      );
    },
  );

  it.each([
    [new Error('sensitive upstream response'), 'yandex_auth_failed'],
    [new YandexAuthError('yandex_email_missing'), 'yandex_email_missing'],
    [new YandexAuthError('yandex_account_conflict'), 'yandex_account_conflict'],
  ])('returns safe errors and clears the cookie', async (error, expected) => {
    const { agent, state } = await start();
    loginWithYandexCode.mockRejectedValueOnce(error);
    const response = await agent
      .get('/auth/yandex/callback')
      .query({ state, code: 'code' })
      .expect(302);
    expect(response.headers.location).toBe(
      `http://localhost:3000/login?error=${expected}`,
    );
    expect(response.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
  });

  it('returns a configuration error instead of starting an incomplete flow', async () => {
    delete process.env.YANDEX_CLIENT_ID;
    const response = await request(app.getHttpServer())
      .get('/auth/yandex')
      .expect(302);
    expect(response.headers.location).toContain('error=yandex_not_configured');
  });
});
