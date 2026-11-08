import { readFileSync } from 'fs';
import { join } from 'path';
import { OxfordProvider } from './oxford.provider';
import * as http from './http-client';

describe('OxfordProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('follows an explicit spacing/hyphen spelling suggestion on a 404', async () => {
    const fetch = jest.spyOn(http, 'fetchHtml')
      .mockRejectedValueOnce(new http.DictionaryHttpError(404,
        '<a class="dym-link" href="/search/english/?q=icebreaker">icebreaker</a>'))
      .mockResolvedValueOnce('<div class="entry"><div class="phons_br"><span class="phon">/ˈaɪsbreɪkə(r)/</span></div><div class="phons_n_am"><span class="phon">/ˈaɪsbreɪkər/</span></div><span class="def">something to help people relax</span></div>');
    const result = await new OxfordProvider().lookup('ice-breaker');
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://www.oxfordlearnersdictionaries.com/definition/english/icebreaker', expect.any(Number));
    expect(result.normalizedWord).toBe('ice-breaker');
    expect(result.ipa).toEqual({ uk: '/ˈaɪsbreɪkə(r)/', us: '/ˈaɪsbreɪkər/' });
  });

  it('does not guess unrelated words or plural suggestions', async () => {
    const error = new http.DictionaryHttpError(404, '<a class="dym-link">icebreakers</a><a class="dym-link">ice cream</a>');
    const fetch = jest.spyOn(http, 'fetchHtml').mockRejectedValue(error);
    await expect(new OxfordProvider().lookup('ice-breaker')).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not follow suggestions on blocked requests', async () => {
    const error = new http.DictionaryHttpError(403, '<a class="dym-link">icebreaker</a>');
    const fetch = jest.spyOn(http, 'fetchHtml').mockRejectedValue(error);
    await expect(new OxfordProvider().lookup('ice-breaker')).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('limits spelling resolution to one additional request', async () => {
    const error = new http.DictionaryHttpError(404, '<a class="dym-link">icebreaker</a>');
    const fetch = jest.spyOn(http, 'fetchHtml').mockRejectedValue(error);
    await expect(new OxfordProvider().lookup('ice-breaker')).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('parses definitions, examples, IPA, and audio from Oxford HTML', () => {
    const html = readFileSync(
      join(__dirname, '../test-fixtures/oxford-run.html'),
      'utf8',
    );
    const result = new OxfordProvider().parse(html, 'run');

    expect(result.definitions).toEqual([
      {
        text: 'to move using your legs, going faster than when you walk',
        partOfSpeech: 'verb',
        guideWord: undefined,
        cefr: undefined,
        examples: ['She ran across the road.'],
        source: 'oxford',
      },
    ]);
    expect(result.ipa).toEqual({ uk: '/rʌn/', us: '/rʌn/' });
    expect(result.audio).toEqual({
      uk: 'https://example.com/uk-run.mp3',
      us: 'https://example.com/us-run.mp3',
    });
  });

  it('parses current Oxford work markup guide words and CEFR levels', () => {
    const html = `
      <div class="entry">
        <div class="top-container">
          <div class="top-g">
            <div class="webtop">
              <span class="pos">verb</span>
              <div class="phonetics">
                <div class="phons_br">
                  <span class="phon">/wɜːk/</span>
                  <div class="sound" data-src-mp3="https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/w/wor/work_/work__gb_2.mp3"></div>
                </div>
                <div class="phons_n_am">
                  <span class="phon">/wɜːrk/</span>
                  <div class="sound" data-src-mp3="https://www.oxfordlearnersdictionaries.com/media/english/us_pron/w/wor/work_/work__us_1.mp3"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <ol>
          <span class="shcut-g">
            <h2 class="shcut">do job/task</h2>
            <li class="sense" cefr="a1">
              <span class="def">to do something that involves physical or mental effort, especially as part of a job</span>
              <ul class="examples">
                <li><span class="x">I can't work if I'm cold.</span></li>
                <li><span class="x">The kids always work hard at school.</span></li>
              </ul>
            </li>
            <li class="sense" cefr="a1">
              <span class="def">to have a job</span>
              <ul class="examples">
                <li><span class="x">Both my parents work.</span></li>
              </ul>
            </li>
          </span>
          <span class="shcut-g">
            <h2 class="shcut">machine/device/system</h2>
            <li class="sense" cefr="a2">
              <span class="def">to function; to operate</span>
              <ul class="examples">
                <li><span class="x">The printer isn't working.</span></li>
              </ul>
            </li>
          </span>
        </ol>
      </div>
    `;
    const result = new OxfordProvider().parse(html, 'work');

    expect(result.ipa).toEqual({ uk: '/wɜːk/', us: '/wɜːrk/' });
    expect(result.audio).toEqual({
      uk: 'https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/w/wor/work_/work__gb_2.mp3',
      us: 'https://www.oxfordlearnersdictionaries.com/media/english/us_pron/w/wor/work_/work__us_1.mp3',
    });
    expect(result.definitions).toEqual([
      {
        text: 'to do something that involves physical or mental effort, especially as part of a job',
        partOfSpeech: 'verb',
        guideWord: 'do job/task',
        cefr: 'A1',
        examples: [
          "I can't work if I'm cold.",
          'The kids always work hard at school.',
        ],
        source: 'oxford',
      },
      {
        text: 'to have a job',
        partOfSpeech: 'verb',
        guideWord: 'do job/task',
        cefr: 'A1',
        examples: ['Both my parents work.'],
        source: 'oxford',
      },
      {
        text: 'to function; to operate',
        partOfSpeech: 'verb',
        guideWord: 'machine/device/system',
        cefr: 'A2',
        examples: ["The printer isn't working."],
        source: 'oxford',
      },
    ]);
  });
});
