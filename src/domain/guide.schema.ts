/**
 * `GuideDocument`의 런타임 검증.
 *
 * 기준: 기술 백서 §2.2.4(필드·문서 검증), §2.3(도메인 타입), §2.3.5(버전 정책).
 *
 * 구조는 Zod가 판정하고, 업무 규칙은 명시적 refinement가 우리 이슈 코드와 함께
 * 판정한다. 코드 없는 익명 실패를 만들지 않기 위해서다. (M2 DoD 3)
 *
 * 그래프 판정(순환·도달 가능성·분기 대상·우선순위 중복·종료 단계)은 M6의
 * `features/branching/graph-validator.ts`가 맡는다. 이 파일은 잘못된 참조를
 * **보고만 하고 고치지 않는다**. (하네스 M2 주의)
 */

import { z } from 'zod';

import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_URL_PROTOCOLS,
  FIELD_LIMITS,
  SCHEMA_VERSION,
  isAllowedUrl,
  type GuideDocument,
} from './guide.types.ts';
import {
  ISSUE_CODES,
  joinPath,
  summarize,
  type IssueCode,
  type ValidationIssue,
  type ValidationResult,
  type ValidationStage,
} from './validation.types.ts';

// ────────────────────────────────────────────────────── URL 판정 (§2.2.4)

// 판정 함수는 `guide.types.ts`가 소유한다. 여기서 다시 내보내 기존 호출부와
// 스키마가 같은 함수를 쓰게 한다.
export { isAllowedUrl };

function isParsableUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────── refinement 도우미

type Ctx = z.RefinementCtx;

/** 우리 이슈 코드를 실어 custom 이슈를 만든다. */
function addIssue(
  ctx: Ctx,
  code: IssueCode,
  message: string,
  path: Array<string | number> = [],
): void {
  ctx.addIssue({ code: 'custom', message, path, params: { issueCode: code } });
}

function checkUrl(ctx: Ctx, value: string, path: Array<string | number>): void {
  if (!isParsableUrl(value)) {
    addIssue(ctx, ISSUE_CODES.URL_MALFORMED, 'URL 형식이 아닙니다.', path);
    return;
  }
  if (!isAllowedUrl(value)) {
    addIssue(
      ctx,
      ISSUE_CODES.URL_PROTOCOL_NOT_ALLOWED,
      `링크는 ${ALLOWED_URL_PROTOCOLS.join(', ')} 프로토콜만 허용합니다.`,
      path,
    );
  }
}

function checkId(ctx: Ctx, value: string, path: Array<string | number>): void {
  if (value.trim() === '') {
    addIssue(ctx, ISSUE_CODES.EMPTY_ID, '식별자는 비어 있을 수 없습니다.', path);
  }
}

// ────────────────────────────────────────────────────── 기본 스키마

const identifier = z.string();
const isoDateTime = z.string();

export const safeLinkSchema = z
  .object({
    label: z.string(),
    url: z.string(),
  })
  .superRefine((link, ctx) => {
    checkUrl(ctx, link.url, ['url']);
  });

const baseBlockShape = {
  id: identifier,
  order: z.number().int(),
};

export const textBlockSchema = z
  .object({ ...baseBlockShape, type: z.literal('text'), markdown: z.string() })
  .superRefine((block, ctx) => {
    checkId(ctx, block.id, ['id']);
    if (block.markdown.length > FIELD_LIMITS.textBlockMax) {
      addIssue(
        ctx,
        ISSUE_CODES.TEXT_BLOCK_TOO_LONG,
        `본문 블록은 ${FIELD_LIMITS.textBlockMax}자를 넘을 수 없습니다.`,
        ['markdown'],
      );
    }
  });

export const codeBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('code'),
    language: z.string().optional(),
    code: z.string(),
    copyLabel: z.string().optional(),
  })
  .superRefine((block, ctx) => checkId(ctx, block.id, ['id']));

export const linkBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('link'),
    label: z.string(),
    url: z.string(),
    description: z.string().optional(),
  })
  .superRefine((block, ctx) => {
    checkId(ctx, block.id, ['id']);
    checkUrl(ctx, block.url, ['url']);
  });

export const imageBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('image'),
    assetId: identifier,
    alt: z.string(),
    caption: z.string().optional(),
  })
  .superRefine((block, ctx) => {
    checkId(ctx, block.id, ['id']);
    checkId(ctx, block.assetId, ['assetId']);
    // 장식용 이미지는 alt를 빈 문자열로 명시한다. 공백만 채운 값은 누락으로 본다.
    if (block.alt !== '' && block.alt.trim() === '') {
      addIssue(ctx, ISSUE_CODES.IMAGE_ALT_REQUIRED, '대체 텍스트가 비어 있습니다.', ['alt']);
    }
  });

export const checklistBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('checklist'),
    items: z.array(z.object({ id: identifier, label: z.string(), required: z.boolean() })),
  })
  .superRefine((block, ctx) => {
    checkId(ctx, block.id, ['id']);
    block.items.forEach((item, index) => checkId(ctx, item.id, ['items', index, 'id']));
    reportDuplicateIds(
      ctx,
      block.items.map((item) => item.id),
      ['items'],
      '체크리스트 항목',
    );
  });

export const decisionBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal('decision'),
    question: z.string(),
    options: z.array(
      z.object({ id: identifier, label: z.string(), description: z.string().optional() }),
    ),
    required: z.boolean(),
  })
  .superRefine((block, ctx) => {
    checkId(ctx, block.id, ['id']);
    block.options.forEach((option, index) => checkId(ctx, option.id, ['options', index, 'id']));
    reportDuplicateIds(
      ctx,
      block.options.map((option) => option.id),
      ['options'],
      '선택지',
    );
  });

export const dividerBlockSchema = z
  .object({ ...baseBlockShape, type: z.literal('divider') })
  .superRefine((block, ctx) => checkId(ctx, block.id, ['id']));

export const contentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  codeBlockSchema,
  linkBlockSchema,
  imageBlockSchema,
  checklistBlockSchema,
  decisionBlockSchema,
  dividerBlockSchema,
]);

export const branchRuleSchema = z
  .object({
    id: identifier,
    sourceBlockId: identifier.optional(),
    operator: z.enum(['equals', 'notEquals', 'checked', 'notChecked']),
    value: z.union([z.string(), z.boolean()]).optional(),
    targetStepId: identifier,
    priority: z.number().int(),
  })
  .superRefine((rule, ctx) => {
    checkId(ctx, rule.id, ['id']);
    checkId(ctx, rule.targetStepId, ['targetStepId']);
  });

export const guideStepSchema = z
  .object({
    id: identifier,
    order: z.number().int(),
    title: z.string(),
    summary: z.string().optional(),
    blocks: z.array(contentBlockSchema),
    successCriteria: z.string().optional(),
    completionMode: z.enum(['checkbox', 'choice', 'automatic']),
    branchRules: z.array(branchRuleSchema),
    defaultNextStepId: identifier.optional(),
    troubleshootingIds: z.array(identifier),
    optional: z.boolean(),
  })
  .superRefine((step, ctx) => {
    checkId(ctx, step.id, ['id']);
    if (step.defaultNextStepId !== undefined) {
      checkId(ctx, step.defaultNextStepId, ['defaultNextStepId']);
    }
    if (
      step.title.length < FIELD_LIMITS.stepTitleMin ||
      step.title.length > FIELD_LIMITS.stepTitleMax
    ) {
      addIssue(
        ctx,
        ISSUE_CODES.STEP_TITLE_LENGTH,
        `단계 제목은 ${FIELD_LIMITS.stepTitleMin}~${FIELD_LIMITS.stepTitleMax}자입니다.`,
        ['title'],
      );
    }
    reportDuplicateIds(
      ctx,
      step.blocks.map((block) => block.id),
      ['blocks'],
      '콘텐츠 블록',
    );
    reportDuplicateIds(
      ctx,
      step.branchRules.map((rule) => rule.id),
      ['branchRules'],
      '분기 규칙',
    );
  });

export const preparationItemSchema = z
  .object({
    id: identifier,
    label: z.string(),
    detail: z.string().optional(),
    required: z.boolean(),
    link: safeLinkSchema.optional(),
    order: z.number().int(),
  })
  .superRefine((item, ctx) => checkId(ctx, item.id, ['id']));

export const warningBlockSchema = z
  .object({
    id: identifier,
    severity: z.enum(['info', 'warning', 'danger']),
    title: z.string(),
    body: z.string(),
    requiresAcknowledgement: z.boolean(),
    acknowledgementLabel: z.string().optional(),
    order: z.number().int(),
  })
  .superRefine((warning, ctx) => {
    checkId(ctx, warning.id, ['id']);
    // §2.2.4 - 필수 경고에 확인 문구가 비어 있으면 오류다.
    if (
      warning.requiresAcknowledgement &&
      (warning.acknowledgementLabel === undefined || warning.acknowledgementLabel.trim() === '')
    ) {
      addIssue(
        ctx,
        ISSUE_CODES.WARNING_ACK_LABEL_REQUIRED,
        '확인이 필요한 경고에는 확인 문구가 있어야 합니다.',
        ['acknowledgementLabel'],
      );
    }
  });

export const troubleshootingItemSchema = z
  .object({
    id: identifier,
    scope: z.enum(['global', 'step']),
    stepId: identifier.optional(),
    symptom: z.string(),
    likelyCause: z.string().optional(),
    resolution: z.array(contentBlockSchema),
    order: z.number().int(),
  })
  .superRefine((item, ctx) => {
    checkId(ctx, item.id, ['id']);
    reportDuplicateIds(
      ctx,
      item.resolution.map((block) => block.id),
      ['resolution'],
      '오류 해결 블록',
    );
  });

export const completionConfigSchema = z.object({
  title: z.string(),
  message: z.string(),
  showSummary: z.boolean(),
  primaryAction: safeLinkSchema.optional(),
  secondaryAction: safeLinkSchema.optional(),
});

export const assetManifestItemSchema = z
  .object({
    id: identifier,
    fileName: z.string(),
    mimeType: z.string(),
    byteSize: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    checksum: z.string(),
  })
  .superRefine((asset, ctx) => {
    checkId(ctx, asset.id, ['id']);
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(asset.mimeType)) {
      addIssue(
        ctx,
        ISSUE_CODES.IMAGE_MIME_NOT_ALLOWED,
        `허용하지 않는 이미지 형식입니다. 허용: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
        ['mimeType'],
      );
    }
    if (asset.byteSize > FIELD_LIMITS.imageBytesMax) {
      addIssue(
        ctx,
        ISSUE_CODES.IMAGE_TOO_LARGE,
        `이미지 원본은 ${FIELD_LIMITS.imageBytesMax / (1024 * 1024)}MB를 넘을 수 없습니다.`,
        ['byteSize'],
      );
    }
  });

export const guideMetaSchema = z
  .object({
    title: z.string(),
    summary: z.string().optional(),
    audience: z.string().optional(),
    author: z.string().optional(),
    language: z.string(),
    estimatedMinutes: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
  })
  .superRefine((meta, ctx) => {
    if (meta.title.length < FIELD_LIMITS.titleMin || meta.title.length > FIELD_LIMITS.titleMax) {
      addIssue(
        ctx,
        ISSUE_CODES.TITLE_LENGTH,
        `제목은 ${FIELD_LIMITS.titleMin}~${FIELD_LIMITS.titleMax}자입니다.`,
        ['title'],
      );
    }
    if (meta.audience !== undefined && meta.audience.length > FIELD_LIMITS.audienceMax) {
      addIssue(
        ctx,
        ISSUE_CODES.AUDIENCE_LENGTH,
        `대상 사용자는 ${FIELD_LIMITS.audienceMax}자를 넘을 수 없습니다.`,
        ['audience'],
      );
    }
  });

export const guideSettingsSchema = z.object({
  defaultTheme: z.enum(['system', 'light', 'dark']),
  allowThemeSwitch: z.boolean(),
  allowProgressReset: z.boolean(),
  showOverallOutline: z.boolean(),
  printMode: z.enum(['active-path', 'all-steps']),
});

/** 같은 컬렉션 안의 중복 ID를 보고한다. (M2 DoD 4) */
function reportDuplicateIds(
  ctx: Ctx,
  ids: string[],
  basePath: Array<string | number>,
  label: string,
): void {
  const seen = new Map<string, number>();
  ids.forEach((id, index) => {
    const first = seen.get(id);
    if (first === undefined) {
      seen.set(id, index);
      return;
    }
    addIssue(ctx, ISSUE_CODES.DUPLICATE_ID, `${label} ID '${id}'가 중복됩니다.`, [
      ...basePath,
      index,
      'id',
    ]);
  });
}

export const guideDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: identifier,
    revision: z.number().int().nonnegative(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    meta: guideMetaSchema,
    preparation: z.array(preparationItemSchema),
    warnings: z.array(warningBlockSchema),
    steps: z.array(guideStepSchema),
    startStepId: identifier,
    troubleshooting: z.array(troubleshootingItemSchema),
    completion: completionConfigSchema,
    assets: z.array(assetManifestItemSchema),
    settings: guideSettingsSchema,
  })
  .superRefine((doc, ctx) => {
    checkId(ctx, doc.id, ['id']);

    // 컬렉션별 중복 ID
    reportDuplicateIds(
      ctx,
      doc.steps.map((step) => step.id),
      ['steps'],
      '단계',
    );
    reportDuplicateIds(
      ctx,
      doc.preparation.map((item) => item.id),
      ['preparation'],
      '준비물',
    );
    reportDuplicateIds(
      ctx,
      doc.warnings.map((warning) => warning.id),
      ['warnings'],
      '경고',
    );
    reportDuplicateIds(
      ctx,
      doc.troubleshooting.map((item) => item.id),
      ['troubleshooting'],
      '오류 해결',
    );
    reportDuplicateIds(
      ctx,
      doc.assets.map((asset) => asset.id),
      ['assets'],
      '자산',
    );

    // 단계가 1개 이상이어야 한다.
    if (doc.steps.length === 0) {
      addIssue(ctx, ISSUE_CODES.NO_STEPS, '단계가 최소 하나 필요합니다.', ['steps']);
      return;
    }

    const stepIds = new Set(doc.steps.map((step) => step.id));
    const troubleshootingIds = new Set(doc.troubleshooting.map((item) => item.id));
    const assetIds = new Set(doc.assets.map((asset) => asset.id));

    // 시작 단계 ID가 실제 단계와 일치해야 한다.
    if (!stepIds.has(doc.startStepId)) {
      addIssue(
        ctx,
        ISSUE_CODES.START_STEP_NOT_FOUND,
        `시작 단계 '${doc.startStepId}'를 찾을 수 없습니다.`,
        ['startStepId'],
      );
    }

    doc.steps.forEach((step, stepIndex) => {
      step.troubleshootingIds.forEach((id, index) => {
        if (!troubleshootingIds.has(id)) {
          addIssue(
            ctx,
            ISSUE_CODES.TROUBLESHOOTING_REF_NOT_FOUND,
            `오류 해결 항목 '${id}'를 찾을 수 없습니다.`,
            ['steps', stepIndex, 'troubleshootingIds', index],
          );
        }
      });

      const blockIds = new Set(step.blocks.map((block) => block.id));

      step.blocks.forEach((block, blockIndex) => {
        if (block.type === 'image' && !assetIds.has(block.assetId)) {
          addIssue(
            ctx,
            ISSUE_CODES.ASSET_REF_NOT_FOUND,
            `자산 '${block.assetId}'를 manifest에서 찾을 수 없습니다.`,
            ['steps', stepIndex, 'blocks', blockIndex, 'assetId'],
          );
        }
      });

      step.branchRules.forEach((rule, ruleIndex) => {
        if (rule.sourceBlockId !== undefined && !blockIds.has(rule.sourceBlockId)) {
          addIssue(
            ctx,
            ISSUE_CODES.BRANCH_SOURCE_BLOCK_NOT_FOUND,
            `분기 기준 블록 '${rule.sourceBlockId}'가 같은 단계에 없습니다.`,
            ['steps', stepIndex, 'branchRules', ruleIndex, 'sourceBlockId'],
          );
        }
      });
    });

    doc.troubleshooting.forEach((item, index) => {
      if (item.scope === 'step' && (item.stepId === undefined || !stepIds.has(item.stepId))) {
        addIssue(
          ctx,
          ISSUE_CODES.TROUBLESHOOTING_STEP_NOT_FOUND,
          `단계 범위 오류 해결 항목의 단계 '${item.stepId ?? ''}'를 찾을 수 없습니다.`,
          ['troubleshooting', index, 'stepId'],
        );
      }
    });
  });

/**
 * 두 타입이 **정확히** 같은지 본다.
 *
 * 단순 `extends`는 할당 가능성이라 여분 필드를 통과시킨다. 스키마에만 필드가
 * 생긴 경우를 잡으려면 이 형태가 필요하다.
 */
type Exact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : never;

/**
 * INV-03 - 타입과 스키마가 어긋나면 여기서 컴파일이 깨진다.
 *
 * 어느 쪽에 필드가 생기거나 사라져도 `Exact`가 `never`로 좁혀지고
 * `true as never`가 오류가 된다. 이 장치가 없으면 `as GuideDocument` 같은
 * 단언이 드리프트를 가려 버린다. (하네스 M2 주의, INV-03)
 */
const schemaMatchesDomainType: Exact<z.infer<typeof guideDocumentSchema>, GuideDocument> = true;
void schemaMatchesDomainType;

// ────────────────────────────────────────────────────── 이슈 매핑

function pathOf(zodPath: ReadonlyArray<PropertyKey>): string {
  return joinPath(...zodPath.map((segment) => (typeof segment === 'symbol' ? '?' : segment)));
}

function stageFor(code: IssueCode): ValidationStage {
  switch (code) {
    case ISSUE_CODES.DUPLICATE_ID:
    case ISSUE_CODES.NO_STEPS:
    case ISSUE_CODES.START_STEP_NOT_FOUND:
    case ISSUE_CODES.WARNING_ACK_LABEL_REQUIRED:
    case ISSUE_CODES.TROUBLESHOOTING_REF_NOT_FOUND:
    case ISSUE_CODES.TROUBLESHOOTING_STEP_NOT_FOUND:
    case ISSUE_CODES.ASSET_REF_NOT_FOUND:
    case ISSUE_CODES.BRANCH_SOURCE_BLOCK_NOT_FOUND:
      return 'document';
    default:
      return 'field';
  }
}

/**
 * 이슈 경로를 따라 원본에서 값을 꺼낸다. 없으면 `undefined`.
 *
 * Zod 4의 `invalid_type` 이슈에는 `input`도 `received`도 실리지 않는다.
 * 따라서 '필드 누락'과 '타입 불일치'는 원본을 직접 조회해서만 구별할 수 있다.
 */
function valueAtPath(raw: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let cursor: unknown = raw;
  for (const segment of path) {
    if (cursor === null || (typeof cursor !== 'object' && typeof cursor !== 'function')) {
      return undefined;
    }
    cursor = (cursor as Record<PropertyKey, unknown>)[segment];
  }
  return cursor;
}

/** Zod 내장 이슈를 우리 코드로 옮긴다. custom 이슈는 실어 둔 코드를 그대로 쓴다. */
export function toValidationIssue(issue: z.core.$ZodIssue, raw?: unknown): ValidationIssue {
  const carried = (issue as { params?: { issueCode?: IssueCode } }).params?.issueCode;

  let code: IssueCode;
  if (carried !== undefined) {
    code = carried;
  } else {
    switch (issue.code) {
      case 'invalid_type':
        code =
          valueAtPath(raw, issue.path) === undefined
            ? ISSUE_CODES.MISSING_FIELD
            : ISSUE_CODES.INVALID_TYPE;
        break;
      case 'invalid_value':
      case 'invalid_union':
        code = ISSUE_CODES.INVALID_ENUM_VALUE;
        break;
      default:
        code = ISSUE_CODES.INVALID_TYPE;
        break;
    }
  }

  return {
    code,
    severity: 'error',
    stage: stageFor(code),
    path: pathOf(issue.path),
    message: issue.message,
  };
}

// ────────────────────────────────────────────────────── 버전 판정 (§2.3.5)

export interface ParsedSchemaVersion {
  major: number;
  minor: number;
}

export function parseSchemaVersion(value: unknown): ParsedSchemaVersion | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

export const CURRENT_SCHEMA_VERSION = parseSchemaVersion(SCHEMA_VERSION) as ParsedSchemaVersion;

export type SchemaVersionVerdict =
  | { status: 'supported'; version: ParsedSchemaVersion }
  /** 같은 major의 더 높은 minor. minor는 하위 호환 추가라 읽을 수 있다. */
  | { status: 'newerMinor'; version: ParsedSchemaVersion; issue: ValidationIssue }
  /** 낮은 버전. 복사본을 만들어 마이그레이션한 뒤 편집한다. */
  | { status: 'migrationRequired'; version: ParsedSchemaVersion; issue: ValidationIssue }
  /** 높은 major. 편집 가능한 문서로 자동 변환하지 않는다. (M2 DoD 6) */
  | { status: 'unsupportedMajor'; version: ParsedSchemaVersion; issue: ValidationIssue }
  | { status: 'malformed'; issue: ValidationIssue };

/**
 * 전체 파싱 **이전에** 스키마 버전을 판정한다.
 * 높은 major 문서를 편집 상태로 조용히 강등시키지 않기 위해 순서가 중요하다.
 */
export function assessSchemaVersion(raw: unknown): SchemaVersionVerdict {
  const rawVersion =
    typeof raw === 'object' && raw !== null
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined;

  const version = parseSchemaVersion(rawVersion);
  if (version === null) {
    return {
      status: 'malformed',
      issue: {
        code: ISSUE_CODES.MALFORMED_SCHEMA_VERSION,
        severity: 'error',
        stage: 'document',
        path: 'schemaVersion',
        message: 'schemaVersion이 major.minor 형식이 아닙니다.',
      },
    };
  }

  if (version.major > CURRENT_SCHEMA_VERSION.major) {
    return {
      status: 'unsupportedMajor',
      version,
      issue: {
        code: ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR,
        severity: 'error',
        stage: 'document',
        path: 'schemaVersion',
        message: `현재 버전(${SCHEMA_VERSION})보다 높은 스키마입니다. 편집할 수 없습니다.`,
      },
    };
  }

  if (
    version.major < CURRENT_SCHEMA_VERSION.major ||
    version.minor < CURRENT_SCHEMA_VERSION.minor
  ) {
    return {
      status: 'migrationRequired',
      version,
      issue: {
        code: ISSUE_CODES.MIGRATION_REQUIRED,
        severity: 'info',
        stage: 'document',
        path: 'schemaVersion',
        message: `${version.major}.${version.minor} 문서입니다. 복사본을 만들어 마이그레이션합니다.`,
      },
    };
  }

  if (version.minor > CURRENT_SCHEMA_VERSION.minor) {
    return {
      status: 'newerMinor',
      version,
      issue: {
        code: ISSUE_CODES.MIGRATION_REQUIRED,
        severity: 'warning',
        stage: 'document',
        path: 'schemaVersion',
        message: `${version.major}.${version.minor} 문서입니다. 이 빌드가 모르는 필드는 무시됩니다.`,
      },
    };
  }

  return { status: 'supported', version };
}

// ────────────────────────────────────────────────────── 마이그레이션 인터페이스

/**
 * 스키마 마이그레이션 한 단계. 구현 모듈은 M8의
 * `features/import-json/migrations/`에 둔다. domain은 계약만 정의한다.
 */
export interface GuideMigration {
  readonly from: string;
  readonly to: string;
  /** 원본을 변경하지 않고 새 객체를 돌려준다. (§2.3.5, INV-08) */
  migrate(doc: unknown): unknown;
}

/**
 * `from`에서 현재 버전까지의 마이그레이션 경로를 만든다.
 * 이어지는 단계가 없으면 null을 돌려주고, 호출자가 중단을 판단한다.
 */
export function planMigration(
  from: string,
  registry: readonly GuideMigration[],
): GuideMigration[] | null {
  const plan: GuideMigration[] = [];
  const visited = new Set<string>([from]);
  let cursor = from;

  while (cursor !== SCHEMA_VERSION) {
    const next = registry.find((migration) => migration.from === cursor);
    if (next === undefined) return null;
    if (visited.has(next.to)) return null;
    visited.add(next.to);
    plan.push(next);
    cursor = next.to;
  }

  return plan;
}

// ────────────────────────────────────────────────────── 공개 API

export interface ParseSuccess {
  ok: true;
  document: GuideDocument;
  result: ValidationResult;
}

export interface ParseFailure {
  ok: false;
  document: null;
  result: ValidationResult;
  verdict: SchemaVersionVerdict;
}

export type ParseOutcome = ParseSuccess | ParseFailure;

/**
 * 버전 판정 → 구조·필드·문서 검증 순서로 진행한다.
 *
 * 실패해도 예외를 던지지 않는다. 호출자가 이슈 목록을 그대로 화면에 옮길 수
 * 있어야 하고, 가져오기 실패가 기존 문서를 건드리면 안 되기 때문이다. (INV-08)
 */
export function parseGuideDocument(raw: unknown): ParseOutcome {
  const verdict = assessSchemaVersion(raw);

  if (verdict.status === 'malformed' || verdict.status === 'unsupportedMajor') {
    return { ok: false, document: null, result: summarize([verdict.issue]), verdict };
  }
  if (verdict.status === 'migrationRequired') {
    return { ok: false, document: null, result: summarize([verdict.issue]), verdict };
  }

  const parsed = guideDocumentSchema.safeParse(raw);
  const versionIssues = verdict.status === 'newerMinor' ? [verdict.issue] : [];

  if (!parsed.success) {
    const issues = [
      ...versionIssues,
      ...parsed.error.issues.map((issue) => toValidationIssue(issue, raw)),
    ];
    return { ok: false, document: null, result: summarize(issues), verdict };
  }

  return {
    ok: true,
    document: parsed.data,
    result: summarize(versionIssues),
  };
}

/** 이미 `GuideDocument` 모양인 값을 다시 검증한다. 편집 중 검사에 쓴다. */
export function validateGuideDocument(doc: GuideDocument): ValidationResult {
  const parsed = guideDocumentSchema.safeParse(doc);
  return summarize(
    parsed.success ? [] : parsed.error.issues.map((issue) => toValidationIssue(issue, doc)),
  );
}
