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
 * 그래프 판정(순환·도달 가능성·분기 대상·우선순위·종료 단계)은 M6의
 * `features/branching/graph-validator.ts`가 한다. 코드 집합만 비교하면 severity가
 * 뒤집히거나 내보내기 가능 여부가 바뀌어도 통과하므로 셋을 함께 고정한다.
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

import { validateGuideGraph } from '../src/features/branching/graph-validator.ts';
import { parseGuideDocument, validateGuideDocument } from '../src/domain/guide.schema.ts';
import { ISSUE_CODES, summarize } from '../src/domain/validation.types.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures');
const SAMPLE_DIR = path.join(REPO_ROOT, 'src/assets/samples');
const MARKDOWN_DIR = path.join(FIXTURE_DIR, 'markdown-samples');

/**
 * `codes`는 스키마 판정, `graph`는 그래프 판정(M6)의 기대다. 코드 집합만 비교하면
 * severity와 내보내기 가능 여부가 조용히 뒤집혀도 통과하므로 셋을 함께 고정한다.
 *
 * @typedef {{
 *   role: string,
 *   parses: boolean,
 *   codes: string[],
 *   graph?: Array<[string, 'error' | 'warning' | 'info']>,
 *   exportable?: boolean,
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
    graph: [[ISSUE_CODES.BRANCH_TARGET_NOT_FOUND, 'error']],
    exportable: false,
  },
  'invalid-cycle.howsheet.json': {
    role: '분기 간선으로 닫히는 3노드 순환. 도달 가능한 종료 단계가 따로 있다',
    parses: true,
    codes: [],
    graph: [[ISSUE_CODES.CYCLE_DETECTED, 'error']],
    exportable: false,
  },
  'invalid-unreachable.howsheet.json': {
    role: '시작 단계에서 도달할 수 없는 단계',
    parses: true,
    codes: [],
    // 도달 불가는 warning이라 내보내기를 막지 않는다. 하네스 DoD 4의 error
    // 열거에 없고 DoD 5가 따로 "설계된 severity"라고 부른다.
    graph: [[ISSUE_CODES.UNREACHABLE_STEP, 'warning']],
    exportable: true,
  },
  'invalid-no-terminal.howsheet.json': {
    role: '종료 가능한 단계가 없음. 자기 자신을 가리키는 간선을 포함한다',
    parses: true,
    codes: [],
    graph: [
      [ISSUE_CODES.NO_TERMINAL_STEP, 'error'],
      [ISSUE_CODES.CYCLE_DETECTED, 'error'],
    ],
    exportable: false,
  },
  'invalid-duplicate-priority.howsheet.json': {
    role: '분기 우선순위 중복. 조건이 완전히 같은 규칙 쌍도 포함한다',
    parses: true,
    codes: [],
    graph: [
      [ISSUE_CODES.DUPLICATE_BRANCH_PRIORITY, 'error'],
      [ISSUE_CODES.DUPLICATE_BRANCH_CONDITION, 'warning'],
    ],
    exportable: false,
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

/**
 * Markdown 기준 픽스처. 하네스 §0.10이 M2부터 유지하라고 명시한 5종이다.
 *
 * 여기서는 **파일이 있고 그 역할에 맞는 입력을 담고 있는지**만 본다.
 * 기대 매핑 snapshot은 M10 DoD 10이 붙인다. 그때까지 이 표가 픽스처의
 * 계약이다. 파일만 있고 내용이 역할과 어긋나면 M10이 엉뚱한 것을 고정한다.
 *
 * @type {Record<string, { role: string, mustContain: string[], forbid?: string[] }>}
 */
const MARKDOWN_EXPECTATIONS = {
  'complete-guide.md': {
    role: '깔끔하게 매핑되는 기준 문서. 제목·준비물·주의·번호 단계·코드·링크',
    mustContain: ['# ', '## 준비물', '## 주의', '```', '](https://'],
  },
  'ambiguous-headings.md': {
    role: '제목 계층이 일정하지 않은 문서. 매핑 검토 화면(M10 DoD 5)의 입력',
    // 건너뛴 계층, 굵은 글씨 의사 제목, setext 제목, 같은 이름의 중복 제목.
    mustContain: ['#### ', '**2단계**', '-----', '## 1단계'],
  },
  'raw-html.md': {
    role: '원본 HTML이 섞인 문서. 가져오기가 살균을 거치는지 확인하는 입력',
    mustContain: ['<script', 'onerror=', 'javascript:', 'srcdoc', '<svg', '<iframe'],
  },
  'local-images.md': {
    role: '상대 경로 이미지. 파일 시스템에 없는 참조를 어떻게 보고하는지 (M10 DoD 6)',
    mustContain: ['](./images/', '](images/', '](../', '![]('],
    // 원격 이미지가 섞이면 이 픽스처가 무엇을 고정하는지 흐려진다.
    forbid: ['](https://', '](http://'],
  },
  'remote-images.md': {
    role: '원격 이미지. 리더가 내려받지 않는다는 것을 확인하는 입력 (INV-15)',
    mustContain: ['](https://', '](http://', '](//'],
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

/**
 * 그래프 판정 대조. (M6 DoD 4·5)
 *
 * `sameSet`으로 코드만 보던 방식으로는 부족하다. severity 하나가 뒤집히면
 * 내보내기 차단이 사라지는데 코드 집합은 그대로다.
 */
function checkGraph(label, document, expectation) {
  const graph = validateGuideGraph(document);
  const expected = expectation.graph ?? [];

  const actual = graph.issues.map((issue) => `${issue.code}:${issue.severity}`).sort();
  const wanted = expected.map(([code, severity]) => `${code}:${severity}`).sort();

  if (!sameSet(actual, wanted)) {
    fail(label, `그래프 판정 기대 [${wanted.join(', ')}], 실제 [${actual.join(', ')}]`);
    return;
  }

  // 그래프 이슈는 전부 문서 단계다. field로 새면 Validation Panel의 묶음이 틀린다.
  for (const issue of graph.issues) {
    if (issue.stage !== 'document') {
      fail(label, `${issue.code}의 stage가 '${issue.stage}'입니다. 'document'여야 합니다.`);
      return;
    }
    if (issue.path === '' && issue.code !== ISSUE_CODES.NO_TERMINAL_STEP) {
      fail(label, `${issue.code}에 이동할 필드 경로가 없습니다. (FR-019)`);
      return;
    }
  }

  // 스키마 이슈와 합쳤을 때의 내보내기 가능 여부. 이것이 M6 DoD 4의 판정이다.
  const merged = summarize([...validateGuideDocument(document).issues, ...graph.issues]);
  const wantExportable = expectation.exportable ?? true;
  if (merged.exportable !== wantExportable) {
    fail(label, `내보내기 가능 기대 ${wantExportable}, 실제 ${merged.exportable}`);
    return;
  }

  // 결정론 - 두 번 돌려도 같다. (M6 DoD 1)
  const again = validateGuideGraph(document);
  if (
    !sameSet(
      again.issues.map((i) => `${i.code}:${i.severity}`),
      actual,
    )
  ) {
    fail(label, '같은 문서에 대해 두 번의 그래프 판정 결과가 다릅니다.');
  }
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

  if (outcome.ok) checkGraph(label, outcome.document, expectation);

  if (expectation.pendingPhase !== undefined) {
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

/** Markdown 기준 픽스처가 있고 역할에 맞는 입력을 담고 있는지 본다. (하네스 §0.10) */
async function checkMarkdownSamples() {
  let files;
  try {
    files = (await readdir(MARKDOWN_DIR)).filter((name) => name.endsWith('.md')).sort();
  } catch {
    files = [];
  }

  const expected = Object.keys(MARKDOWN_EXPECTATIONS).sort();
  for (const name of expected) {
    if (!files.includes(name)) {
      fail(`markdown-samples/${name}`, '하네스 §0.10이 요구한 픽스처가 없습니다.');
    }
  }
  for (const name of files) {
    if (name in MARKDOWN_EXPECTATIONS) continue;
    fail(
      `markdown-samples/${name}`,
      '픽스처가 기대 표에 없습니다. MARKDOWN_EXPECTATIONS에 역할을 적으세요.',
    );
  }

  for (const name of files) {
    const expectation = MARKDOWN_EXPECTATIONS[name];
    if (expectation === undefined) continue;

    const source = await readFile(path.join(MARKDOWN_DIR, name), 'utf8');
    const label = `markdown-samples/${name}`;

    if (source.trim() === '') {
      fail(label, '내용이 비어 있습니다.');
      continue;
    }

    for (const marker of expectation.mustContain) {
      if (!source.includes(marker)) {
        fail(label, `역할("${expectation.role}")에 필요한 '${marker}'가 없습니다.`);
      }
    }
    for (const marker of expectation.forbid ?? []) {
      if (source.includes(marker)) {
        fail(label, `이 픽스처에는 '${marker}'가 없어야 합니다. 역할이 흐려집니다.`);
      }
    }
  }

  notes.push(
    `markdown-samples: ${files.length}종 확인. 기대 매핑 snapshot은 M10 DoD 10에서 붙인다`,
  );
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
  await checkMarkdownSamples();

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
