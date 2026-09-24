import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchYandexProfile } from './yandex-oauth';

jest.mock('./yandex-oauth', () => ({
  ...jest.requireActual('./yandex-oauth'),
  fetchYandexProfile: jest.fn(),
}));

describe('AuthService identity resolution', () => {
  const profile = jest.mocked(fetchYandexProfile);
  const user = {
    id: 'user-1',
    email: 'demo@yandex.ru',
    username: 'demo',
    password: 'existing-hash',
    yandexId: null as string | null,
  };
  const model = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const jwt = { sign: jest.fn(() => 'app-token') };
  let service: AuthService;
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '6.19.1',
    });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const fn of Object.values(model)) fn.mockReset();
    model.findUnique.mockResolvedValue(null);
    model.create.mockImplementation(async ({ data }) => ({ ...user, ...data }));
    profile.mockResolvedValue({ id: '42', email: user.email, login: 'demo' });
    service = new AuthService(
      { user: model } as unknown as PrismaService,
      jwt as unknown as JwtService,
    );
  });

  it('creates a user with a stable ID, unique username and random hashed password', async () => {
    model.findUnique.mockImplementation(async ({ where }) =>
      where.username === 'demo' ? user : null,
    );
    const result = await service.loginWithYandexCode('code', 'verifier');
    expect(model.create).toHaveBeenCalledWith({
      data: {
        email: user.email,
        username: 'demo1',
        yandexId: '42',
        password: expect.stringMatching(/^\$2[aby]\$/),
      },
    });
    expect(result).toEqual({
      access_token: 'app-token',
      user: { id: user.id, username: 'demo1', email: user.email },
    });
    expect(jwt.sign).toHaveBeenCalledWith({ sub: user.id, username: 'demo1' });
  });

  it('links by exact email without overwriting password, profile or modules', async () => {
    model.findUnique.mockImplementation(async ({ where }) =>
      where.email === user.email ? user : null,
    );
    model.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.loginWithYandexCode('code', 'verifier');
    expect(result.user.id).toBe(user.id);
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, yandexId: null },
      data: { yandexId: '42' },
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it.each(['changed@yandex.ru', undefined])(
    'finds a linked user even when email becomes %s',
    async (email) => {
      profile.mockResolvedValue({ id: '42', email, login: 'new-login' });
      model.findUnique.mockResolvedValue({ ...user, yandexId: '42' });
      const result = await service.loginWithYandexCode('code', 'verifier');
      expect(result.user.email).toBe(user.email);
      expect(model.findUnique).toHaveBeenCalledTimes(1);
      expect(model.findUnique).toHaveBeenCalledWith({
        where: { yandexId: '42' },
      });
      expect(model.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', 'not-an-email'])(
    'rejects a first sign-in without usable email %s',
    async (email) => {
      profile.mockResolvedValue({ id: '42', email, login: 'demo' });
      await expect(
        service.loginWithYandexCode('code', 'verifier'),
      ).rejects.toThrow('yandex_email_missing');
      expect(model.create).not.toHaveBeenCalled();
    },
  );

  it('refuses an email linked to another Yandex account', async () => {
    model.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...user, yandexId: 'other' });
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).rejects.toThrow('yandex_account_conflict');
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it('re-reads the winner after concurrent creation', async () => {
    model.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...user, yandexId: '42' });
    model.create.mockRejectedValueOnce(conflict());
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).resolves.toHaveProperty('user.id', user.id);
    expect(model.create).toHaveBeenCalledTimes(1);
  });

  it('retries username collisions without losing the new account', async () => {
    model.create.mockRejectedValueOnce(conflict());
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).resolves.toHaveProperty('user.id', user.id);
    expect(model.create).toHaveBeenCalledTimes(2);
  });

  it('returns the concurrent winner when the same identity was already linked', async () => {
    model.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, yandexId: '42' });
    model.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).resolves.toHaveProperty('user.id', user.id);
  });

  it('does not overwrite a competing identity that won the link', async () => {
    model.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...user, yandexId: 'other' });
    model.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).rejects.toThrow('yandex_account_conflict');
    expect(model.updateMany).toHaveBeenCalledTimes(1);
  });

  it('bounds retries and does not hide unrelated database failures', async () => {
    model.create.mockRejectedValue(conflict());
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).rejects.toThrow('yandex_auth_failed');
    expect(model.create).toHaveBeenCalledTimes(5);
    model.create.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      service.loginWithYandexCode('code', 'verifier'),
    ).rejects.toThrow('Database unavailable');
  });

  it('keeps password login working for linked users', async () => {
    const password = await bcrypt.hash('password123', 10);
    model.findFirst.mockResolvedValue({ ...user, password, yandexId: '42' });
    await expect(
      service.login({ username: user.email, password: 'password123' }),
    ).resolves.toHaveProperty('user.id', user.id);
    await expect(
      service.login({ username: user.email, password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials');
  });

  it('keeps Google email login working for linked users', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'google-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: user.email }),
      } as Response);
    const originalEnv = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    model.findUnique.mockResolvedValue({ ...user, yandexId: '42' });
    try {
      await expect(service.loginWithGoogleCode('code')).resolves.toHaveProperty(
        'user.id',
        user.id,
      );
      expect(model.create).not.toHaveBeenCalled();
    } finally {
      process.env = originalEnv;
      fetchSpy.mockRestore();
    }
  });
});
