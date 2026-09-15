#!/usr/bin/env node
/**
 * 프롬프트 품질 평가셋.
 *
 * 기준: 하네스 P8 전부. 채점은 기계적 검사만 한다. (2026-09-15 사용자 확정)
 *
 * ```text
 * pnpm eval:prompts                                   전체 평가
 * node scripts/eval-prompts.ts --file <경로> --case <사례 id>   파일 하나 채점
 * ```
 *
 * ## 한 번에 네 가지를 본다
 *
 * 1. **생성** - 고정 자료 × 선택 조합마다 조립기가 만든 프롬프트가 통과한다.
 * 2. **재작성** - `tests/fixtures/eval/prompts/`의 프롬프트가 통과한다.
 *    `handwritten/`은 AI 출력처럼 다시 쓴 예시이고(실제 Haiku 출력이 아니다),
 *    `captured/`는 사용자가 앱에서 받아 넣은 실제 AI 출력이다.
 * 3. **카나리아** - 좋은 프롬프트를 일부러 망가뜨리면 기대한 검사가 걸린다.
 * 4. **공허 방지** - 자료 종류·요소·디자인 값·검사 종류가 하나도 빠지지 않았다.
 *
 * 넷 중 하나라도 어긋나면 종료 코드 1이다. 점수만 찍고 통과하지 않는다. (DoD 5)
 *
 * ## 결과
 *
 * `artifacts/eval/`에 남긴다. 실행할 때마다 지우고 새로 쓴다 - 지난 실행의
 * 실패 파일이 남아 있으면 이번 결과로 오인한다.
 *
 * API를 부르지 않는다. 키를 읽지 않는다. 네트워크 없이 돈다.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { DEFAULT_DESIGN } from '../src/domain/spec.defaults.ts';
import { DESIGN_AXES, ELEMENT_IDS } from '../src/domain/spec.types.ts';
import { composePrompt } from '../src/features/compose/compose.ts';
import { CANARIES, INVENTED_SENTENCES } from '../src/features/evaluate/canaries.ts';
import {
  EVAL_SOURCES,
  EVAL_SOURCE_KINDS,
  EVAL_SOURCE_KIND_LABELS,
  TRUNCATION_LIMIT,
  buildCases,
  designKey,
  type EvalCase,
} from '../src/features/evaluate/cases.ts';
import {
  CHECK_IDS,
  CHECK_LABELS,
  expectedQuote,
  gradePrompt,
  type Finding,
  type GradeResult,
} from '../src/features/evaluate/grade.ts';
import { PROHIBITION_CATEGORIES } from '../src/features/evaluate/lexicon.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'eval');
const OUT = path.join(ROOT, 'artifacts', 'eval');
const PROMPT_PROVENANCES = ['handwritten', 'captured'] as const;

/** 손으로 쓴 재작성은 자료 종류마다 하나 이상이어야 한다. */
const MIN_HANDWRITTEN = EVAL_SOURCES.length;
/** 실패 프롬프트 파일을 이만큼만 쓴다. 넘으면 몇 건을 뺐는지 밝힌다. */
const MAX_FAILURE_FILES = 50;

const toPosix = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

function loadSources(): Map<string, string> {
  const texts = new Map<string, string>();
  for (const source of EVAL_SOURCES) {
    const file = path.join(FIXTURES, 'sources', `${source.id}.md`);
    if (existsSync(file)) texts.set(source.id, read(file));
  }
  return texts;
}

function gradeCase(item: EvalCase, text: string): GradeResult {
  return gradePrompt({
    text,
    studio: item.studio,
    ...(item.maxSourceCharacters === undefined
      ? {}
      : { maxSourceCharacters: item.maxSourceCharacters }),
  });
}

function composeCase(item: EvalCase): string {
  return composePrompt(
    item.studio,
    item.maxSourceCharacters === undefined ? {} : { maxSourceCharacters: item.maxSourceCharacters },
  ).text;
}

function describeFinding(finding: Finding): string {
  const category = finding.category === undefined ? '' : ` [${finding.category}]`;
  const excerpt = finding.excerpt === undefined ? '' : `\n      > ${finding.excerpt}`;
  return `${finding.check}${category} - ${finding.message}${excerpt}`;
}

// ───────────────────────────────────────────────────────── 파일 하나 채점

function gradeOne(args: string[]): number {
  const file = args[args.indexOf('--file') + 1];
  const id = args[args.indexOf('--case') + 1];
  if (file === undefined || id === undefined || !args.includes('--case')) {
    console.error('사용법: node scripts/eval-prompts.ts --file <경로> --case <사례 id>');
    return 2;
  }
  const cases = buildCases(loadSources());
  const item = cases.find((candidate) => candidate.id === id);
  if (item === undefined) {
    console.error(`사례를 찾지 못했습니다: ${id}`);
    console.error(`예: ${cases[0]?.id ?? ''}`);
    return 2;
  }
  const result = gradeCase(item, read(path.resolve(file)));
  console.log(result.passed ? '통과' : '실패');
  for (const finding of result.findings) console.log(`  - ${describeFinding(finding)}`);
  console.log(`  (절 ${result.measured.clauses}개, 사실 후보 ${result.measured.facts}개)`);
  return result.passed ? 0 : 1;
}

// ───────────────────────────────────────────────────────────── 전체 평가

interface Problem {
  area: string;
  message: string;
}

interface CanaryOutcome {
  id: string;
  description: string;
  expect: string;
  applied: number;
  caught: number;
  escaped: string[];
}

function runAll(): number {
  const started = performance.now();
  const problems: Problem[] = [];
  const fail = (area: string, message: string) => problems.push({ area, message });

  // ── 자료 ──────────────────────────────────────────────────────────
  const texts = loadSources();
  for (const source of EVAL_SOURCES) {
    if (!texts.has(source.id)) fail('자료', `자료 파일이 없다: sources/${source.id}.md`);
  }
  for (const kind of EVAL_SOURCE_KINDS) {
    if (!EVAL_SOURCES.some((source) => source.kind === kind)) {
      fail('공허 방지', `자료 종류가 빠졌다: ${EVAL_SOURCE_KIND_LABELS[kind]}`);
    }
  }
  if (EVAL_SOURCES.length < 5) fail('공허 방지', `자료가 ${EVAL_SOURCES.length}종이다 (5종 이상)`);
  if (problems.length > 0) return finish(started, problems, null);

  for (const source of EVAL_SOURCES) {
    const text = texts.get(source.id) ?? '';
    if ([...text].length <= TRUNCATION_LIMIT) {
      fail('공허 방지', `${source.id}가 ${TRUNCATION_LIMIT}자보다 짧아 잘림 사례가 잘리지 않는다`);
    }
    for (const sentence of INVENTED_SENTENCES) {
      // 카나리아가 꾸민 사실이 자료에 있으면 그 카나리아는 잡힐 이유가 없다.
      if (text.includes(sentence)) fail('공허 방지', `카나리아 문장이 자료에 있다: ${source.id}`);
    }
  }

  const cases = buildCases(texts);
  const byId = new Map(cases.map((item) => [item.id, item]));

  // ── 공허 방지: 선택 공간을 전부 덮는가 ────────────────────────────
  for (const id of ELEMENT_IDS) {
    if (!cases.some((item) => item.studio.elements.includes(id))) {
      fail('공허 방지', `한 번도 고르지 않은 요소: ${id}`);
    }
  }
  for (const axis of DESIGN_AXES) {
    for (const option of axis.options) {
      if (!cases.some((item) => item.design[axis.id] === option.id)) {
        fail('공허 방지', `한 번도 쓰지 않은 디자인 값: ${axis.id}=${option.id}`);
      }
    }
  }
  if (!cases.some((item) => item.maxSourceCharacters !== undefined)) {
    fail('공허 방지', '잘림 사례가 없다');
  }

  // ── 1. 생성 ────────────────────────────────────────────────────────
  const generated = { total: 0, passed: 0, clauses: 0, facts: 0 };
  const byCheck = new Map<string, number>();
  const failures: Array<{ id: string; findings: Finding[]; text: string }> = [];
  const samples: Array<{ id: string; text: string }> = [];

  for (const item of cases) {
    const text = composeCase(item);
    const result = gradeCase(item, text);
    generated.total += 1;
    generated.clauses += result.measured.clauses;
    generated.facts += result.measured.facts;
    if (result.passed) generated.passed += 1;
    else failures.push({ id: item.id, findings: result.findings, text });
    for (const finding of result.findings) {
      byCheck.set(finding.check, (byCheck.get(finding.check) ?? 0) + 1);
    }
    // 사람이 열어 볼 견본: 자료에 맞는 요소 × 기본 디자인.
    if (item.elementSet === 'fit' && designKey(item.design) === designKey(DEFAULT_DESIGN)) {
      samples.push({ id: item.id, text });
    }
  }
  if (generated.passed < generated.total) {
    fail('생성', `조립기 프롬프트 ${generated.total - generated.passed}건이 기준 미달이다`);
  }
  // 절이나 사실 후보가 하나도 없으면 검사가 텍스트를 보지 않은 것이다.
  if (generated.clauses === 0 || generated.facts === 0) {
    fail('공허 방지', `검사가 본 양이 0이다 (절 ${generated.clauses}, 사실 ${generated.facts})`);
  }

  // ── 2. 재작성 ──────────────────────────────────────────────────────
  const rewrites: Array<{ provenance: string; id: string; result: GradeResult; text: string }> = [];
  for (const provenance of PROMPT_PROVENANCES) {
    const dir = path.join(FIXTURES, 'prompts', provenance);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)
      .filter((entry) => entry.endsWith('.md'))
      .sort()) {
      const id = name.slice(0, -'.md'.length);
      const item = byId.get(id);
      if (item === undefined) {
        fail('재작성', `${provenance}/${name}: 이런 사례가 없다`);
        continue;
      }
      const text = read(path.join(dir, name));
      const result = gradeCase(item, text);
      rewrites.push({ provenance, id, result, text });
      if (!result.passed) {
        fail('재작성', `${provenance}/${name}이 기준 미달이다`);
        failures.push({ id: `${provenance}/${id}`, findings: result.findings, text });
      }
    }
  }
  const handwritten = rewrites.filter((entry) => entry.provenance === 'handwritten');
  if (handwritten.length < MIN_HANDWRITTEN) {
    fail('공허 방지', `손으로 쓴 재작성이 ${handwritten.length}건이다 (${MIN_HANDWRITTEN}건 이상)`);
  }
  for (const source of EVAL_SOURCES) {
    if (!handwritten.some((entry) => byId.get(entry.id)?.source.id === source.id)) {
      fail('공허 방지', `손으로 쓴 재작성이 없는 자료: ${source.id}`);
    }
  }

  // ── 3. 카나리아 ────────────────────────────────────────────────────
  // 변이를 가할 바탕: 재작성 전부, 같은 사례의 조립기 출력, 잘림 사례의 조립기 출력.
  const bases: Array<{ label: string; item: EvalCase; text: string }> = [];
  for (const entry of rewrites) {
    const item = byId.get(entry.id);
    if (item === undefined) continue;
    bases.push({ label: `${entry.provenance}/${entry.id}`, item, text: entry.text });
    bases.push({ label: `template/${entry.id}`, item, text: composeCase(item) });
  }
  for (const item of cases.filter((candidate) => candidate.maxSourceCharacters !== undefined)) {
    bases.push({ label: `template/${item.id}`, item, text: composeCase(item) });
  }

  const outcomes: CanaryOutcome[] = CANARIES.map((canary) => ({
    id: canary.id,
    description: canary.description,
    expect:
      canary.expect.category === undefined
        ? canary.expect.check
        : `${canary.expect.check}:${canary.expect.category}`,
    applied: 0,
    caught: 0,
    escaped: [],
  }));

  for (const base of bases) {
    // 바탕이 이미 떨어지면 카나리아가 무엇 때문에 떨어졌는지 알 수 없다.
    if (!gradeCase(base.item, base.text).passed) continue;
    const quote = expectedQuote(base.item.studio.source, base.item.maxSourceCharacters);
    const target = {
      studio: base.item.studio,
      quote: quote.core,
      truncated: quote.included < quote.total,
    };
    CANARIES.forEach((canary, index) => {
      const mutated = canary.apply(base.text, target);
      if (mutated === null) return;
      const outcome = outcomes[index];
      if (outcome === undefined) return;
      outcome.applied += 1;
      const caught = gradeCase(base.item, mutated).findings.some(
        (finding) =>
          finding.check === canary.expect.check &&
          (canary.expect.category === undefined || finding.category === canary.expect.category),
      );
      if (caught) outcome.caught += 1;
      else outcome.escaped.push(base.label);
    });
  }

  for (const outcome of outcomes) {
    if (outcome.applied === 0) fail('카나리아', `${outcome.id}: 적용할 바탕이 없었다`);
    else if (outcome.escaped.length > 0) {
      fail(
        '카나리아',
        `${outcome.id}: ${outcome.escaped.length}/${outcome.applied}건이 빠져나갔다`,
      );
    }
  }
  // 검사 종류와 금지 범주마다 그것을 시험하는 카나리아가 있어야 한다.
  for (const check of CHECK_IDS) {
    if (!outcomes.some((outcome) => outcome.expect.split(':')[0] === check && outcome.caught > 0)) {
      fail('공허 방지', `잡힌 카나리아가 없는 검사: ${check}`);
    }
  }
  for (const category of PROHIBITION_CATEGORIES) {
    if (
      !outcomes.some((outcome) => outcome.expect.endsWith(`:${category}`) && outcome.caught > 0)
    ) {
      fail('공허 방지', `잡힌 카나리아가 없는 금지 범주: ${category}`);
    }
  }

  return finish(started, problems, {
    cases: cases.length,
    generated,
    byCheck,
    failures,
    samples,
    rewrites,
    outcomes,
    bases: bases.length,
  });
}

// ─────────────────────────────────────────────────────────────── 기록

interface Report {
  cases: number;
  generated: { total: number; passed: number; clauses: number; facts: number };
  byCheck: Map<string, number>;
  failures: Array<{ id: string; findings: Finding[]; text: string }>;
  samples: Array<{ id: string; text: string }>;
  rewrites: Array<{ provenance: string; id: string; result: GradeResult; text: string }>;
  outcomes: CanaryOutcome[];
  bases: number;
}

function finish(started: number, problems: Problem[], report: Report | null): number {
  const passed = problems.length === 0;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'samples'), { recursive: true });

  const lines: string[] = [
    '# 프롬프트 평가 결과',
    '',
    `- 판정: **${passed ? '통과' : '실패'}**`,
    `- 채점: 기계적 검사만 (AI 채점 없음)`,
    `- 걸린 시간: ${seconds}초`,
    '',
  ];

  if (report !== null) {
    const { generated } = report;
    lines.push(
      '## 1. 조립기가 만든 프롬프트',
      '',
      `자료 ${EVAL_SOURCES.length}종 × 요소 조합 13종 × 디자인 ${DESIGN_AXES.reduce((n, axis) => n * axis.options.length, 1)}종, 그리고 잘림 사례 ${EVAL_SOURCES.length}건.`,
      '',
      `- 사례 ${generated.total}건 중 통과 ${generated.passed}건`,
      `- 들여다본 절 ${generated.clauses.toLocaleString('ko-KR')}개, 사실 후보 ${generated.facts.toLocaleString('ko-KR')}개`,
      '',
      '| 검사 | 위반 |',
      '| --- | ---: |',
      ...CHECK_IDS.map((check) => `| ${CHECK_LABELS[check]} | ${report.byCheck.get(check) ?? 0} |`),
      '',
      '## 2. 다시 쓴 프롬프트',
      '',
      '`handwritten`은 AI 출력처럼 다시 쓴 예시다. 실제 Haiku 출력이 아니다.',
      '`captured`는 앱에서 받은 실제 AI 출력이다.',
      '',
      `- captured: ${report.rewrites.filter((entry) => entry.provenance === 'captured').length}건`,
      '',
      '| 출처 | 사례 | 판정 | 절 | 사실 후보 |',
      '| --- | --- | --- | ---: | ---: |',
      ...report.rewrites.map(
        (entry) =>
          `| ${entry.provenance} | \`${entry.id}\` | ${entry.result.passed ? '통과' : '실패'} | ${entry.result.measured.clauses} | ${entry.result.measured.facts} |`,
      ),
      '',
      '## 3. 카나리아 (일부러 나쁘게 만든 프롬프트)',
      '',
      `변이를 가한 바탕 ${report.bases}개.`,
      '',
      '| 카나리아 | 기대한 검사 | 적용 | 잡음 |',
      '| --- | --- | ---: | ---: |',
      ...report.outcomes.map(
        (outcome) =>
          `| ${outcome.description} | \`${outcome.expect}\` | ${outcome.applied} | ${outcome.caught} |`,
      ),
      '',
    );

    for (const sample of report.samples) {
      writeFileSync(path.join(OUT, 'samples', `${sample.id}.md`), sample.text);
    }
    if (report.failures.length > 0) {
      mkdirSync(path.join(OUT, 'failures'), { recursive: true });
      for (const failure of report.failures.slice(0, MAX_FAILURE_FILES)) {
        writeFileSync(
          path.join(OUT, 'failures', `${failure.id.replace(/\//g, '__')}.md`),
          failure.text,
        );
      }
    }

    writeFileSync(
      path.join(OUT, 'results.json'),
      `${JSON.stringify(
        {
          passed,
          problems,
          generated: report.generated,
          failures: report.failures.map(({ id, findings }) => ({ id, findings })),
          rewrites: report.rewrites.map(({ provenance, id, result }) => ({
            provenance,
            id,
            ...result,
          })),
          canaries: report.outcomes,
        },
        null,
        2,
      )}\n`,
    );
  }

  lines.push('## 기준 미달', '');
  if (problems.length === 0) lines.push('없음.', '');
  else lines.push(...problems.map((problem) => `- **${problem.area}** - ${problem.message}`), '');

  if (report !== null && report.failures.length > 0) {
    lines.push('## 실패한 프롬프트의 위반 내용', '');
    for (const failure of report.failures.slice(0, MAX_FAILURE_FILES)) {
      lines.push(
        `### \`${failure.id}\``,
        '',
        ...failure.findings.map((f) => `- ${describeFinding(f)}`),
        '',
      );
    }
    if (report.failures.length > MAX_FAILURE_FILES) {
      lines.push(
        `나머지 ${report.failures.length - MAX_FAILURE_FILES}건은 \`results.json\`에 있다.`,
        '',
      );
    }
  }

  writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n'));

  // ── 콘솔 ──────────────────────────────────────────────────────────
  if (report !== null) {
    console.log(
      `생성   ${report.generated.passed}/${report.generated.total} 통과  (절 ${report.generated.clauses}, 사실 후보 ${report.generated.facts})`,
    );
    const rewritesPassed = report.rewrites.filter((entry) => entry.result.passed).length;
    console.log(`재작성 ${rewritesPassed}/${report.rewrites.length} 통과`);
    const caught = report.outcomes.filter(
      (outcome) => outcome.applied > 0 && outcome.escaped.length === 0,
    ).length;
    console.log(
      `카나리아 ${caught}/${report.outcomes.length}종이 모두 잡힘  (바탕 ${report.bases}개)`,
    );
    for (const failure of report.failures.slice(0, 5)) {
      console.log(`\n  ${failure.id}`);
      for (const finding of failure.findings.slice(0, 5))
        console.log(`    - ${describeFinding(finding)}`);
    }
  }
  for (const problem of problems) console.error(`기준 미달 [${problem.area}] ${problem.message}`);
  console.log(
    `\n${passed ? '통과' : '실패'} - ${toPosix(path.join(OUT, 'summary.md'))} (${seconds}초)`,
  );

  return passed ? 0 : 1;
}

const args = process.argv.slice(2);
process.exitCode = args.includes('--file') ? gradeOne(args) : runAll();
