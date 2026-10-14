import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { TtsService } from './tts.service';

jest.mock('@google-cloud/text-to-speech', () => ({
  TextToSpeechClient: jest.fn(),
}));

describe('TtsService', () => {
  let service: TtsService;
  let initialize: jest.Mock;
  let synthesize: jest.Mock;
  let prisma: any;
  const input = { text: ' hello ', variant: 'uk' };

  beforeEach(() => {
    delete process.env.TTS_VOICE_UK;
    delete process.env.TTS_VOICE_US;
    initialize = jest.fn().mockResolvedValue(undefined);
    synthesize = jest
      .fn()
      .mockResolvedValue([{ audioContent: Buffer.from('mp3') }]);
    (TextToSpeechClient as unknown as jest.Mock).mockImplementation(() => ({
      initialize,
      synthesizeSpeech: synthesize,
    }));
    prisma = {
      ttsAudio: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    service = new TtsService(prisma);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.TTS_VOICE_UK;
    delete process.env.TTS_VOICE_US;
  });

  it('trims input, maps voices and disables retries with a 10-second deadline', async () => {
    expect(await service.synthesize('a', input)).toEqual(Buffer.from('mp3'));
    expect(synthesize).toHaveBeenCalledWith(
      {
        input: { text: 'hello' },
        voice: { languageCode: 'en-GB', name: 'en-GB-Chirp3-HD-Achernar' },
        audioConfig: { audioEncoding: 'MP3' },
      },
      { timeout: 10000, retry: null },
    );
    await service.synthesize('a', { ...input, variant: 'us' });
    expect(synthesize.mock.calls[1][0].voice.name).toBe('en-US-Chirp3-HD-Achernar');
    expect(prisma.ttsAudio.upsert.mock.calls[0][0].where.hash).not.toBe(
      prisma.ttsAudio.upsert.mock.calls[1][0].where.hash,
    );
  });

  it('uses configured voices and a distinct cache key', async () => {
    await service.synthesize('a', input);
    process.env.TTS_VOICE_UK = 'en-GB-Neural2-B';
    await service.synthesize('a', input);
    expect(synthesize.mock.calls[1][0].voice.name).toBe('en-GB-Neural2-B');
    expect(prisma.ttsAudio.findUnique.mock.calls[0][0]).not.toEqual(
      prisma.ttsAudio.findUnique.mock.calls[1][0],
    );
  });

  it.each([
    null,
    {},
    { ...input, variant: 'ru' },
    { ...input, text: '' },
    { ...input, text: '   ' },
    { ...input, text: 12 },
    { ...input, text: 'я'.repeat(2001) },
  ])('rejects invalid input %j', async (body) => {
    await expect(service.synthesize('a', body)).rejects.toMatchObject({
      status: 400,
    });
    expect(synthesize).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('accepts exactly 4000 bytes as plain text', async () => {
    await service.synthesize('a', { ...input, text: 'я'.repeat(2000) });
    expect(synthesize.mock.calls[0][0].input).toEqual({
      text: 'я'.repeat(2000),
    });
  });

  it('reuses durable cache across service instances', async () => {
    prisma.ttsAudio.findUnique.mockResolvedValue({
      audio: new Uint8Array([1, 2, 3]),
    });
    expect(await service.synthesize('a', input)).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(await new TtsService(prisma).synthesize('b', input)).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent synthesis across users', async () => {
    await Promise.all([
      service.synthesize('a', input),
      service.synthesize('b', input),
    ]);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(prisma.ttsAudio.upsert).toHaveBeenCalledTimes(1);
  });

  it('waits for initialization before calling the speech API', async () => {
    let ready!: () => void;
    initialize.mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    const pending = service.synthesize('a', input);
    await Promise.resolve();
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(synthesize).not.toHaveBeenCalled();
    ready();
    await expect(pending).resolves.toEqual(Buffer.from('mp3'));
  });

  it('handles credential initialization failures without calling the speech API', async () => {
    initialize.mockRejectedValue(
      new Error('Could not load the default credentials'),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(service.synthesize('a', input)).rejects.toMatchObject({
        status: 502,
      });
    }
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(synthesize).not.toHaveBeenCalled();
    expect(prisma.ttsAudio.upsert).not.toHaveBeenCalled();

    prisma.ttsAudio.findUnique.mockResolvedValue({ audio: Buffer.from('cached') });
    await expect(service.synthesize('a', input)).resolves.toEqual(
      Buffer.from('cached'),
    );
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('contains missing-credential errors from the real Google SDK', async () => {
    const { TextToSpeechClient: RealClient } = jest.requireActual<
      typeof import('@google-cloud/text-to-speech')
    >('@google-cloud/text-to-speech');
    (TextToSpeechClient as unknown as jest.Mock).mockImplementationOnce(
      () =>
        new RealClient({
          keyFilename: `${__filename}.missing-credentials.json`,
        }),
    );
    const withoutCredentials = new TtsService(prisma);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        withoutCredentials.synthesize('a', input),
      ).rejects.toMatchObject({ status: 502 });
    }
    // Let detached promise rejections surface: a caught HTTP error alone did
    // not prevent the SDK from crashing Node on the next event-loop turn.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(prisma.ttsAudio.upsert).not.toHaveBeenCalled();
  });

  it.each([new Error('deadline exceeded'), new Error('permission denied')])(
    'does not cache provider errors and allows replay',
    async (error) => {
      synthesize.mockRejectedValueOnce(error);
      await expect(service.synthesize('a', input)).rejects.toMatchObject({
        status: 502,
      });
      expect(prisma.ttsAudio.upsert).not.toHaveBeenCalled();
      await expect(service.synthesize('a', input)).resolves.toEqual(
        Buffer.from('mp3'),
      );
    },
  );

  it('rejects empty provider responses', async () => {
    synthesize.mockResolvedValue([{ audioContent: new Uint8Array() }]);
    await expect(service.synthesize('a', input)).rejects.toMatchObject({
      status: 502,
    });
    expect(prisma.ttsAudio.upsert).not.toHaveBeenCalled();
  });

  it('limits each user independently and resets after one minute', async () => {
    jest.useFakeTimers();
    prisma.ttsAudio.findUnique.mockResolvedValue({
      audio: Buffer.from('cached'),
    });
    for (let i = 0; i < 60; i++) await service.synthesize('a', input);
    await expect(service.synthesize('a', input)).rejects.toMatchObject({
      status: 429,
    });
    await expect(service.synthesize('b', input)).resolves.toBeDefined();
    jest.advanceTimersByTime(60000);
    await expect(service.synthesize('a', input)).resolves.toBeDefined();
  });
});
