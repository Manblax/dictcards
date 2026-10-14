import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TtsService {
  private readonly client = new TextToSpeechClient();
  private readonly pending = new Map<string, Promise<Buffer>>();
  private readonly limits = new Map<
    string,
    { count: number; expires: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async synthesize(userId: string, input: unknown): Promise<Buffer> {
    const now = Date.now();
    for (const [key, value] of this.limits) {
      if (value.expires <= now) this.limits.delete(key);
    }
    const limit = this.limits.get(userId) ?? {
      count: 0,
      expires: now + 60_000,
    };
    this.limits.set(userId, limit);
    if (++limit.count > 60)
      throw new HttpException(
        'Too many speech requests; retry in one minute',
        429,
      );

    const body = input as { text?: unknown; variant?: unknown } | null;
    if (
      !body ||
      typeof body.text !== 'string' ||
      !['uk', 'us'].includes(body.variant as string)
    ) {
      throw new BadRequestException('Provide text and variant (uk or us)');
    }
    const text = body.text.trim();
    if (!text || Buffer.byteLength(text, 'utf8') > 4000) {
      throw new BadRequestException('Text must contain 1–4000 UTF-8 bytes');
    }
    const uk = body.variant === 'uk';
    const request = {
      input: { text },
      voice: {
        languageCode: uk ? 'en-GB' : 'en-US',
        name: uk
          ? process.env.TTS_VOICE_UK || 'en-GB-Chirp3-HD-Achernar'
          : process.env.TTS_VOICE_US || 'en-US-Chirp3-HD-Achernar',
      },
      audioConfig: { audioEncoding: 'MP3' as const },
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
    const existing = this.pending.get(hash);
    if (existing) return existing;
    const work = this.generate(hash, request);
    this.pending.set(hash, work);
    try {
      return await work;
    } finally {
      this.pending.delete(hash);
    }
  }

  private async generate(
    hash: string,
    request: Parameters<TextToSpeechClient['synthesizeSpeech']>[0],
  ): Promise<Buffer> {
    const cached = await this.prisma.ttsAudio.findUnique({ where: { hash } });
    if (cached) return Buffer.from(cached.audio);
    let audio: Buffer;
    try {
      // The SDK starts initialization in an unawaited promise inside
      // synthesizeSpeech(). Await it first so credential failures are caught
      // here instead of becoming unhandled rejections that stop the backend.
      await this.client.initialize();
      const [response] = await this.client.synthesizeSpeech(request, {
        timeout: 10_000,
        retry: null,
      });
      const content = response.audioContent;
      if (!content?.length) throw new Error('Empty speech response');
      audio =
        typeof content === 'string'
          ? Buffer.from(content, 'base64')
          : Buffer.from(content);
    } catch {
      throw new BadGatewayException(
        'Speech generation unavailable; please retry',
      );
    }
    await this.prisma.ttsAudio.upsert({
      where: { hash },
      create: { hash, audio: new Uint8Array(audio) },
      update: {},
    });
    return audio;
  }
}
