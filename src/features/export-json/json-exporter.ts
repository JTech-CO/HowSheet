/**
 * HowSheet JSON 내보내기.
 *
 * 기준: 기술 백서 FR-012, §2.4.1, §4.3.5. 하네스 M8 할 일 1·2·3, DoD 1·2·7·8.
 *
 * ## 파일 형식
 *
 * `.howsheet.json`은 `GuideDocument`를 **그대로** 담는다. `tests/fixtures/`의
 * 10개 파일이 이 모양이고 `verify:fixtures`가 그것을 고정한다. 봉투로 감싸면
 * 저장 형식이 바뀌어 AGENTS.md §7의 STOP 대상이 된다.
 *
 * 자산 바이트만 문서에 자리가 없다. `assets`는 manifest(메타데이터)일 뿐이고
 * 본문은 저장소의 `assets` 테이블에만 있기 때문이다. §2.4.1이 "Base64 Data URL
 * 또는 별도 자산 맵"을 지정하므로 **최상위 형제 키** 하나를 더한다.
 *
 * ```json
 * { "schemaVersion": "1.0", ..., "assetData": { "asset-1": "data:image/png;base64,..." } }
 * ```
 *
 * 문서 스키마는 손대지 않는다. Zod가 모르는 키를 strip하므로 `parseGuideDocument`에
 * 넘기면 `assetData`는 사라지고 정확히 `GuideDocument`만 남는다. 가져오기는
 * 파싱 **전에** 이 키를 떼어 낸다.
 *
 * ## 결정론 (DoD 2)
 *
 * 두 가지를 고정한다.
 *
 *   1. **키 순서** - 객체 키를 재귀적으로 사전순 정렬한다. 문서가 IndexedDB
 *      구조화 복제에서 왔는지 `JSON.parse`에서 왔는지에 따라 삽입 순서가
 *      달라지는데, 정렬하면 출처와 무관해진다. 배열은 순서가 의미이므로
 *      건드리지 않는다.
 *   2. **시간 필드** - 내보내기는 시각을 **찍지 않는다.** `createdAt`·
 *      `updatedAt`은 문서의 데이터라 그대로 옮긴다. 내보낸 시각을 파일에 넣으면
 *      바뀐 것이 없어도 두 번째 내보내기가 달라져 DoD 2를 만족할 수 없다.
 *
 * 무작위 값도 만들지 않는다. ID는 문서에 이미 있는 것을 쓴다.
 */

import { toDataUrl } from '../assets/data-url.ts';
import { guideFileName } from '../../utils/filename.ts';
import { ISSUE_CODES, type ValidationIssue, joinPath } from '../../domain/validation.types.ts';
import type { GuideDocument } from '../../domain/guide.types.ts';

/** 문서 옆에 자산 본문을 싣는 최상위 키. 가져오기가 파싱 전에 떼어 낸다. */
export const ASSET_DATA_KEY = 'assetData';

/** `.howsheet.json`의 MIME. (§2.4.1) */
export const HOWSHEET_JSON_MIME = 'application/json';

/** 내보내기에 넘길 자산 하나. 저장소 타입을 쓰지 않아 계층이 섞이지 않는다. */
export interface ExportAssetSource {
  id: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

export interface ExportJsonInput {
  document: GuideDocument;
  /** 순서는 상관없다. manifest를 기준으로 골라 쓴다. */
  assets: readonly ExportAssetSource[];
}

export interface ExportJsonResult {
  fileName: string;
  mimeType: string;
  text: string;
  /**
   * 내보내기를 막지는 않지만 알려야 하는 것. 지금은 "manifest에 있는데 본문이
   * 없는 자산" 하나다.
   *
   * 내보내기를 중단하지 않는 이유는 이것이 **저장소를 쓸 수 없을 때의 유일한
   * 백업 경로**이기 때문이다(§4.6). 이미지 한 장 때문에 글 전체를 잃게 두지
   * 않는다. 대신 조용히 빠뜨리지 않는다. (M8 주의)
   */
  issues: ValidationIssue[];
}

/**
 * 문서와 자산을 `.howsheet.json` 텍스트로.
 *
 * 검증하지 않는다. 잘못된 문서도 내보낼 수 있어야 한다 - 디자인 §2.2.1이
 * 내보내기 대화상자를 오류가 있어도 열도록 규정하고, 무엇보다 저장소가 죽었을
 * 때 사용자가 작업을 꺼낼 마지막 통로다. 유효성 판정은 HTML 내보내기(INV-05,
 * M9)가 맡는다.
 */
export function exportGuideJson(input: ExportJsonInput): ExportJsonResult {
  const { document, assets } = input;
  const available = new Map(assets.map((asset) => [asset.id, asset]));
  const issues: ValidationIssue[] = [];
  const assetData: Record<string, string> = {};

  // manifest를 기준으로 돈다. 저장소에 있지만 manifest에 없는 자산은 이 문서가
  // 자기 것이라고 하지 않은 바이트다. 담으면 파일만 커지고, 가져오기 쪽에서는
  // 참조 없는 고아가 된다.
  //
  // Map에 담으므로 manifest에 같은 id가 두 번 나와도 본문은 한 벌이다. 이미지
  // 블록 여러 개가 한 자산을 가리키는 경우는 manifest 자체가 이미 1건이라
  // 여기서 다시 만나지 않는다. (DoD 8)
  for (const [index, item] of document.assets.entries()) {
    const source = available.get(item.id);
    if (source === undefined) {
      issues.push({
        code: ISSUE_CODES.ASSET_DATA_MISSING,
        severity: 'warning',
        stage: 'export',
        path: joinPath('assets', index, 'id'),
        message: `자산 '${item.fileName}'의 이미지 데이터를 찾을 수 없어 파일에 담지 못했습니다.`,
      });
      continue;
    }
    assetData[item.id] = toDataUrl(source.bytes, source.mimeType);
  }

  const payload: Record<string, unknown> = { ...document };
  // 자산이 없으면 키를 만들지 않는다. 빈 객체를 넣으면 자산 없는 가이드의
  // 내보내기 결과가 픽스처와 달라진다.
  if (Object.keys(assetData).length > 0) payload[ASSET_DATA_KEY] = assetData;

  return {
    fileName: guideFileName(document.meta.title, document.revision),
    mimeType: HOWSHEET_JSON_MIME,
    text: canonicalJson(payload),
    issues,
  };
}

/**
 * 키 순서가 입력에 좌우되지 않는 JSON 문자열. (DoD 2)
 *
 * 들여쓰기 2칸을 유지한다. 교환 형식이자 사람이 열어 보는 파일이고, 픽스처도
 * 같은 모양이라 diff가 읽힌다.
 */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

/**
 * 객체 키를 재귀적으로 정렬한다. 배열 순서는 의미이므로 그대로 둔다.
 *
 * `undefined` 값을 가진 키는 `JSON.stringify`가 어차피 버리므로 여기서도
 * 버린다. 남겨 두면 정렬만 하고 결과가 같아 혼란스럽다.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}
