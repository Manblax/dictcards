import { BadGatewayException, Injectable } from '@nestjs/common';
import type {
  DictionarySource,
  ProviderLookupResult,
} from './dictionary.types';
import { DictionaryNormalizer } from './dictionary.normalizer';
import { CambridgeProvider } from './providers/cambridge.provider';
import { OxfordProvider } from './providers/oxford.provider';
import { DictionaryHttpError } from './providers/http-client';

@Injectable()
export class DictionaryService {
  constructor(
    private readonly cambridgeProvider: CambridgeProvider,
    private readonly oxfordProvider: OxfordProvider,
    private readonly normalizer: DictionaryNormalizer,
  ) {}

  async lookup(word: string, source: DictionarySource = 'cambridge') {
    let cambridge: ProviderLookupResult | undefined;
    let oxford: ProviderLookupResult | undefined;

    try {
      if (source === 'cambridge') {
        cambridge = await this.cambridgeProvider.lookup(word);
      } else {
        oxford = await this.oxfordProvider.lookup(word);
      }
      const result = cambridge || oxford!;
      if (!result.definitions.length && !result.ipa.uk && !result.ipa.us &&
          !result.audio.uk && !result.audio.us) {
        throw new Error('Dictionary returned no recognizable entry');
      }
    } catch (error) {
      // A missing entry is different from a timeout, blocked request or changed HTML.
      if (!(error instanceof DictionaryHttpError) || error.status !== 404) {
        throw new BadGatewayException('Dictionary source unavailable');
      }
    }

    return this.normalizer.normalize(word, cambridge, oxford);
  }
}
