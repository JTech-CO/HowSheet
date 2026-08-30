/**
 * 검증 결과 타입과 이슈 코드.
 *
 * 기준: 기술 백서 §2.2.4가 검증을 `필드 검증`, `문서 검증`, `내보내기 검증`
 * 세 단계로 나눈다. 코드는 그 세 단계에 맞춰 묶었다.
 *
 * 어느 phase가 어떤 코드를 판정하는지 아래 표에 적어 둔다. M2는 필드 검증과
 * 그래프를 제외한 문서 검증까지 담당하고, 그래프 판정(순환·도달 가능성·분기
 * 대상·우선순위·종료 단계)은 M6이 같은 코드를 채워 넣는다. (하네스 M2 주의)
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

/** §2.2.4의 검증 단계. */
export type ValidationStage = 'field' | 'document' | 'export';

export const ISSUE_CODES = {
  // ── 필드 검증 (M2) ────────────────────────────────────────────
  /** 타입이 스키마와 다르다. */
  INVALID_TYPE: 'INVALID_TYPE',
  /** 필수 필드가 없다. */
  MISSING_FIELD: 'MISSING_FIELD',
  /** enum 범위를 벗어난 값. */
  INVALID_ENUM_VALUE: 'INVALID_ENUM_VALUE',
  /** 제목 1~120자. */
  TITLE_LENGTH: 'TITLE_LENGTH',
  /** 대상 사용자 0~200자. */
  AUDIENCE_LENGTH: 'AUDIENCE_LENGTH',
  /** 단계 제목 1~100자. */
  STEP_TITLE_LENGTH: 'STEP_TITLE_LENGTH',
  /** 본문 텍스트 블록 20,000자 상한. */
  TEXT_BLOCK_TOO_LONG: 'TEXT_BLOCK_TOO_LONG',
  /** `http:`·`https:` 외 프로토콜. */
  URL_PROTOCOL_NOT_ALLOWED: 'URL_PROTOCOL_NOT_ALLOWED',
  /** URL 형식이 아니다. */
  URL_MALFORMED: 'URL_MALFORMED',
  /** 허용하지 않는 이미지 MIME. */
  IMAGE_MIME_NOT_ALLOWED: 'IMAGE_MIME_NOT_ALLOWED',
  /** 이미지 원본 5MB 상한. */
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  /** 장식용이 아닌 이미지의 대체 텍스트가 비어 있다. */
  IMAGE_ALT_REQUIRED: 'IMAGE_ALT_REQUIRED',
  /** 식별자가 비어 있다. */
  EMPTY_ID: 'EMPTY_ID',

  // ── 문서 검증 — M2가 판정 ─────────────────────────────────────
  /** 같은 컬렉션 안에 ID가 중복된다. (M2 DoD 4) */
  DUPLICATE_ID: 'DUPLICATE_ID',
  /** 단계가 하나도 없다. */
  NO_STEPS: 'NO_STEPS',
  /** `startStepId`가 실제 단계와 일치하지 않는다. */
  START_STEP_NOT_FOUND: 'START_STEP_NOT_FOUND',
  /** 확인이 필요한 경고인데 확인 문구가 비어 있다. */
  WARNING_ACK_LABEL_REQUIRED: 'WARNING_ACK_LABEL_REQUIRED',
  /** 단계가 참조하는 오류 해결 항목이 없다. */
  TROUBLESHOOTING_REF_NOT_FOUND: 'TROUBLESHOOTING_REF_NOT_FOUND',
  /** 단계 범위 오류 해결 항목의 `stepId`가 실제 단계와 일치하지 않는다. */
  TROUBLESHOOTING_STEP_NOT_FOUND: 'TROUBLESHOOTING_STEP_NOT_FOUND',
  /** 이미지 블록이 참조하는 자산이 manifest에 없다. */
  ASSET_REF_NOT_FOUND: 'ASSET_REF_NOT_FOUND',
  /** 분기 규칙이 참조하는 블록이 같은 단계에 없다. */
  BRANCH_SOURCE_BLOCK_NOT_FOUND: 'BRANCH_SOURCE_BLOCK_NOT_FOUND',

  // ── 문서 검증 — M6이 판정 (그래프) ────────────────────────────
  /** 분기 대상 단계가 존재하지 않는다. */
  BRANCH_TARGET_NOT_FOUND: 'BRANCH_TARGET_NOT_FOUND',
  /** 한 단계 안에서 분기 우선순위가 중복된다. */
  DUPLICATE_BRANCH_PRIORITY: 'DUPLICATE_BRANCH_PRIORITY',
  /** 순환 경로가 있다. MVP는 허용하지 않는다. (INV-06) */
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  /** 시작 단계에서 도달할 수 없는 단계가 있다. */
  UNREACHABLE_STEP: 'UNREACHABLE_STEP',
  /** 종료 가능한 단계가 하나도 없다. */
  NO_TERMINAL_STEP: 'NO_TERMINAL_STEP',

  // ── 스키마 버전 ───────────────────────────────────────────────
  /** 현재 빌드보다 높은 major 스키마. 편집 상태로 강등하지 않는다. (M2 DoD 6) */
  UNSUPPORTED_SCHEMA_MAJOR: 'UNSUPPORTED_SCHEMA_MAJOR',
  /** `major.minor` 형식이 아니다. */
  MALFORMED_SCHEMA_VERSION: 'MALFORMED_SCHEMA_VERSION',
  /** 현재보다 낮은 버전이라 마이그레이션이 필요하다. */
  MIGRATION_REQUIRED: 'MIGRATION_REQUIRED',

  // ── 내보내기 검증 — M9가 판정 ─────────────────────────────────
  /** 자산을 Data URL로 변환할 수 없다. */
  ASSET_NOT_INLINABLE: 'ASSET_NOT_INLINABLE',
  /** 예상 크기 20MB 초과. */
  EXPORT_SIZE_WARNING: 'EXPORT_SIZE_WARNING',
  /** 예상 크기 30MB 초과. 기본 설정에서 차단한다. */
  EXPORT_SIZE_BLOCKED: 'EXPORT_SIZE_BLOCKED',
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

/**
 * 검증 이슈 하나.
 *
 * `path`는 사용자가 해당 필드로 이동할 수 있도록 문서 루트 기준 경로를 쓴다.
 * 예: `meta.title`, `steps[0].blocks[1].url`, `warnings[2].acknowledgementLabel`.
 * (FR-019 검증 요약 패널에서 클릭 시 이동에 쓰인다)
 */
export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  stage: ValidationStage;
  /** 문서 루트 기준 필드 경로. 문서 전체에 걸린 이슈는 빈 문자열. */
  path: string;
  message: string;
  /** 단계·블록 단위 이슈일 때 해당 ID. 화면 이동과 메시지 구성에 쓴다. */
  stepId?: string;
  blockId?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  /** `error`가 하나도 없으면 true. */
  valid: boolean;
  /**
   * 내보내기 가능 여부. `error`가 1건이라도 있으면 false다. (INV-05)
   * M2는 그래프 판정을 하지 않으므로 이 값만으로 내보내기를 허용해서는 안 된다.
   * 최종 판정은 M9의 export validator가 그래프 검증 결과까지 합쳐서 내린다.
   */
  exportable: boolean;
}

export function isError(issue: ValidationIssue): boolean {
  return issue.severity === 'error';
}

export function summarize(issues: ValidationIssue[]): ValidationResult {
  const hasError = issues.some(isError);
  return { issues, valid: !hasError, exportable: !hasError };
}

/** 배열 인덱스를 포함한 경로를 만든다. `steps[0].blocks[1].url` */
export function joinPath(...segments: Array<string | number>): string {
  return segments.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc === '' ? segment : `${acc}.${segment}`;
  }, '');
}
