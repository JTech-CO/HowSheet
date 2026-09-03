/**
 * HowSheet JSON 가져오기.
 *
 * 기준: 기술 백서 FR-012, §2.3.5, §4.6. 하네스 M8 할 일 1·2·4·5, DoD 3·5·6.
 *
 * 순수 함수다. 저장소를 모르고 아무것도 쓰지 않는다. 파일 텍스트를 받아
 * "무엇을 저장하면 되는지"와 "무엇이 잘못됐는지"만 돌려준다. 실제 쓰기는
 * 호출자가 `RecoveryRepository.withSnapshot` 안에서 한다 - 그래야 실패가
 * 기존 레코드를 건드리지 않는다. (DoD 4, INV-08)
 *
 * ## 던지지 않는다
 *
 * 어떤 입력에도 예외를 올리지 않는다. 손상된 파일은 **정상적인 결과**이지
 * 프로그램 오류가 아니다. 호출자가 이슈 목록을 그대로 화면에 옮길 수 있어야
 * 한다. (§4.6, `parseGuideDocument`가 같은 이유로 같은 약속을 한다)
 *
 * ## 자동 수정을 하지 않는다
 *
 * 빠진 필드를 기본값으로 채우거나 깨진 자산을 없는 셈 치지 않는다. 하네스 M8
 * 주의가 금지한다. 사용자가 원본 문제를 모르면 그 파일은 계속 퍼진다.
 */

import { ASSET_DATA_KEY } from '../export-json/json-exporter.ts';
import { checksumOf } from '../assets/checksum.ts';
import { parseDataUrl } from '../assets/data-url.ts';
import {
  type GuideMigration,
  assessSchemaVersion,
  parseGuideDocument,
  planMigration,
} from '../../domain/guide.schema.ts';
import { ISSUE_CODES, type ValidationIssue, joinPath } from '../../domain/validation.types.ts';
import type { GuideDocument } from '../../domain/guide.types.ts';
import { MIGRATION_REGISTRY } from './migrations/index.ts';

/** 저장소에 넣을 준비가 된 자산 하나. */
export interface ImportedAsset {
  id: string;
  mimeType: string;
  bytes: ArrayBuffer;
  byteSize: number;
  /** 파일에서 읽은 manifest 값. 대조에 성공했거나 대조하지 못한 값이다. */
  checksum: string;
}

export interface ImportSuccess {
  ok: true;
  document: GuideDocument;
  assets: ImportedAsset[];
  /** `error`는 없다. 경고·안내만 담긴다. */
  issues: ValidationIssue[];
  /** 마이그레이션을 거쳤으면 원래 버전. 아니면 `null`. */
  migratedFrom: string | null;
}

export interface ImportFailure {
  ok: false;
  document: null;
  issues: ValidationIssue[];
  migratedFrom: null;
}

export type ImportOutcome = ImportSuccess | ImportFailure;

export interface ImportOptions {
  /**
   * 마이그레이션 단계 목록. 기본값은 제품 레지스트리다.
   *
   * 인자로 받는 이유는 테스트가 합성 단계를 넣어 실행기를 실제로 돌리기
   * 위해서다. 제품 레지스트리가 비어 있어도 DoD 5가 공허해지지 않는다.
   */
  registry?: readonly GuideMigration[];
}

/** 파일 텍스트 한 건을 문서와 자산으로. 던지지 않는다. */
export async function importGuideJson(
  text: string,
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  const registry = options.registry ?? MIGRATION_REGISTRY;

  const parsed = parseJsonText(text);
  if (!parsed.ok) return failure([parsed.issue]);

  const { document: rawDocument, assetData, issues: envelopeIssues } = splitAssetData(parsed.value);

  const prepared = applyMigrations(rawDocument, registry);
  if (!prepared.ok) return failure([...envelopeIssues, prepared.issue]);

  const outcome = parseGuideDocument(prepared.value);
  if (!outcome.ok) return failure([...envelopeIssues, ...outcome.result.issues]);

  const resolved = await resolveAssets(outcome.document, assetData);
  const issues = [...envelopeIssues, ...outcome.result.issues, ...resolved.issues];

  // 자산 단계에서 error가 나왔으면 문서만 통과했다고 성공이라 하지 않는다.
  // 검증한 적 없는 바이트를 저장소에 넣는 것이 이 phase가 막아야 할 일이다.
  if (issues.some((issue) => issue.severity === 'error')) return failure(issues);

  return {
    ok: true,
    document: outcome.document,
    assets: resolved.assets,
    issues,
    migratedFrom: prepared.migratedFrom,
  };
}

function failure(issues: ValidationIssue[]): ImportFailure {
  return { ok: false, document: null, issues, migratedFrom: null };
}

// ────────────────────────────────────────────────────────────── 1. 텍스트 → 값

type JsonParseResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; issue: ValidationIssue };

/**
 * `JSON.parse`의 오류 메시지를 그대로 싣는다.
 *
 * 엔진 메시지에는 위치가 들어 있다(`... at position 42`). 우리 문구로
 * 갈아치우면 사용자가 파일 어디를 봐야 하는지 알 수 없다. (DoD 3)
 */
function parseJsonText(text: string): JsonParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issue: {
        code: ISSUE_CODES.INVALID_JSON,
        severity: 'error',
        stage: 'document',
        path: '',
        message: `JSON으로 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  // 배열과 null도 typeof가 'object'다. 최상위는 가이드 객체여야 한다.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      issue: {
        code: ISSUE_CODES.NOT_AN_OBJECT,
        severity: 'error',
        stage: 'document',
        path: '',
        message: 'HowSheet 가이드 파일이 아닙니다. 최상위가 객체가 아닙니다.',
      },
    };
  }

  return { ok: true, value: value as Record<string, unknown> };
}

// ────────────────────────────────────────────────────── 2. 자산 본문 떼어 내기

interface SplitResult {
  document: Record<string, unknown>;
  assetData: Record<string, string>;
  issues: ValidationIssue[];
}

/**
 * `assetData`를 문서에서 분리한다.
 *
 * 파싱 **전에** 뗀다. Zod가 모르는 키를 strip하므로 그냥 넘겨도 결과는 같지만,
 * 그러면 "스키마가 버려 줬다"에 기대는 셈이다. 명시적으로 떼면 자산 맵이
 * 문서 본문에 섞여 저장소에 들어갈 길이 없다.
 */
function splitAssetData(raw: Record<string, unknown>): SplitResult {
  const { [ASSET_DATA_KEY]: rawAssetData, ...document } = raw;
  if (rawAssetData === undefined) return { document, assetData: {}, issues: [] };

  if (typeof rawAssetData !== 'object' || rawAssetData === null || Array.isArray(rawAssetData)) {
    return {
      document,
      assetData: {},
      issues: [
        {
          code: ISSUE_CODES.ASSET_DATA_MALFORMED,
          severity: 'error',
          stage: 'document',
          path: ASSET_DATA_KEY,
          message: '이미지 데이터 묶음이 객체가 아닙니다. 파일이 손상됐습니다.',
        },
      ],
    };
  }

  const assetData: Record<string, string> = {};
  const issues: ValidationIssue[] = [];
  for (const [id, value] of Object.entries(rawAssetData as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      issues.push({
        code: ISSUE_CODES.ASSET_DATA_MALFORMED,
        severity: 'error',
        stage: 'document',
        path: joinPath(ASSET_DATA_KEY, id),
        message: `이미지 '${id}'의 데이터가 문자열이 아닙니다.`,
      });
      continue;
    }
    assetData[id] = value;
  }

  return { document, assetData, issues };
}

// ────────────────────────────────────────────────────────── 3. 마이그레이션

type PrepareResult =
  { ok: true; value: unknown; migratedFrom: string | null } | { ok: false; issue: ValidationIssue };

/**
 * 필요하면 복사본을 만들어 마이그레이션한다. (DoD 5)
 *
 * 마이그레이션이 필요한 경우만 여기서 다룬다. 낮은 버전 문서는 파서에 넣기
 * 전에 올려야 하기 때문이다.
 *
 * **높은 major와 형식 오류는 여기서 막지 않는다.** `parseGuideDocument`가
 * 파싱보다 먼저 같은 판정을 하고 같은 코드를 돌려준다(DoD 6). 여기서 한 번 더
 * 막아도 관측되는 결과가 달라지지 않아, 어떤 테스트도 두 경로를 구별하지
 * 못한다. 음성 검증에서 실제로 그랬다 - 이 분기를 지워도 아무 테스트가 깨지지
 * 않았다. 검증할 수 없는 중복은 두지 않는다.
 */
function applyMigrations(raw: unknown, registry: readonly GuideMigration[]): PrepareResult {
  const verdict = assessSchemaVersion(raw);
  if (verdict.status !== 'migrationRequired') {
    return { ok: true, value: raw, migratedFrom: null };
  }

  const from = `${verdict.version.major}.${verdict.version.minor}`;
  const plan = planMigration(from, registry);
  if (plan === null) {
    return {
      ok: false,
      issue: {
        code: ISSUE_CODES.MIGRATION_UNAVAILABLE,
        severity: 'error',
        stage: 'document',
        path: 'schemaVersion',
        message: `${from} 문서를 현재 버전으로 올리는 경로가 없습니다.`,
      },
    };
  }

  // §2.3.5 "마이그레이션은 원본 복사본을 만든 뒤 수행한다".
  //
  // 이 함수에서는 그 요구가 **이미 충족돼 있다.** 우리가 받은 값은 호출자의
  // 문자열을 우리가 파싱한 결과라 그 자체가 사본이고, 저장된 문서는 아직 손도
  // 대지 않았다. 실제 원본 보호는 저장소 계층의 `withSnapshot`이 한다.
  //
  // 그래서 아래 `structuredClone`은 관측 가능한 보호가 아니다. 지워도 어떤
  // 테스트도 깨지지 않는다(음성 검증에서 확인). 남겨 두는 이유는 이 함수가
  // 나중에 파싱된 객체를 직접 받게 될 때를 위한 것이고, 그때까지는 검증되지
  // 않은 방어라는 사실을 여기 적어 둔다.
  let cursor: unknown = structuredClone(raw);
  for (const migration of plan) {
    try {
      cursor = migration.migrate(cursor);
    } catch (error) {
      return {
        ok: false,
        issue: {
          code: ISSUE_CODES.MIGRATION_FAILED,
          severity: 'error',
          stage: 'document',
          path: 'schemaVersion',
          message:
            `${migration.from} → ${migration.to} 변환에 실패했습니다: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  return { ok: true, value: cursor, migratedFrom: from };
}

// ────────────────────────────────────────────────────────────── 4. 자산 복원

interface ResolveResult {
  assets: ImportedAsset[];
  issues: ValidationIssue[];
}

/**
 * manifest와 자산 본문을 대조한다.
 *
 * manifest가 기준이다. 문서가 자기 것이라고 한 자산만 저장소로 보낸다. 본문에만
 * 있는 자산은 어떤 블록도 참조할 수 없으므로 담아 봐야 고아가 된다.
 */
async function resolveAssets(
  document: GuideDocument,
  assetData: Record<string, string>,
): Promise<ResolveResult> {
  const assets: ImportedAsset[] = [];
  const issues: ValidationIssue[] = [];
  const claimed = new Set<string>();

  for (const [index, item] of document.assets.entries()) {
    claimed.add(item.id);
    const path = joinPath('assets', index);
    const encoded = assetData[item.id];

    if (encoded === undefined) {
      // 오류가 아니다. 그림 없이도 글은 읽을 수 있고, 리더에는 이미 "이미지를
      // 불러오지 못했습니다" 상태가 있다. 막으면 이미지를 잃은 사본으로는
      // 아무것도 되살릴 수 없다. 대신 조용히 넘어가지 않는다. (DoD 3)
      issues.push({
        code: ISSUE_CODES.ASSET_DATA_MISSING,
        severity: 'warning',
        stage: 'document',
        path,
        message: `이미지 '${item.fileName}'의 데이터가 파일에 없습니다. 이미지 없이 가져옵니다.`,
      });
      continue;
    }

    const decoded = parseDataUrl(encoded);
    if (decoded === null) {
      issues.push({
        code: ISSUE_CODES.ASSET_DATA_MALFORMED,
        severity: 'error',
        stage: 'document',
        path: joinPath(ASSET_DATA_KEY, item.id),
        message: `이미지 '${item.fileName}'의 데이터를 읽을 수 없습니다.`,
      });
      continue;
    }

    if (decoded.mimeType !== item.mimeType) {
      issues.push({
        code: ISSUE_CODES.ASSET_MIME_MISMATCH,
        severity: 'error',
        stage: 'document',
        path: joinPath('assets', index, 'mimeType'),
        message:
          `이미지 '${item.fileName}'의 형식이 목록(${item.mimeType})과 ` +
          `데이터(${decoded.mimeType})에서 다릅니다.`,
      });
      continue;
    }

    const verdict = await verifyChecksum(decoded.bytes, item.checksum);
    if (verdict !== null) {
      issues.push({ ...verdict, path: joinPath('assets', index, 'checksum') });
      if (verdict.severity === 'error') continue;
    }

    assets.push({
      id: item.id,
      mimeType: item.mimeType,
      bytes: decoded.bytes,
      byteSize: decoded.bytes.byteLength,
      checksum: item.checksum,
    });
  }

  for (const id of Object.keys(assetData)) {
    if (claimed.has(id)) continue;
    issues.push({
      code: ISSUE_CODES.ASSET_DATA_ORPHANED,
      severity: 'warning',
      stage: 'document',
      path: joinPath(ASSET_DATA_KEY, id),
      message: `이미지 '${id}'는 목록에 없어 가져오지 않습니다.`,
    });
  }

  return { assets, issues };
}

/** 문제가 없으면 `null`. 있으면 그 이슈(경로는 호출자가 채운다). */
async function verifyChecksum(
  bytes: ArrayBuffer,
  expected: string,
): Promise<Omit<ValidationIssue, 'path'> | null> {
  let actual: string;
  try {
    actual = await checksumOf(bytes);
  } catch {
    // 계산할 수 없는 것과 다른 것은 다르다. 불일치로 보고하면 멀쩡한 파일을
    // 손상됐다고 말하게 되고, 넘어가면 검증한 척이 된다.
    return {
      code: ISSUE_CODES.ASSET_CHECKSUM_UNVERIFIED,
      severity: 'warning',
      stage: 'document',
      message: '이 브라우저 환경에서는 이미지 무결성을 확인할 수 없어 그대로 가져옵니다.',
    };
  }

  if (actual === expected) return null;

  return {
    code: ISSUE_CODES.ASSET_CHECKSUM_MISMATCH,
    severity: 'error',
    stage: 'document',
    message: '이미지 데이터가 목록의 체크섬과 다릅니다. 파일이 손상됐거나 변조됐습니다.',
  };
}
