#!/usr/bin/env node
/**
 * 기준 픽스처 검증.
 *
 * 기준: 하네스 §0.10 기준 픽스처, M2 DoD 8.
 *
 * 아래 EXPECTATIONS 표가 **기대 결과의 명세**다. 픽스처가 스키마에서 벗어나거나
 * 스키마가 픽스처에서 벗어나면 이 게이트가 깨진다. INV-03(스키마 단일 기준)을
 * 지키는 것이 이 스크립트의 목적이다.
 *
 * 그래프 판정(순환·도달 가능성·분기 대상·우선순위·종료 단계)은 M6이 맡는다.
 * 그때까지 해당 픽스처는 `pendingGraph`에 기대 코드를 적어 두고, M6이
 * graph-validator를 붙이면서 이 표를 실제 판정으로 옮긴다.
 *
 * `src/assets/samples/`의 샘플 템플릿(FR-020)도 같은 방식으로 검증한다.
 *
 * Node는 .ts를 직접 실행할 수 있으므로 도메인 스키마를 그대로 가져다 쓴다.
 * 검증 스크립트가 스키마 사본을 갖지 않아야 단일 기준이 유지된다.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseGuideDocument } from '../src/domain/guide.schema.ts';
import { ISSUE_CODES } from '../src/domain/validation.types.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures');
const SAMPLE_DIR = path.join(REPO_ROOT, 'src/assets/samples');

/**
 * @typedef {{
 *   role: string,
 *   parses: boolean,
 *   codes: string[],
 *   pendingGraph?: string[],
 *   pendingPhase?: string,
 * }} Expectation
 */

/** @type {Record<string, Expectation>} */
const EXPECTATIONS = {
  'valid-minimal.howsheet.json': {
    role: '기술 백서 §2.3.4 최소 문서',
    parses: true,
    codes: [],
  },
  'valid-linear-5step.howsheet.json': {
    role: '준비물·경고 3단계·전역/단계 오류해결·자산과 블록 7종 전부를 포함한 선형 5단계',
    parses: true,
    codes: [],
  },
  'valid-branched.howsheet.json': {
    role: '결정 블록과 분기 규칙. 배열 순서와 priority 순서가 어긋나게 두었다',
    parses: true,
    codes: [],
  },
  'invalid-missing-target.howsheet.json': {
    role: '분기 대상 단계만 존재하지 않음. 도달 불가는 섞지 않아 M6이 규칙을 분리해 검사할 수 있다',
    parses: true,
    codes: [],
    pendingGraph: [ISSUE_CODES.BRANCH_TARGET_NOT_FOUND],
    pendingPhase: 'M6',
  },
  'invalid-cycle.howsheet.json': {
    role: '분기 간선으로 닫히는 3노드 순환. 도달 가능한 종료 단계가 따로 있다',
    parses: true,
    codes: [],
    pendingGraph: [ISSUE_CODES.CYCLE_DETECTED],
    pendingPhase: 'M6',
  },
  'invalid-unreachable.howsheet.json': {
    role: '시작 단계에서 도달할 수 없는 단계',
    parses: true,
    codes: [],
    pendingGraph: [ISSUE_CODES.UNREACHABLE_STEP],
    pendingPhase: 'M6',
  },
  'invalid-no-terminal.howsheet.json': {
    role: '종료 가능한 단계가 없음. 자기 자신을 가리키는 간선을 포함한다',
    parses: true,
    codes: [],
    pendingGraph: [ISSUE_CODES.NO_TERMINAL_STEP, ISSUE_CODES.CYCLE_DETECTED],
    pendingPhase: 'M6',
  },
  'invalid-duplicate-priority.howsheet.json': {
    role: '분기 우선순위 중복. 조건이 완전히 같은 규칙 쌍도 포함한다',
    parses: true,
    codes: [],
    pendingGraph: [ISSUE_CODES.DUPLICATE_BRANCH_PRIORITY],
    pendingPhase: 'M6',
  },
  'xss-guide.howsheet.json': {
    role: 'XSS 페이로드. 스키마는 통과하고 살균·직렬화가 무력화해야 함',
    parses: true,
    codes: [],
    pendingPhase: 'M5 살균 · M9 안전 직렬화',
  },
  'large-100-step.howsheet.json': {
    role: '100단계 성능 기준. 3단계마다 분기하고 합류한다 (§2.4.2, M6 DoD 10)',
    parses: true,
    codes: [],
  },
};

// 구분자는 소스에 리터럴로 두지 않는다. 편집기·포매터가 조용히 일반 공백으로
// 바꿔 버리면 검사가 의미를 잃기 때문이다.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * xss 픽스처가 반드시 품고 있어야 하는 페이로드.
 * M5 DoD 2와 M12 DoD 2가 열거한 종류를 모두 덮는다. 약해지면
 * `pnpm test:security`가 검사할 대상이 사라진다.
 */
const XSS_REQUIRED_PAYLOADS = [
  '<script',
  '</script>',
  'onerror=',
  'onload=',
  'onmouseover=',
  'javascript:',
  'vbscript:',
  'data:text/html',
  'data:image/svg+xml',
  '<svg',
  'srcdoc',
  LINE_SEPARATOR,
  PARAGRAPH_SEPARATOR,
];

const failures = [];
const notes = [];

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

function codesOf(result) {
  return [...new Set(result.issues.map((issue) => issue.code))].sort();
}

function sameSet(a, b) {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function checkGuideFile(absolutePath, label, expectation) {
  let raw;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch (error) {
    fail(label, `읽을 수 없습니다 - ${error.message}`);
    return;
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    fail(label, `JSON 파싱 실패 - ${error.message}`);
    return;
  }

  const outcome = parseGuideDocument(parsedJson);
  const actualCodes = codesOf(outcome.result);

  if (outcome.ok !== expectation.parses) {
    fail(
      label,
      `parses 기대 ${expectation.parses}, 실제 ${outcome.ok}. 이슈: ${actualCodes.join(', ') || '없음'}`,
    );
    return;
  }
  if (!sameSet(actualCodes, expectation.codes)) {
    fail(
      label,
      `이슈 코드 기대 [${expectation.codes.join(', ')}], 실제 [${actualCodes.join(', ')}]`,
    );
    return;
  }

  // 결정론 - 같은 입력은 같은 결과를 낸다. (M2 DoD 8)
  const again = parseGuideDocument(JSON.parse(raw));
  if (!sameSet(codesOf(again.result), actualCodes)) {
    fail(label, '같은 입력에 대해 두 번의 검증 결과가 다릅니다.');
    return;
  }

  // 직렬화 왕복이 검증 결과를 바꾸지 않는다. M8 canonical 왕복의 선행 조건이다.
  if (outcome.ok) {
    const roundTripped = parseGuideDocument(JSON.parse(JSON.stringify(outcome.document)));
    if (!roundTripped.ok || !sameSet(codesOf(roundTripped.result), actualCodes)) {
      fail(label, 'JSON 왕복 후 검증 결과가 달라집니다.');
      return;
    }
  }

  if (expectation.pendingGraph !== undefined) {
    notes.push(
      `${label}: 스키마 통과. 그래프 판정은 ${expectation.pendingPhase} - ` +
        `기대 코드 ${expectation.pendingGraph.join(', ')}`,
    );
  } else if (expectation.pendingPhase !== undefined) {
    notes.push(`${label}: 스키마 통과. 후속 판정은 ${expectation.pendingPhase}`);
  }
}

async function checkXssPayloads() {
  const label = 'xss-guide.howsheet.json';
  const raw = await readFile(path.join(FIXTURE_DIR, label), 'utf8');
  const missing = XSS_REQUIRED_PAYLOADS.filter((payload) => !raw.includes(payload));
  if (missing.length > 0) {
    fail(
      label,
      `필수 페이로드가 빠졌습니다: ${missing.map((p) => JSON.stringify(p)).join(', ')}. ` +
        'M5 살균과 M9 직렬화 검사가 무의미해집니다.',
    );
  }
}

async function listJson(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return null;
  }
}

async function main() {
  const fixtureFiles = await listJson(FIXTURE_DIR);
  if (fixtureFiles === null || fixtureFiles.length === 0) {
    console.error('verify:fixtures - tests/fixtures에서 픽스처를 찾지 못했습니다.');
    process.exitCode = 1;
    return;
  }

  const expected = Object.keys(EXPECTATIONS).sort();
  const unexpected = fixtureFiles.filter((name) => !(name in EXPECTATIONS));
  const missing = expected.filter((name) => !fixtureFiles.includes(name));

  for (const name of missing) fail(name, '기대 표에 있으나 파일이 없습니다.');
  for (const name of unexpected) {
    fail(name, '픽스처가 기대 표에 없습니다. EXPECTATIONS에 역할과 기대 결과를 적으세요.');
  }

  for (const name of fixtureFiles) {
    const expectation = EXPECTATIONS[name];
    if (expectation === undefined) continue;
    await checkGuideFile(path.join(FIXTURE_DIR, name), name, expectation);
  }

  await checkXssPayloads();

  // 샘플 템플릿 (FR-020). 아직 없으면 그 사실을 보고한다.
  const sampleFiles = await listJson(SAMPLE_DIR);
  if (sampleFiles === null || sampleFiles.length === 0) {
    notes.push('src/assets/samples: 샘플 템플릿 없음 (FR-020, M12에서 3종 이상 추가)');
  } else {
    for (const name of sampleFiles) {
      await checkGuideFile(path.join(SAMPLE_DIR, name), `samples/${name}`, {
        role: 'FR-020 샘플 템플릿',
        parses: true,
        codes: [],
      });
    }
  }

  if (failures.length > 0) {
    console.error(`verify:fixtures - 불일치 ${failures.length}건\n`);
    for (const message of failures) console.error(`  ${message}`);
    console.error('\n기대 표: scripts/verify-fixtures.mjs의 EXPECTATIONS');
    process.exitCode = 1;
    return;
  }

  console.log(`verify:fixtures - 통과. 가이드 ${fixtureFiles.length}개를 검증했습니다.`);
  for (const note of notes) console.log(`  · ${note}`);
}

await main();
