#!/usr/bin/env node
/**
 * XSS 픽스처 실행 검증.
 *
 * 기준: 기술 백서 §7.1-10("샘플 XSS 픽스처를 CI에서 매번 실행한다"),
 * 하네스 M5 DoD 2, INV-07.
 *
 * `tests/fixtures/xss-guide.howsheet.json`의 **모든 문자열 필드**를 실제
 * 살균 파이프라인에 통과시키고, 결과 DOM에 실행 가능한 잔재가 없는지 본다.
 * 단위 테스트가 고른 페이로드만 보는 것과 달리 여기서는 픽스처 전체를 훑으므로,
 * 픽스처에 새 페이로드를 넣으면 자동으로 검사 대상이 된다.
 *
 * 문자열 검사가 아니라 DOM 검사를 한다. 코드 블록 안의 이스케이프된
 * `&lt;script&gt;`는 텍스트지 스크립트가 아니고, 속성 이름을 쪼갠 우회는
 * 문자열 검사를 빠져나간다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'xss-guide.howsheet.json');

/**
 * 픽스처에 반드시 들어 있어야 하는 공격 표면.
 * 누군가 픽스처를 "정리"하면서 페이로드를 빼면 이 검사가 텅 빈 채로 통과한다.
 */
const REQUIRED_PAYLOADS = [
  { name: 'script 태그', match: /<script/i },
  { name: 'script 조기 종료', match: /<\/script/i },
  { name: 'onerror 속성', match: /onerror/i },
  { name: 'javascript: URL', match: /javascript:/i },
  { name: 'vbscript: URL', match: /vbscript:/i },
  { name: 'data:text/html URL', match: /data:text\/html/i },
  { name: 'iframe srcdoc', match: /srcdoc/i },
  { name: 'svg onload', match: /<svg/i },
  { name: 'onmouseover 속성', match: /onmouseover/i },
];

const FORBIDDEN_SELECTOR =
  'script, iframe, object, embed, svg, math, style, form, meta, base, link, noscript, ' +
  'input:not([type=checkbox])';

const DANGEROUS_URI = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*image\/svg)/i;

/** 문서에서 문자열 필드를 전부 끌어모은다. 경로도 함께 남긴다. */
function collectStrings(value, at = '$', found = []) {
  if (typeof value === 'string') {
    found.push({ path: at, value });
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${at}[${index}]`, found));
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${at}.${key}`, found);
  }
  return found;
}

function residueOf(document, html) {
  const host = document.createElement('div');
  host.innerHTML = html;

  const forbidden = host.querySelector(FORBIDDEN_SELECTOR);
  if (forbidden !== null) return `금지 태그 <${forbidden.tagName.toLowerCase()}>`;

  for (const node of host.querySelectorAll('*')) {
    for (const attribute of node.attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) return `이벤트 핸들러 속성 ${name}`;
      if (name === 'srcdoc' || name === 'style') return `금지 속성 ${name}`;
      if ((name === 'href' || name === 'src') && DANGEROUS_URI.test(attribute.value)) {
        return `위험한 ${name}: ${attribute.value.slice(0, 40)}`;
      }
    }
  }
  return null;
}

async function main() {
  // 살균기는 DOM을 필요로 한다. import보다 먼저 전역을 채운다.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const { markdownToSafeHtml } = await import('../src/features/sanitize/markdown-to-html.ts');

  const raw = await readFile(FIXTURE, 'utf8');
  const parsed = JSON.parse(raw);
  const strings = collectStrings(parsed);

  const failures = [];

  const missing = REQUIRED_PAYLOADS.filter((payload) => !payload.match.test(raw));
  for (const payload of missing) {
    failures.push(`픽스처에 '${payload.name}' 페이로드가 없습니다. 검사가 무의미해집니다.`);
  }

  for (const entry of strings) {
    const residue = residueOf(dom.window.document, markdownToSafeHtml(entry.value));
    if (residue !== null) {
      failures.push(`${entry.path} - ${residue}`);
    }
  }

  if (failures.length > 0) {
    console.error(`test:security - 위반 ${failures.length}건\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\n살균 경계: src/features/sanitize/, 기준: 기술 백서 §7.1, INV-07');
    process.exitCode = 1;
    return;
  }

  console.log(
    `test:security - 통과. 문자열 ${strings.length}개를 살균 파이프라인에 통과시켰고 ` +
      `실행 가능한 잔재가 0건입니다. (필수 페이로드 ${REQUIRED_PAYLOADS.length}종 확인)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
