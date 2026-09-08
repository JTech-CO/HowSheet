#!/usr/bin/env node
/**
 * 붙여넣기 자료 XSS 검증.
 *
 * 기준: v2 제품정의 §8 INV-05. 근거는
 * `docs/archive/v1/HowSheet_기술_백서.md` §7.1-10("샘플 XSS 픽스처를 CI에서 매번
 * 실행한다")에서 왔다.
 *
 * v2에서 신뢰할 수 없는 입력은 **사용자가 붙여넣는 자료** 하나다. 어디서 복사해
 * 왔는지 알 수 없고 미리보기가 그것을 렌더링한다. `tests/fixtures/xss-source.md`를
 * 실제 살균 파이프라인에 통과시키고 결과 DOM에 실행 가능한 잔재가 없는지 본다.
 *
 * 문자열 검사가 아니라 DOM 검사를 한다. 코드 블록 안의 이스케이프된
 * `&lt;script&gt;`는 텍스트지 스크립트가 아니고, 속성 이름을 쪼갠 우회는
 * 문자열 검사를 빠져나간다.
 *
 * 파일 전체를 한 번 통과시키고, **블록 단위로도** 한 번씩 통과시킨다. 전체만
 * 보면 어느 페이로드가 샜는지 알 수 없고, 앞선 블록이 파서 상태를 바꿔 뒤
 * 블록이 다르게 해석되는 경우를 놓친다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'xss-source.md');

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
  { name: 'style 태그', match: /<style/i },
  { name: 'meta refresh', match: /http-equiv/i },
  { name: 'form 태그', match: /<form/i },
];

/** 픽스처가 살균 뒤에도 지켜야 하는 정상 내용. 과잉 살균을 잡는다. */
const REQUIRED_SURVIVORS = [
  { name: '굵게', selector: 'strong' },
  { name: '표', selector: 'table' },
  { name: '코드 블록', selector: 'pre code' },
  { name: '정상 링크', selector: 'a[href^="https://"]' },
  { name: '인용문', selector: 'blockquote' },
];

const FORBIDDEN_SELECTOR =
  'script, iframe, object, embed, svg, math, style, form, meta, base, link, noscript, ' +
  'input:not([type=checkbox])';

const DANGEROUS_URI = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*image\/svg)/i;

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

/**
 * 빈 줄로 나뉜 블록. 마크다운의 문단 경계와 같다.
 *
 * 코드 펜스 안의 빈 줄에서 자르면 펜스가 열린 채로 잘려 뒤 블록이 전부 코드가
 * 된다. 그러면 페이로드가 코드 블록에 숨어 검사가 무의미해진다.
 */
function blocksOf(markdown) {
  const blocks = [];
  let current = [];
  let inFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '') {
      if (current.length > 0) blocks.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

async function main() {
  // 살균기는 DOM을 필요로 한다. import보다 먼저 전역을 채운다.
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const { markdownToSafeHtml } = await import('../src/features/sanitize/markdown-to-html.ts');

  const raw = await readFile(FIXTURE, 'utf8');
  const blocks = blocksOf(raw);
  const failures = [];

  const missing = REQUIRED_PAYLOADS.filter((payload) => !payload.match.test(raw));
  for (const payload of missing) {
    failures.push(`픽스처에 '${payload.name}' 페이로드가 없습니다. 검사가 무의미해집니다.`);
  }

  const wholeHtml = markdownToSafeHtml(raw);
  const wholeResidue = residueOf(dom.window.document, wholeHtml);
  if (wholeResidue !== null) failures.push(`파일 전체 - ${wholeResidue}`);

  for (const [index, block] of blocks.entries()) {
    const residue = residueOf(dom.window.document, markdownToSafeHtml(block));
    if (residue !== null) {
      failures.push(`블록 ${index + 1} - ${residue}\n    ${block.split('\n')[0]?.slice(0, 60)}`);
    }
  }

  // 과잉 살균도 결함이다. 전부 지워 버리면 잔재는 0건이지만 미리보기가 빈다.
  const host = dom.window.document.createElement('div');
  host.innerHTML = wholeHtml;
  for (const survivor of REQUIRED_SURVIVORS) {
    if (host.querySelector(survivor.selector) === null) {
      failures.push(`정상 내용 '${survivor.name}'이(가) 살균 뒤 사라졌습니다.`);
    }
  }

  if (failures.length > 0) {
    console.error(`test:security - 위반 ${failures.length}건\n`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\n살균 경계: src/features/sanitize/, 기준: v2 제품정의 §8 INV-05');
    process.exitCode = 1;
    return;
  }

  console.log(
    `test:security - 통과. 블록 ${blocks.length}개와 파일 전체를 살균 파이프라인에 ` +
      `통과시켰고 실행 가능한 잔재가 0건입니다. ` +
      `(필수 페이로드 ${REQUIRED_PAYLOADS.length}종, 정상 내용 ${REQUIRED_SURVIVORS.length}종 확인)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
