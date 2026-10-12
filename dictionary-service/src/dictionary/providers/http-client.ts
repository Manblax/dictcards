const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; DictcardsDictionaryBot/1.0; +https://localhost)';

export async function fetchHtml(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': process.env.DICTIONARY_USER_AGENT || DEFAULT_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Dictionary source responded with ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}
