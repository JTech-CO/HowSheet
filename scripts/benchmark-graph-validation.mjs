#!/usr/bin/env node
/**
 * 100단계 그래프 검증 벤치마크.
 *
 * 기준: 하네스 M6 DoD 10("100단계 기준 그래프 검증은 30회 median 목표 100ms
 * 이하, 하드 상한 300ms 이하이며 결과 보고서를 남긴다"), §0.11 검증 증거 경로,
 * 기술 백서 §2.4.2 성능 예산.
 *
 * **종료 코드는 하드 상한만 판정한다.** DoD 10과 기술 §2.4.2가 "목표"와
 * "하드 상한"(표에서는 "최대 허용")을 다른 낱말로 나눠 두었다. 목표 초과를
 * 실패로 만들면 "하드 상한"이라는 말이 할 일이 없어진다. 목표를 넘으면 종료
 * 코드는 0이지만 경고를 크게 찍는다. **그 경고를 없애려고 상수를 올리는 것은
 * 하네스 §3.3이 금지한 임계치 하향이다.** PROGRESS.md의 실패 게이트와 M6
 * 보고서 "남은 경고"에 적고 원인을 고친다.
 *
 * 시간 여유가 크면 시간 임계 자체는 사실상 물지 않는다. 그래서 이 스크립트는
 * 시간 외에 세 가지를 함께 문다. 그러지 않으면 빈 벤치마크가 된다.
 *   1. 픽스처 크기 계약 - 단계 100개, 간선 165개 이상
 *   2. 조기 종료 감지 - 그래프에 error가 있으면 그 시간은 100단계 검증 비용이 아니다
 *   3. 결정론 - 30회의 판정 결과가 전부 같아야 한다 (M6 DoD 1)
 *
 * 보고서는 `artifacts/qa/performance/`에 쓴다. 이 디렉터리는 커밋하지 않으므로
 * (D-09) 같은 표를 stdout에도 찍는다. median은 `artifacts/qa/phase-reports/M6.md`
 * 본문에 옮겨 적는다.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseGuideDocument } from '../src/domain/guide.schema.ts';
import { analyzeGuideGraph } from '../src/features/branching/graph-validator.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'tests/fixtures/large-100-step.howsheet.json');
const REPORT_DIR = path.join(REPO_ROOT, 'artifacts/qa/performance');
const REPORT_FILE = path.join(REPORT_DIR, 'graph-validation.md');

/** DoD 10이 지정한 횟수. 짝수라 median은 정렬 후 15·16번째의 평균이다. */
const MEASURED_RUNS = 30;
/** V8은 첫 호출을 인터프리터로 돌린다. 버리되 cold 1회는 따로 보고한다. */
const WARMUP_RUNS = 10;

const TARGET_MS = 100;
const HARD_LIMIT_MS = 300;

/** 픽스처가 얇아지면 수치는 좋아지고 게이트는 텅 빈다. (§2.4.2, M6 DoD 10) */
const MIN_STEPS = 100;
const MIN_EDGES = 165;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  if (!Number.isInteger(middle)) return sorted[Math.floor(middle)];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function countEdges(doc) {
  return doc.steps.reduce(
    (total, step) => total + step.branchRules.length + (step.defaultNextStepId ? 1 : 0),
    0,
  );
}

function ms(value) {
  return `${value.toFixed(3)}ms`;
}

/**
 * 매 회차에 다른 사본을 넘긴다.
 *
 * 같은 객체를 30번 넘기면, 검증기가 나중에 문서 동일성으로 메모이즈하는 순간
 * 2회차부터 캐시 적중 시간을 재게 되고 게이트가 조용히 무의미해진다. 사본
 * 생성은 측정 루프 밖이라 수치에 들어가지 않는다.
 */
function measure(documents) {
  const samples = [];
  const signatures = new Set();

  for (const doc of documents) {
    const started = performance.now();
    const analysis = analyzeGuideGraph(doc);
    samples.push(performance.now() - started);
    signatures.add(analysis.result.issues.map((issue) => `${issue.code}:${issue.path}`).join('|'));
  }

  return { samples, signatures };
}

function report(stats, environment) {
  return `# 그래프 검증 성능 보고서

- 측정: ${stats.stamp}
- 픽스처: \`tests/fixtures/large-100-step.howsheet.json\` (단계 ${stats.steps}개, 간선 ${stats.edges}개)
- 실행: 워밍업 ${WARMUP_RUNS}회 후 ${MEASURED_RUNS}회 측정

## 환경

| 항목 | 값 |
| --- | --- |
| Node | ${environment.node} |
| 플랫폼 | ${environment.platform} |
| CPU | ${environment.cpu} |
| 논리 코어 | ${environment.cores} |
| CI | ${environment.ci} |

로컬과 CI 수치가 다를 때 "러너가 느린 것"인지 "코드가 느려진 것"인지는 이 표로
가른다. 보정 계수를 두지 않는 이유는 그 계수 자체가 회귀를 감추는 손잡이가 되기
때문이다.

## 결과 (M6 DoD 10)

| 항목 | 값 | 기준 |
| --- | --- | --- |
| median | **${ms(stats.median)}** | 목표 ${TARGET_MS}ms 이하 / 하드 상한 ${HARD_LIMIT_MS}ms |
| 최소 | ${ms(stats.min)} | |
| 최대 | ${ms(stats.max)} | |
| cold(첫 회) | ${ms(stats.cold)} | 게이트 아님. 사용자가 문서를 처음 열 때 보는 값 |
| 판정 | ${stats.verdict} | |

참고 - 스키마 검증까지 포함한 median은 ${ms(stats.withSchemaMedian)}이다. 기술
§2.4.2의 "100단계 가이드 검증"은 이 범위로 읽힌다. 하네스 DoD 10은 "그래프
검증"이므로 게이트는 위 median으로 판정한다.

> 이 파일은 \`.gitignore\` 대상이다(§0.11, D-09). 위 median을
> \`artifacts/qa/phase-reports/M6.md\` 본문에 옮겨 적는다.
`;
}

async function main() {
  const raw = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const parsed = parseGuideDocument(raw);
  if (!parsed.ok) {
    console.error('benchmark:graph - 픽스처가 스키마를 통과하지 못했습니다.');
    process.exitCode = 1;
    return;
  }

  const doc = parsed.document;
  const steps = doc.steps.length;
  const edges = countEdges(doc);

  if (steps < MIN_STEPS || edges < MIN_EDGES) {
    console.error(
      `benchmark:graph - 픽스처가 기준보다 작습니다. 단계 ${steps}/${MIN_STEPS}, ` +
        `간선 ${edges}/${MIN_EDGES}. 얇아진 픽스처로는 100단계 성능을 잴 수 없습니다.`,
    );
    process.exitCode = 1;
    return;
  }

  // 잘못된 그래프는 첫 오류에서 빠져나올 수 있다. 그 시간은 100단계 검증 비용이 아니다.
  const baseline = analyzeGuideGraph(doc);
  const errors = baseline.result.issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    console.error(
      `benchmark:graph - 픽스처에 그래프 오류 ${errors.length}건이 있습니다: ` +
        `${errors.map((issue) => issue.code).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const coldStarted = performance.now();
  analyzeGuideGraph(structuredClone(doc));
  const cold = performance.now() - coldStarted;

  const warmups = Array.from({ length: WARMUP_RUNS }, () => structuredClone(doc));
  measure(warmups);

  const documents = Array.from({ length: MEASURED_RUNS }, () => structuredClone(doc));
  const { samples, signatures } = measure(documents);

  if (signatures.size !== 1) {
    console.error(
      `benchmark:graph - ${MEASURED_RUNS}회의 판정 결과가 서로 다릅니다(${signatures.size}종). ` +
        '그래프 검증이 결정적이지 않습니다. (M6 DoD 1)',
    );
    process.exitCode = 1;
    return;
  }

  // 참고 수치. 기술 §2.4.2의 "가이드 검증"은 스키마까지 포함한 범위로 읽힌다.
  const withSchema = Array.from({ length: MEASURED_RUNS }, () => structuredClone(raw)).map(
    (input) => {
      const started = performance.now();
      const outcome = parseGuideDocument(input);
      if (outcome.ok) analyzeGuideGraph(outcome.document);
      return performance.now() - started;
    },
  );

  const value = median(samples);
  const overLimit = value > HARD_LIMIT_MS;
  const overTarget = value > TARGET_MS;
  const verdict = overLimit
    ? `하드 상한 초과 (${HARD_LIMIT_MS}ms)`
    : overTarget
      ? `목표 초과 - 상한 안 (${TARGET_MS}ms < median <= ${HARD_LIMIT_MS}ms)`
      : '통과 (목표 안)';

  const stats = {
    stamp: new Date().toISOString(),
    steps,
    edges,
    median: value,
    min: Math.min(...samples),
    max: Math.max(...samples),
    cold,
    withSchemaMedian: median(withSchema),
    verdict,
  };

  const environment = {
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: os.cpus()[0]?.model ?? '알 수 없음',
    cores: os.cpus().length,
    ci: process.env['CI'] === undefined ? '아니오' : '예',
  };

  // 보고서를 남기는 것도 DoD 10의 일부다. 쓰기 실패는 실패다.
  try {
    await mkdir(REPORT_DIR, { recursive: true });
    await writeFile(REPORT_FILE, report(stats, environment), 'utf8');
  } catch (error) {
    console.error(`benchmark:graph - 보고서를 쓰지 못했습니다: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const relative = path.relative(REPO_ROOT, REPORT_FILE).split(path.sep).join('/');

  if (overLimit) {
    console.error(
      `benchmark:graph - 하드 상한 초과. median ${ms(value)} > ${HARD_LIMIT_MS}ms\n` +
        `  단계 ${steps}개, 간선 ${edges}개, cold ${ms(cold)}\n` +
        `  보고서: ${relative}\n\n` +
        '  상수를 올려 통과시키지 않는다. (하네스 §3.3)',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `benchmark:graph - ${verdict}. median ${ms(value)} ` +
      `(최소 ${ms(stats.min)}, 최대 ${ms(stats.max)}, cold ${ms(cold)})`,
  );
  console.log(`  · 단계 ${steps}개, 간선 ${edges}개, ${MEASURED_RUNS}회 측정`);
  console.log(`  · 스키마 포함 median ${ms(stats.withSchemaMedian)} (참고, 기술 §2.4.2)`);
  console.log(`  · 보고서: ${relative} (커밋하지 않는다. median을 M6.md 본문에 옮겨 적는다)`);

  if (overTarget) {
    console.warn(
      `\n  경고: 목표 ${TARGET_MS}ms를 넘었다. 종료 코드는 0이지만 DoD 10은 아직 충족이 아니다.\n` +
        '  PROGRESS.md의 실패 게이트와 M6 보고서 남은 경고에 적고 원인을 고친다.',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
