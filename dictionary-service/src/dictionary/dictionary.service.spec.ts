import { DictionaryService } from './dictionary.service';
import { DictionaryHttpError } from './providers/http-client';

const entry = (source: string) => ({ source, definitions: [{ text: 'definition' }], ipa: {}, audio: {} });

describe('DictionaryService', () => {
  const cambridgeProvider = { lookup: jest.fn() };
  const oxfordProvider = { lookup: jest.fn() };
  const normalizer = { normalize: jest.fn().mockReturnValue({}) };
  const service = new DictionaryService(
    cambridgeProvider as any,
    oxfordProvider as any,
    normalizer as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses only Cambridge when Cambridge is selected', async () => {
    cambridgeProvider.lookup.mockResolvedValue(entry('cambridge'));

    await service.lookup('run', 'cambridge');

    expect(cambridgeProvider.lookup).toHaveBeenCalledWith('run');
    expect(oxfordProvider.lookup).not.toHaveBeenCalled();
    expect(normalizer.normalize).toHaveBeenCalledWith(
      'run',
      entry('cambridge'),
      undefined,
    );
  });

  it('uses only Oxford when Oxford is selected', async () => {
    oxfordProvider.lookup.mockResolvedValue(entry('oxford'));

    await service.lookup('run', 'oxford');

    expect(oxfordProvider.lookup).toHaveBeenCalledWith('run');
    expect(cambridgeProvider.lookup).not.toHaveBeenCalled();
    expect(normalizer.normalize).toHaveBeenCalledWith('run', undefined, entry('oxford'));
  });

  it.each([new DictionaryHttpError(403), new DictionaryHttpError(429), new Error('timeout')])(
    'does not turn an upstream failure into a cacheable empty result: %s', async (error) => {
      oxfordProvider.lookup.mockRejectedValue(error);
      await expect(service.lookup('sincerely', 'oxford')).rejects.toMatchObject({ status: 502 });
      expect(normalizer.normalize).not.toHaveBeenCalled();
      expect(cambridgeProvider.lookup).not.toHaveBeenCalled();
    },
  );

  it('returns an empty result for a genuinely missing entry', async () => {
    oxfordProvider.lookup.mockRejectedValue(new DictionaryHttpError(404));
    await service.lookup('unknown', 'oxford');
    expect(normalizer.normalize).toHaveBeenCalledWith('unknown', undefined, undefined);
  });

  it('rejects successful HTTP responses with no recognizable dictionary content', async () => {
    oxfordProvider.lookup.mockResolvedValue({ definitions: [], ipa: {}, audio: {} });
    await expect(service.lookup('sincerely', 'oxford')).rejects.toMatchObject({ status: 502 });
  });

  it('preserves legitimate definitions without transcription', async () => {
    cambridgeProvider.lookup.mockResolvedValue(entry('cambridge'));
    await service.lookup('familiarity breeds contempt');
    expect(normalizer.normalize).toHaveBeenCalledWith('familiarity breeds contempt', entry('cambridge'), undefined);
  });
});
