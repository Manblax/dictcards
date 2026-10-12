import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DictionaryAudioVariant,
  DictionaryPreferences,
  InternalDictionaryLookupResult,
  PublicDictionaryLookupResult,
} from './dictionary.types';

@Injectable()
export class DictionaryService {
  private readonly serviceUrl =
    process.env.DICTIONARY_SERVICE_URL || 'http://localhost:4000';
  private readonly cacheTtlDays = Number(
    process.env.DICTIONARY_CACHE_TTL_DAYS || 30,
  );
  private readonly timeoutMs = Number(
    process.env.DICTIONARY_BACKEND_TIMEOUT_MS || 9000,
  );

  constructor(private readonly prisma: PrismaService) {}

  async lookup(
    normalizedWord: string,
    preferences: DictionaryPreferences = {
      source: 'cambridge',
    },
  ): Promise<PublicDictionaryLookupResult> {
    const cached = await this.prisma.dictionaryEntry.findUnique({
      where: {
        normalizedWord_dictionarySource: {
          normalizedWord,
          dictionarySource: preferences.source,
        },
      },
    });

    if (cached && this.isCacheFresh(cached.expiresAt)) {
      return {
        ...(cached.payload as unknown as InternalDictionaryLookupResult),
        cached: true,
      };
    }

    const internalResult = await this.fetchLookup(normalizedWord, preferences);
    const publicPayload = await this.materializeAudioUrls(internalResult);
    const storedPayload = this.toJson(publicPayload);
    const storedSources = this.toJson(publicPayload.sources);
    const expiresAt = this.getExpiresAt();

    await this.prisma.dictionaryEntry.upsert({
      where: {
        normalizedWord_dictionarySource: {
          normalizedWord,
          dictionarySource: preferences.source,
        },
      },
      update: {
        payload: storedPayload,
        sourceMap: storedSources,
        expiresAt,
      },
      create: {
        normalizedWord,
        dictionarySource: preferences.source,
        payload: storedPayload,
        sourceMap: storedSources,
        expiresAt,
      },
    });

    return {
      ...publicPayload,
      cached: false,
    };
  }

  findAudio(id: string) {
    return this.prisma.dictionaryAudio.findUnique({
      where: { id },
    });
  }

  fetchAudio(sourceUrl: string) {
    return fetch(sourceUrl, {
      headers: {
        'User-Agent':
          process.env.DICTIONARY_USER_AGENT ||
          'Mozilla/5.0 (compatible; DictcardsDictionaryBot/1.0; +https://localhost)',
      },
    });
  }

  private async fetchLookup(
    normalizedWord: string,
    preferences: DictionaryPreferences,
  ): Promise<InternalDictionaryLookupResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = new URL('/internal/lookup', this.serviceUrl);
      url.searchParams.set('word', normalizedWord);
      url.searchParams.set('source', preferences.source);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException('Dictionary service lookup failed');
      }

      return response.json() as Promise<InternalDictionaryLookupResult>;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException('Dictionary service unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async materializeAudioUrls(
    result: InternalDictionaryLookupResult,
  ): Promise<InternalDictionaryLookupResult> {
    return {
      ...result,
      audio: {
        uk: await this.materializeAudioUrl(
          'uk',
          result.audio.uk,
          result.sources.audio,
        ),
        us: await this.materializeAudioUrl(
          'us',
          result.audio.us,
          result.sources.audio,
        ),
      },
    };
  }

  private async materializeAudioUrl(
    variant: DictionaryAudioVariant,
    sourceUrl: string | undefined,
    source: string | undefined,
  ) {
    if (!sourceUrl) {
      return undefined;
    }

    const id = createHash('sha256')
      .update(sourceUrl)
      .digest('hex')
      .slice(0, 24);

    await this.prisma.dictionaryAudio.upsert({
      where: { id },
      update: {
        variant,
        source: source || 'unknown',
        sourceUrl,
      },
      create: {
        id,
        variant,
        source: source || 'unknown',
        sourceUrl,
      },
    });

    return `/dictionary/audio/${id}`;
  }

  private isCacheFresh(expiresAt: Date | null) {
    return !expiresAt || expiresAt.getTime() > Date.now();
  }

  private getExpiresAt() {
    if (!Number.isFinite(this.cacheTtlDays) || this.cacheTtlDays <= 0) {
      return null;
    }

    return new Date(Date.now() + this.cacheTtlDays * 24 * 60 * 60 * 1000);
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
