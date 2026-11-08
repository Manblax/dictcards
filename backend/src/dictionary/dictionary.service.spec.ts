import { DictionaryService } from './dictionary.service';
import type { InternalDictionaryLookupResult } from './dictionary.types';

const lookupPayload: InternalDictionaryLookupResult = {
  word: 'run',
  normalizedWord: 'run',
  suggestedDefinition: 'to move fast on foot',
  definitions: [
    {
      text: 'to move fast on foot',
      examples: [],
      source: 'cambridge',
    },
  ],
  ipa: { uk: '/rʌn/' },
  audio: { uk: 'https://example.com/run.mp3' },
  sources: {
    definitions: 'cambridge',
    ipa: 'cambridge',
    audio: 'cambridge',
  },
};

describe('DictionaryService', () => {
  let prisma: any;
  let service: DictionaryService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      dictionaryEntry: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      dictionaryAudio: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new DictionaryService(prisma);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('returns fresh cache without calling dictionary-service', async () => {
    prisma.dictionaryEntry.findUnique.mockResolvedValue({
      payload: { ...lookupPayload, audio: { uk: '/dictionary/audio/cached' } },
      expiresAt: new Date(Date.now() + 1000),
    });

    const result = await service.lookup('run');

    expect(result.cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls dictionary-service on cache miss and stores the normalized payload', async () => {
    prisma.dictionaryEntry.findUnique.mockResolvedValue(null);
    prisma.dictionaryAudio.upsert.mockResolvedValue({});
    prisma.dictionaryEntry.upsert.mockResolvedValue({});
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(lookupPayload),
    });

    const result = await service.lookup('run');

    expect(result.cached).toBe(false);
    expect(result.audio.uk).toMatch(/^\/dictionary\/audio\//);
    expect(prisma.dictionaryAudio.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceUrl: 'https://example.com/run.mp3',
          variant: 'uk',
        }),
      }),
    );
    expect(prisma.dictionaryEntry.upsert).toHaveBeenCalled();
  });

  const empty = { ...lookupPayload, definitions: [], suggestedDefinition: null, ipa: {}, audio: {}, sources: {} };

  it('refreshes legacy empty results even when their old 30-day expiry has not passed', async () => {
    prisma.dictionaryEntry.findUnique.mockResolvedValue({
      payload: empty, expiresAt: new Date(Date.now() + 30 * 86400000),
      updatedAt: new Date(Date.now() - 6 * 60000),
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => lookupPayload });
    const result = await service.lookup('sincerely', { source: 'oxford' });
    expect(result.cached).toBe(false);
    expect(result.ipa.uk).toBe('/rʌn/');
    expect(prisma.dictionaryEntry.upsert).toHaveBeenCalled();
  });

  it('caches genuine missing entries for only five minutes', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => empty });
    const before = Date.now();
    await service.lookup('unknown');
    const expires = prisma.dictionaryEntry.upsert.mock.calls[0][0].create.expiresAt.getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 5 * 60000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 5 * 60000);
  });

  it('reuses a recently cached missing entry', async () => {
    prisma.dictionaryEntry.findUnique.mockResolvedValue({
      payload: empty, expiresAt: new Date(Date.now() + 60000), updatedAt: new Date(),
    });
    expect((await service.lookup('unknown')).cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not save upstream failures as empty results', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(service.lookup('sincerely')).rejects.toMatchObject({ status: 502 });
    expect(prisma.dictionaryEntry.upsert).not.toHaveBeenCalled();
  });

  it('keeps valid definitions without IPA cached normally', async () => {
    prisma.dictionaryEntry.findUnique.mockResolvedValue({
      payload: { ...lookupPayload, ipa: {}, audio: {} },
      expiresAt: new Date(Date.now() + 86400000), updatedAt: new Date(0),
    });
    expect((await service.lookup('familiarity breeds contempt')).cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
