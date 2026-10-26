import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [template, styles, app, rawDeck] = await Promise.all([
  read('src/index.template.html'), read('src/styles.css'),
  read('src/app.js'), read('data/deck.json'),
]);
const { domains, cards } = JSON.parse(rawDeck);
assert(domains && Object.keys(domains).length, 'At least one domain is required');
assert(Array.isArray(cards) && cards.length, 'At least one card is required');
for (const [id, domain] of Object.entries(domains)) {
  assert(/^[a-z0-9-]+$/.test(id), 'Invalid domain ID: ' + id);
  assert(typeof domain.label === 'string' && domain.label.trim(), 'Missing domain label');
  assert(/^--[a-z]+$/.test(domain.color), 'Invalid domain color');
}
const ids = new Set();
for (const card of cards) {
  assert(/^[a-z0-9-]+$/.test(card.id) && !ids.has(card.id), 'Invalid or duplicate card ID');
  ids.add(card.id);
  assert(Object.hasOwn(domains, card.d), 'Unknown domain for ' + card.id);
  assert(['docx', 'yt'].includes(card.source), 'Unknown source for ' + card.id);
  for (const field of ['q', 'a', 'exam']) {
    assert(typeof card[field] === 'string' && card[field].trim(), 'Missing ' + field + ' for ' + card.id);
  }
}
const domainOrder = Object.keys(domains);
assert.deepEqual(cards.map(card => card.d), [...cards].sort(
  (left, right) => domainOrder.indexOf(left.d) - domainOrder.indexOf(right.d)
).map(card => card.d), 'Cards must be grouped in domain order');
assert(!/<\/style/i.test(styles), 'Styles cannot contain a closing style tag');
assert(!/<\/script/i.test(app), 'App code cannot contain a closing script tag');

const escape = value => String(value).replace(/[&<>"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
})[character]);
const sourceLabel = card => card.source === 'yt' ? '*Guide from YT course' : '*Guide from docx';
const asScript = value => JSON.stringify(value, null, 2)
  .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const lines = [
  '<!-- BEGIN PORTABLE READING DECK -->',
  '<section class="reading-deck" id="readingDeck" aria-label="All flashcards">',
  '  <p class="reading-intro">All ' + cards.length + ' questions and answers are included in this file. Answers start open so they remain readable in Files preview. Where supported, tap a question to collapse or expand it.</p>',
  '  <nav class="reading-nav" aria-label="Study domains">',
];
for (const [id, domain] of Object.entries(domains)) {
  lines.push('    <a href="#reading-' + id + '">' + escape(domain.label) + ' (' +
    cards.filter(card => card.d === id).length + ')</a>');
}
lines.push('  </nav>');
let index = 0;
for (const [id, domain] of Object.entries(domains)) {
  lines.push('  <section class="reading-domain" id="reading-' + id + '">',
    '    <h2 style="color:var(' + domain.color + '-soft)">' + escape(domain.label) + '</h2>');
  for (const card of cards.filter(card => card.d === id)) {
    index++;
    lines.push(
      '    <details class="reading-card" id="reading-' + card.id + '" style="--accent:var(' + domain.color + ')" open>',
      '      <summary>',
      '        <span class="reading-number">' + index + ' / ' + cards.length + '</span>',
      '        <span class="reading-question">' + escape(card.q) + '</span>',
      '        <span class="reading-footer"><span><strong>Question</strong> <em>' + escape(sourceLabel(card)) + '</em></span><span>' + escape(card.exam) + '</span></span>',
      '      </summary>',
      '      <div class="reading-answer"><strong>Answer</strong><p>' + escape(card.a) + '</p></div>',
      '    </details>',
    );
  }
  lines.push('  </section>');
}
lines.push('</section>', '<!-- END PORTABLE READING DECK -->');
const slots = {
  STYLES: styles,
  READING_DECK: lines.join('\n'),
  DECK_DATA: 'const DOMAINS = ' + asScript(domains) + ';\nconst CARDS = ' + asScript(cards) + ';',
  APP_SCRIPT: app,
};
let output = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, slot) => {
  assert(Object.hasOwn(slots, slot), 'Unknown template slot: ' + slot);
  return slots[slot];
});
for (const slot of Object.keys(slots)) {
  assert(template.includes('{{' + slot + '}}'), 'Missing template slot: ' + slot);
}
const first = cards[0];
const initialText = {
  questionText: first.q, answerText: first.a,
  countFront: '1 / ' + cards.length, countBack: '1 / ' + cards.length,
  domainTagFront: domains[first.d].label, domainTagBack: domains[first.d].label,
  sourceTagFront: sourceLabel(first), examTagFront: first.exam, examTagBack: first.exam,
};
for (const [id, value] of Object.entries(initialText)) {
  const pattern = new RegExp('(<[^>]+\\bid="' + id + '"[^>]*>)[\\s\\S]*?(</[^>]+>)');
  assert(pattern.test(output), 'Missing initial element: ' + id);
  output = output.replace(pattern, (_, start, end) => start + escape(value) + end);
}
assert(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:\/\//i.test(output),
  'The standalone page must not depend on external resources');
if (process.argv.includes('--check')) {
  assert.equal(await read('index.html'), output, 'index.html is stale; run npm run build');
  console.log('Standalone page matches the source: ' + cards.length + ' cards.');
} else {
  await mkdir(new URL('dist/', root), { recursive: true });
  await Promise.all([
    writeFile(new URL('index.html', root), output),
    writeFile(new URL('dist/index.html', root), output),
  ]);
  console.log('Built index.html and dist/index.html with ' + cards.length + ' cards.');
}
