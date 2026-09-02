/**
 * 분기 그래프 검증.
 *
 * 기준: 기술 백서 §4.4.1(분기 그래프 검증), §2.2.4(문서 검증).
 * 하네스 M6 DoD 4~6·10, INV-06.
 *
 * **이슈 코드는 `domain`이 갖고 판정은 여기가 한다.** `domain`은 외부 계층을
 * import할 수 없으므로(File_Structure.md §3.2-1) `validateGuideDocument`가 이
 * 함수를 부를 수 없다. 두 결과를 합치는 것은 호출자의 일이다.
 *
 *   summarize([...validateGuideDocument(doc).issues, ...validateGuideGraph(doc).issues])
 *
 * 합성 함수를 이 파일에 두지 않는 이유는 `guide.schema.ts`가 zod에 의존하기
 * 때문이다. 여기서 그것을 import하면 리더 런타임이 이 파일을 쓰는 순간 zod가
 * 리더 번들 폐포에 들어간다. (D-11)
 *
 * 검증 순서는 §4.4.1의 6단계를 그대로 따른다.
 *   1. 간선 대상 존재  2. 순환  3. 도달 가능  4. 도달 불가  5. 종료 노드  6. 중복 규칙
 */

import {
  ISSUE_CODES,
  joinPath,
  summarize,
  type ValidationIssue,
  type ValidationResult,
} from '../../domain/validation.types.ts';
import type { BranchRule, GuideDocument, GuideStep } from '../../domain/guide.types.ts';
import { orderedBranchRules } from './branch-engine.ts';

/** 그래프 간선 하나. `ruleId`가 없으면 `defaultNextStepId`가 만든 간선이다. */
export interface StepEdge {
  readonly from: string;
  readonly to: string;
  readonly ruleId?: string;
  /** 이슈에서 해당 필드로 이동하기 위한 경로. `steps[0].branchRules[1].targetStepId` */
  readonly path: string;
}

/**
 * 판정용 방향 그래프. (기술 §4.4.1)
 *
 * `nodes`는 문서 순서를 유지하고 나가는 간선은 `priority` 오름차순이다. 판정의
 * 결정론이 여기서 나온다. 배열 순서와 `priority` 순서는 실제로 어긋나 있다.
 */
export interface StepGraph {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyMap<string, readonly StepEdge[]>;
  readonly startStepId: string;
  readonly titles: ReadonlyMap<string, string>;
  /** 대상이 문서에 없어 간선으로 만들지 못한 참조. */
  readonly danglingEdges: readonly StepEdge[];
}

/** 순환 하나. `path`는 진입 노드가 앞뒤에 모두 들어간 읽을 수 있는 경로다. (M6 DoD 6) */
export interface DetectedCycle {
  readonly path: readonly string[];
  /** 순환을 닫는 간선. 이슈의 `path`가 된다. (디자인 §2.4.6) */
  readonly closingEdge: StepEdge;
}

export interface GraphAnalysis {
  readonly result: ValidationResult;
  readonly cycles: readonly DetectedCycle[];
  readonly reachable: ReadonlySet<string>;
  /** 도달 가능하면서 여기서 끝날 수 있는 단계. */
  readonly terminalStepIds: readonly string[];
}

function ruleEdgePath(stepIndex: number, ruleIndex: number): string {
  return joinPath('steps', stepIndex, 'branchRules', ruleIndex, 'targetStepId');
}

/**
 * 문서를 방향 그래프로 만든다.
 *
 * **존재하지 않는 대상은 간선으로 만들지 않고 `danglingEdges`로 뺀다.** 없는
 * 노드로 걸어가면 도달 집합에 유령 ID가 끼고 순환 판정이 오염된다. 누락 자체는
 * 아래에서 error로 보고하므로 판정이 약해지지 않는다.
 */
export function buildStepGraph(doc: GuideDocument): StepGraph {
  const known = new Set(doc.steps.map((step) => step.id));
  const edges = new Map<string, readonly StepEdge[]>();
  const dangling: StepEdge[] = [];

  doc.steps.forEach((step, stepIndex) => {
    const outgoing: StepEdge[] = [];

    // priority 오름차순으로 만든다. 배열 순서로 만들면 간선 순서가 실행 순서와
    // 달라져 순환 경로 보고가 실제 진행과 어긋난다.
    for (const rule of orderedBranchRules(step)) {
      const ruleIndex = step.branchRules.indexOf(rule);
      const edge: StepEdge = {
        from: step.id,
        to: rule.targetStepId,
        ruleId: rule.id,
        path: ruleEdgePath(stepIndex, ruleIndex),
      };
      (known.has(rule.targetStepId) ? outgoing : dangling).push(edge);
    }

    if (step.defaultNextStepId !== undefined) {
      // 기본 경로도 간선이다. (§4.4.1 - 간선은 두 종류다)
      const edge: StepEdge = {
        from: step.id,
        to: step.defaultNextStepId,
        path: joinPath('steps', stepIndex, 'defaultNextStepId'),
      };
      (known.has(step.defaultNextStepId) ? outgoing : dangling).push(edge);
    }

    edges.set(step.id, outgoing);
  });

  return {
    nodes: doc.steps.map((step) => step.id),
    edges,
    startStepId: doc.startStepId,
    titles: new Map(doc.steps.map((step) => [step.id, step.title])),
    danglingEdges: dangling,
  };
}

/**
 * §4.4.1의 색상 마킹 DFS. **첫 순환에서 멈추지 않고 back edge마다 하나씩 모은다.**
 *
 * 백서 예시는 첫 것만 돌려주지만, INV-06이 "순환 경로 1건도 허용하지 않는다"이고
 * 하네스 M6 주의가 "탐지를 어렵게 한다는 이유로 순환을 숨기지 않는다"이므로
 * 전수 보고가 맞다. 하나씩 고치게 만들면 그게 곧 탐지를 어렵게 하는 것이다.
 *
 * 바깥 루프는 도달 불가 영역까지 포함해 모든 노드를 돈다. 시작 노드에서만
 * 탐색하면 도달 불가 영역 안의 순환이 숨는다.
 *
 * 재귀 깊이는 단계 수가 아니라 **최장 단순 경로**에 비례한다. 100단계 기준
 * 픽스처의 실제 깊이는 100 미만이고 V8 기본 스택에 여유가 크다.
 */
export function detectCycles(graph: StepGraph): DetectedCycle[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const cycles: DetectedCycle[] = [];
  const seenSignatures = new Set<string>();

  const record = (edge: StepEdge) => {
    const start = path.indexOf(edge.to);
    if (start === -1) return;
    const cyclePath = [...path.slice(start), edge.to];

    // 같은 노드 집합의 순환을 한 번만 보고한다. 진입 지점만 다른 같은 고리를
    // 여러 건으로 세면 사용자가 몇 개를 고쳐야 하는지 알 수 없다.
    const signature = [...new Set(cyclePath)].sort().join('>');
    if (seenSignatures.has(signature)) return;
    seenSignatures.add(signature);
    cycles.push({ path: cyclePath, closingEdge: edge });
  };

  const dfs = (node: string): void => {
    visiting.add(node);
    path.push(node);

    for (const edge of graph.edges.get(node) ?? []) {
      if (visiting.has(edge.to)) {
        record(edge);
        continue;
      }
      if (!visited.has(edge.to)) dfs(edge.to);
    }

    path.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

/** 시작 노드에서 BFS. 시작 노드가 없으면 빈 집합이다. */
export function reachableStepIds(graph: StepGraph): ReadonlySet<string> {
  const seen = new Set<string>();
  if (!graph.edges.has(graph.startStepId)) return seen;

  const queue = [graph.startStepId];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const edge of graph.edges.get(node) ?? []) queue.push(edge.to);
  }
  return seen;
}

/**
 * 여기서 끝날 수 있는 단계인가.
 *
 * 그래프 용어의 out-degree 0이 아니라 **실행 의미**(§4.3.4-4·5)를 쓴다. 규칙은
 * 있지만 기본 다음이 없는 단계는 "일치 규칙이 없으면 완료"에 해당하므로 종료
 * 가능하다. out-degree 0으로 정의하면 그런 정상 문서가 오탐으로 차단된다.
 */
function canTerminate(step: GuideStep): boolean {
  return step.defaultNextStepId === undefined;
}

/** 규칙의 조건 부분. 대상은 조건이 아니다. */
function conditionKey(rule: BranchRule): string {
  return [
    rule.sourceBlockId ?? '',
    rule.operator,
    typeof rule.value,
    String(rule.value ?? ''),
  ].join('|');
}

function issue(
  code: ValidationIssue['code'],
  severity: ValidationIssue['severity'],
  path: string,
  message: string,
  stepId?: string,
): ValidationIssue {
  return {
    code,
    severity,
    stage: 'document',
    path,
    message,
    ...(stepId === undefined ? {} : { stepId }),
  };
}

function label(graph: StepGraph, stepId: string): string {
  const title = graph.titles.get(stepId);
  return title === undefined || title.trim() === '' ? stepId : `'${title}'`;
}

/**
 * 그래프 판정 전체.
 *
 * `result.exportable`이 M6 DoD 4의 "내보내기 가능 상태"다. `summarize`가 error
 * 유무로 계산하므로 severity 하나가 곧 내보내기 가능 여부다.
 *
 * severity 배정 근거:
 *   - 하네스 DoD 4가 error로 열거한 것 - 대상 누락, 순환, 시작 단계, 종료 단계 부재
 *   - DoD 5는 도달 불가만 따로 "설계된 severity"라 부르고 위 목록에서 뺐다.
 *     그래서 **warning**이다. 도달 불가 단계가 있어도 나머지 경로는 실행된다.
 *   - 조건 중복은 죽은 규칙이라 실행을 막지 않는다. warning.
 *   - 우선순위 중복은 재정렬이 분기 결과를 바꾸게 두는 상태다. INV-04의
 *     "order는 표시용"이 깨지므로 error. (직접 인용은 없다. 판단이다)
 */
export function analyzeGuideGraph(doc: GuideDocument): GraphAnalysis {
  const graph = buildStepGraph(doc);
  const issues: ValidationIssue[] = [];

  // 1. 간선 대상 존재
  for (const edge of graph.danglingEdges) {
    issues.push(
      issue(
        ISSUE_CODES.BRANCH_TARGET_NOT_FOUND,
        'error',
        edge.path,
        `${label(graph, edge.from)} 단계가 없는 단계 '${edge.to}'로 이동하려 합니다.`,
        edge.from,
      ),
    );
  }

  // 2. 순환
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    const readable = cycle.path.map((id) => label(graph, id)).join(' → ');
    issues.push(
      issue(
        ISSUE_CODES.CYCLE_DETECTED,
        'error',
        cycle.closingEdge.path,
        `단계가 순환합니다: ${readable}`,
        cycle.closingEdge.from,
      ),
    );
  }

  // 3·4. 도달 가능성. 시작 단계가 없으면 계산할 수 없다.
  //
  // `START_STEP_NOT_FOUND`를 여기서 다시 내지 않는다. 스키마가 이미 발행하므로
  // 합성 결과에 같은 이슈가 두 건 뜬다. 대신 도달·종료 검사를 건너뛴다.
  // 그러지 않으면 모든 단계에 도달 불가 경고가 쏟아져 진짜 문제가 묻힌다.
  const startExists = graph.edges.has(graph.startStepId);
  const reachable = reachableStepIds(graph);

  if (startExists) {
    doc.steps.forEach((step, index) => {
      if (reachable.has(step.id)) return;
      issues.push(
        issue(
          ISSUE_CODES.UNREACHABLE_STEP,
          'warning',
          joinPath('steps', index),
          `${label(graph, step.id)} 단계(${step.id})에 도달할 수 있는 경로가 없습니다.`,
          step.id,
        ),
      );
    });
  }

  // 5. 종료 노드. 도달할 수 없는 종료 단계는 세지 않는다.
  //    세면 완료할 수 없는 문서가 통과한다.
  const terminalStepIds = doc.steps
    .filter((step) => reachable.has(step.id) && canTerminate(step))
    .map((step) => step.id);

  // 단계가 0개인 것은 `NO_STEPS`가 말한다. 여기서 또 말하지 않는다.
  if (startExists && doc.steps.length > 0 && terminalStepIds.length === 0) {
    issues.push(
      issue(
        ISSUE_CODES.NO_TERMINAL_STEP,
        'error',
        'steps',
        '완료로 끝나는 단계가 없습니다. 어느 경로로 가도 가이드가 끝나지 않습니다.',
      ),
    );
  }

  // 6. 중복 규칙
  doc.steps.forEach((step, stepIndex) => {
    const byPriority = new Map<number, number>();
    const byCondition = new Map<string, number>();

    step.branchRules.forEach((rule, ruleIndex) => {
      const firstPriority = byPriority.get(rule.priority);
      if (firstPriority === undefined) {
        byPriority.set(rule.priority, ruleIndex);
      } else {
        issues.push(
          issue(
            ISSUE_CODES.DUPLICATE_BRANCH_PRIORITY,
            'error',
            joinPath('steps', stepIndex, 'branchRules', ruleIndex, 'priority'),
            `우선순위 ${rule.priority}가 ${label(graph, step.id)} 단계 안에서 중복됩니다. ` +
              '순서를 바꾸면 결과가 달라집니다.',
            step.id,
          ),
        );
      }

      const key = conditionKey(rule);
      const firstCondition = byCondition.get(key);
      if (firstCondition === undefined) {
        byCondition.set(key, ruleIndex);
      } else {
        issues.push(
          issue(
            ISSUE_CODES.DUPLICATE_BRANCH_CONDITION,
            'warning',
            joinPath('steps', stepIndex, 'branchRules', ruleIndex),
            `앞선 규칙과 조건이 같아 이 규칙은 실행되지 않습니다. ` +
              `(${label(graph, step.id)} 단계, 우선순위가 낮은 쪽만 평가됩니다)`,
            step.id,
          ),
        );
      }
    });
  });

  return { result: summarize(issues), cycles, reachable, terminalStepIds };
}

/** 이슈만 필요한 호출자용. */
export function validateGuideGraph(doc: GuideDocument): ValidationResult {
  return analyzeGuideGraph(doc).result;
}
