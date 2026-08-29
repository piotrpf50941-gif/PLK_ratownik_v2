import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function declaration(selector, property) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
  assert.ok(rule, `Brak reguły CSS dla ${selector}`);
  const value = rule[1].match(new RegExp(property + '\\s*:\\s*([^;]+)'));
  assert.ok(value, `Brak ${property} dla ${selector}`);
  return value[1].trim();
}

assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
assert.equal(declaration('body', 'min-width'), '320px');
assert.equal(declaration('.button', 'min-height'), '48px');
assert.equal(declaration('.procedure-tool-action', 'min-height'), '56px');
assert.equal(declaration('.guide-answer', 'min-height'), '62px');
assert.equal(declaration('.bottom-nav button', 'min-height'), '58px');
assert.equal(declaration('.segment-control button', 'min-height'), '48px');
assert.equal(declaration('.resource-action', 'width'), '48px');
assert.equal(declaration('.resource-action', 'height'), '48px');
assert.match(css, /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
assert.match(css, /@media\s*\(max-width:\s*390px\)/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

console.log('Test mobilny CSS: OK (320 px, duże cele dotykowe, bezpieczne marginesy, ograniczenie animacji)');
