/**
 * 검증 결과 패널.
 *
 * 기준: 디자인 백서 §4.3.8(Validation Panel), FR-019.
 * 하네스 M6 할 일 6, DoD 4.
 *
 * 디자인 §4.3.8이 정한 것.
 *   - 그룹: 오류, 경고, 개선 제안
 *   - 각 항목에 필드 경로와 짧은 해결 문구
 *   - 클릭 시 해당 필드로 이동
 *   - 오류 0건이면 단순 성공 메시지와 내보내기 준비 상태
 *   - 초록색 대형 배너 남발 대신 **작은 상태 요약**
 *
 * 해결 문구는 `Record<IssueCode, string>`이라 코드를 추가하면 여기서 컴파일이
 * 깨진다. "이슈는 늘었는데 안내가 없는" 상태를 만들지 않는다.
 */

import {
  ISSUE_CODES,
  type IssueCode,
  type IssueSeverity,
  type ValidationIssue,
  type ValidationResult,
} from '../../../domain/validation.types.ts';
import styles from './ValidationPanel.module.css';

/** 디자인 §4.3.8 "짧은 해결 문구". 무엇을 하라는 한 문장이다. */
export const RESOLUTION_HINTS: Record<IssueCode, string> = {
  INVALID_TYPE: '값의 형식을 확인합니다.',
  MISSING_FIELD: '필수 항목을 채웁니다.',
  INVALID_ENUM_VALUE: '목록에 있는 값 중에서 고릅니다.',
  TITLE_LENGTH: '제목을 1~120자로 씁니다.',
  AUDIENCE_LENGTH: '대상 사용자를 200자 이내로 줄입니다.',
  STEP_TITLE_LENGTH: '단계 제목을 1~100자로 씁니다.',
  TEXT_BLOCK_TOO_LONG: '본문을 나누거나 줄입니다.',
  URL_PROTOCOL_NOT_ALLOWED: 'http 또는 https 주소로 바꿉니다.',
  URL_MALFORMED: '주소 형식을 확인합니다.',
  IMAGE_MIME_NOT_ALLOWED: 'PNG·JPEG·WebP·GIF로 다시 넣습니다.',
  IMAGE_TOO_LARGE: '5MB 이하로 줄여 다시 넣습니다.',
  IMAGE_ALT_REQUIRED: '대체 텍스트를 쓰거나 장식용으로 표시합니다.',
  IMAGE_PROCESSING_FAILED: '다른 이미지로 다시 시도합니다.',
  IMAGE_ANIMATION_NOT_OPTIMIZED: '용량이 부담되면 정지 이미지로 바꿉니다.',
  EMPTY_ID: '항목을 다시 만듭니다.',
  DUPLICATE_ID: '중복된 항목 중 하나를 지웁니다.',
  NO_STEPS: '단계를 하나 이상 추가합니다.',
  START_STEP_NOT_FOUND: '시작 단계를 다시 지정합니다.',
  WARNING_ACK_LABEL_REQUIRED: '확인 문구를 씁니다.',
  TROUBLESHOOTING_REF_NOT_FOUND: '없는 오류 해결 항목 참조를 지웁니다.',
  TROUBLESHOOTING_STEP_NOT_FOUND: '오류 해결 항목의 대상 단계를 다시 고릅니다.',
  ASSET_REF_NOT_FOUND: '이미지를 다시 넣습니다.',
  BRANCH_SOURCE_BLOCK_NOT_FOUND: '분기 기준 블록을 다시 고릅니다.',
  BRANCH_TARGET_NOT_FOUND: '이동할 단계를 다시 고릅니다.',
  DUPLICATE_BRANCH_PRIORITY: '규칙 순서를 바꿔 우선순위를 다시 매깁니다.',
  DUPLICATE_BRANCH_CONDITION: '조건을 다르게 하거나 뒤 규칙을 지웁니다.',
  CYCLE_DETECTED: '순환을 만드는 이동 대상을 바꿉니다.',
  UNREACHABLE_STEP: '이 단계로 오는 경로를 만들거나 단계를 지웁니다.',
  NO_TERMINAL_STEP: '어느 단계의 그 외의 경우를 완료 화면으로 둡니다.',
  UNSUPPORTED_SCHEMA_MAJOR: '최신 버전에서 엽니다.',
  MALFORMED_SCHEMA_VERSION: '파일이 손상됐습니다. 다른 사본을 씁니다.',
  MIGRATION_REQUIRED: '가져오기로 다시 엽니다.',
  ASSET_NOT_INLINABLE: '이미지를 다시 넣습니다.',
  EXPORT_SIZE_WARNING: '이미지를 줄이면 파일이 작아집니다.',
  EXPORT_SIZE_BLOCKED: '이미지를 줄이거나 나눠 내보냅니다.',
};

const GROUPS: { severity: IssueSeverity; title: string }[] = [
  { severity: 'error', title: '오류' },
  { severity: 'warning', title: '경고' },
  { severity: 'info', title: '개선 제안' },
];

export interface ValidationPanelProps {
  /** 문서 검증과 그래프 검증을 합친 결과. */
  result: ValidationResult;
  onSelectIssue?: (issue: ValidationIssue) => void;
}

export function ValidationPanel({ result, onSelectIssue }: ValidationPanelProps) {
  const errors = result.issues.filter((issue) => issue.severity === 'error');

  return (
    <section className={styles.panel} data-testid="validation-panel" aria-label="검증 결과">
      {/* 초록색 대형 배너를 쓰지 않는다. 작은 상태 요약이다. (디자인 §4.3.8) */}
      <p
        className={styles.status}
        data-testid="validation-status"
        data-exportable={result.exportable}
      >
        {errors.length === 0
          ? '오류 없음. 내보낼 수 있습니다.'
          : `오류 ${errors.length}건. 고치기 전에는 내보낼 수 없습니다.`}
      </p>

      {GROUPS.map(({ severity, title }) => {
        const group = result.issues.filter((issue) => issue.severity === severity);
        if (group.length === 0) return null;

        return (
          <div key={severity} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {title} {group.length}건
            </h3>
            <ul className={styles.issues} role="list">
              {group.map((issue) => (
                <li
                  key={`${issue.code}:${issue.path}`}
                  className={styles.issue}
                  data-severity={severity}
                  data-testid="validation-issue"
                >
                  {onSelectIssue === undefined ? (
                    <IssueBody issue={issue} />
                  ) : (
                    <button
                      type="button"
                      className={[styles.link, 'focus-ring'].join(' ')}
                      data-testid="validation-issue-link"
                      onClick={() => onSelectIssue(issue)}
                    >
                      <IssueBody issue={issue} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function IssueBody({ issue }: { issue: ValidationIssue }) {
  return (
    <>
      <span className={styles.message}>{issue.message}</span>
      <span className={styles.hint}>{RESOLUTION_HINTS[issue.code]}</span>
      {issue.path === '' ? null : (
        <code className={styles.path} data-testid="validation-issue-path">
          {issue.path}
        </code>
      )}
    </>
  );
}

/** 이슈가 가리키는 편집 화면 위치. `path`의 첫 마디로 섹션을 가른다. (FR-019) */
export function sectionForIssue(
  issue: ValidationIssue,
): 'meta' | 'preparation' | 'warnings' | 'step' {
  if (issue.stepId !== undefined) return 'step';
  if (issue.path.startsWith('preparation')) return 'preparation';
  if (issue.path.startsWith('warnings')) return 'warnings';
  if (issue.path.startsWith('steps')) return 'step';
  return 'meta';
}

/** 이슈 코드가 그래프 판정인가. 패널이 M6 이슈를 따로 셀 때 쓴다. */
export function isGraphIssue(code: IssueCode): boolean {
  return (
    code === ISSUE_CODES.BRANCH_TARGET_NOT_FOUND ||
    code === ISSUE_CODES.DUPLICATE_BRANCH_PRIORITY ||
    code === ISSUE_CODES.DUPLICATE_BRANCH_CONDITION ||
    code === ISSUE_CODES.CYCLE_DETECTED ||
    code === ISSUE_CODES.UNREACHABLE_STEP ||
    code === ISSUE_CODES.NO_TERMINAL_STEP
  );
}
