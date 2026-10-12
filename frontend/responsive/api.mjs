import { createServer } from 'node:http';

const terms = Array.from({ length: 12 }, (_, index) => ({
  id: `term-${index}`,
  term: ['carry on', 'look up', 'figure out', 'break down'][index % 4] + (index > 3 ? ` ${index}` : ''),
  definition: index === 0 ? 'A long definition explaining how to continue an activity despite difficulties, with enough text to wrap naturally across several lines.' : `Definition for term ${index + 1}`,
}));
const module = {
  id: 'responsive', title: 'English practice: phrasal verbs and everyday expressions',
  description: 'Practice vocabulary with definitions that remain readable on every screen.',
  author: 'responsive_tester', termCount: terms.length, terms,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};
createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://127.0.0.1:3101');
  if (url.pathname.startsWith('/dictionary')) {
    return res.end(JSON.stringify({ word: 'test', definitions: [], ipa: {}, audio: {}, cached: true }));
  }
  if (url.pathname === '/dictcards') {
    return res.end(JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ ...module, id: i ? `module-${i}` : module.id }))));
  }
  if (url.pathname.startsWith('/dictcards/')) {
    const stress = url.pathname.endsWith('/stress');
    return res.end(JSON.stringify(stress ? { ...module, id: 'stress', title: 'LongTitle'.repeat(25), description: 'LongDescription'.repeat(30), author: 'LongAuthor'.repeat(12), terms: terms.map(t => ({ ...t, term: 'LongTerm'.repeat(20), definition: 'LongDefinition'.repeat(30) })) } : module));
  }
  res.end(JSON.stringify({ ok: true }));
}).listen(3101, '127.0.0.1');
