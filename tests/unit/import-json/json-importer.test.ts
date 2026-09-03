import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RESOLUTION_HINTS } from '@/components/editor/ValidationPanel/ValidationPanel.tsx';
import type { GuideMigration } from '@/domain/guide.schema.ts';
import { SCHEMA_VERSION } from '@/domain/guide.types.ts';
import { ISSUE_CODES, type IssueCode } from '@/domain/validation.types.ts';
import { toDataUrl } from '@/features/assets/data-url.ts';
import { checksumOf } from '@/features/assets/checksum.ts';
import { ASSET_DATA_KEY, canonicalJson } from '@/features/export-json/json-exporter.ts';
import { importGuideJson } from '@/features/import-json/json-importer.ts';
import { MIGRATION_REGISTRY } from '@/features/import-json/migrations/index.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function raw(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function codesOf(issues: { code: IssueCode }[]): IssueCode[] {
  return issues.map((issue) => issue.code);
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;

/** 자산 하나가 실제로 대조를 통과하는 파일 텍스트를 만든다. */
async function withAsset(): Promise<string> {
  const document = raw('valid-linear-5step.howsheet.json');
  const checksum = await checksumOf(PNG_BYTES);
  const assets = document.assets as {
    id: string;
    mimeType: string;
    checksum: string;
    byteSize: number;
  }[];
  assets[0]!.checksum = checksum;
  assets[0]!.byteSize = PNG_BYTES.byteLength;

  return canonicalJson({
    ...document,
    [ASSET_DATA_KEY]: { [assets[0]!.id]: toDataUrl(PNG_BYTES, assets[0]!.mimeType) },
  });
}

describe('importGuideJson - 정상 경로', () => {
  it('픽스처를 그대로 가져온다', async () => {
    const outcome = await importGuideJson(canonicalJson(raw('valid-minimal.howsheet.json')));

    expect(outcome.ok).toBe(true);
    expect(outcome.document?.id).toBe(raw('valid-minimal.howsheet.json').id);
    expect(outcome.migratedFrom).toBeNull();
  });

  it('자산 본문을 바이트로 되돌린다', async () => {
    const outcome = await importGuideJson(await withAsset());

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.assets).toHaveLength(1);
    expect(outcome.ok && new Uint8Array(outcome.assets[0]!.bytes)).toEqual(
      new Uint8Array(PNG_BYTES),
    );
  });

  it('문서에는 자산 본문이 남지 않는다', async () => {
    // 본문이 GuideDocument에 섞이면 guides 테이블에 base64가 저장돼 텍스트
    // 한 글자 수정마다 이미지 전체가 다시 쓰인다. (M3 주의)
    const outcome = await importGuideJson(await withAsset());

    expect(outcome.ok && ASSET_DATA_KEY in outcome.document).toBe(false);
  });
});

describe('importGuideJson - 손상 입력 (DoD 3)', () => {
  it('JSON이 아니면 파서 메시지를 그대로 싣는다', async () => {
    const outcome = await importGuideJson('{ 이건 JSON이 아니다');

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.INVALID_JSON]);

    // 위치 정보를 우리 문구로 갈아치우면 사용자가 어디를 볼지 알 수 없다.
    // 엔진 메시지를 그대로 실었는지 보려면 엔진에게 직접 물어야 한다.
    // "JSON이 들어 있는지" 같은 느슨한 검사는 우리 문구도 통과시킨다.
    let engineMessage = '';
    try {
      JSON.parse('{ 이건 JSON이 아니다');
    } catch (error) {
      engineMessage = (error as Error).message;
    }
    expect(engineMessage).not.toBe('');
    expect(outcome.issues[0]?.message).toContain(engineMessage);
  });

  it('최상위가 배열이면 거부한다', async () => {
    const outcome = await importGuideJson('[]');
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.NOT_AN_OBJECT]);
  });

  it('최상위가 null이면 거부한다', async () => {
    const outcome = await importGuideJson('null');
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.NOT_AN_OBJECT]);
  });

  it('잘못된 필드를 경로와 함께 보고한다', async () => {
    const document = raw('valid-minimal.howsheet.json');
    (document.meta as Record<string, unknown>).title = 42;

    const outcome = await importGuideJson(JSON.stringify(document));

    expect(outcome.ok).toBe(false);
    expect(outcome.issues.some((issue) => issue.path === 'meta.title')).toBe(true);
  });

  it('누락 필드와 타입 불일치를 구별한다', async () => {
    // raw를 parseGuideDocument에 함께 넘겨야 구별된다. 안 넘기면 둘 다
    // MISSING_FIELD가 된다.
    const missing = raw('valid-minimal.howsheet.json');
    delete (missing.meta as Record<string, unknown>).title;
    const wrongType = raw('valid-minimal.howsheet.json');
    (wrongType.meta as Record<string, unknown>).title = 42;

    const a = await importGuideJson(JSON.stringify(missing));
    const b = await importGuideJson(JSON.stringify(wrongType));

    expect(codesOf(a.issues)).toContain(ISSUE_CODES.MISSING_FIELD);
    expect(codesOf(b.issues)).toContain(ISSUE_CODES.INVALID_TYPE);
  });

  it('어떤 입력에도 던지지 않는다', async () => {
    for (const input of ['', '   ', '0', '"문자열"', 'true', '{}', '[1,2]', '{"a":']) {
      await expect(importGuideJson(input)).resolves.toBeDefined();
    }
  });

  it('보고한 모든 코드에 사용자 행동이 있다', async () => {
    // DoD 3의 '사용자 행동'. RESOLUTION_HINTS는 Record<IssueCode, string>이라
    // 코드를 더하면 컴파일이 깨지지만, 빈 문자열까지 막지는 않는다.
    const outcomes = [
      await importGuideJson('{'),
      await importGuideJson('[]'),
      await importGuideJson(
        JSON.stringify({ ...raw('valid-minimal.howsheet.json'), schemaVersion: '9.0' }),
      ),
    ];

    for (const outcome of outcomes) {
      expect(outcome.issues.length).toBeGreaterThan(0);
      for (const issue of outcome.issues) {
        expect(RESOLUTION_HINTS[issue.code]).toBeTruthy();
      }
    }
  });
});

describe('importGuideJson - 스키마 버전 (DoD 6)', () => {
  it('높은 major를 편집 상태로 강등하지 않는다', async () => {
    const outcome = await importGuideJson(
      JSON.stringify({ ...raw('valid-minimal.howsheet.json'), schemaVersion: '2.0' }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.document).toBeNull();
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR]);
  });

  it('높은 major는 모르는 필드가 있어도 파서로 넘어가지 않는다', async () => {
    // 파서로 넘기면 Zod가 모르는 키를 strip해 '편집 가능한 1.0 문서'가 된다.
    // 버전 판정이 파싱보다 먼저 와야 하는 이유다.
    const outcome = await importGuideJson(
      JSON.stringify({
        ...raw('valid-minimal.howsheet.json'),
        schemaVersion: '3.1',
        futureField: { 미래: true },
      }),
    );

    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR]);
  });

  it('schemaVersion 형식이 아니면 거부한다', async () => {
    const outcome = await importGuideJson(
      JSON.stringify({ ...raw('valid-minimal.howsheet.json'), schemaVersion: '일' }),
    );

    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.MALFORMED_SCHEMA_VERSION]);
  });

  it('schemaVersion이 아예 없어도 거부한다', async () => {
    const document = raw('valid-minimal.howsheet.json');
    delete document.schemaVersion;

    expect(codesOf((await importGuideJson(JSON.stringify(document))).issues)).toEqual([
      ISSUE_CODES.MALFORMED_SCHEMA_VERSION,
    ]);
  });
});

describe('importGuideJson - 마이그레이션 (DoD 5)', () => {
  const lift: GuideMigration = {
    from: '0.9',
    to: SCHEMA_VERSION,
    migrate(document) {
      return { ...(document as Record<string, unknown>), schemaVersion: SCHEMA_VERSION };
    },
  };

  function old(): string {
    return JSON.stringify({ ...raw('valid-minimal.howsheet.json'), schemaVersion: '0.9' });
  }

  it('제품 레지스트리는 지금 비어 있다', () => {
    // 비어 있다는 사실 자체를 고정한다. 몰래 채워지면 여기서 드러난다.
    expect(MIGRATION_REGISTRY).toEqual([]);
  });

  it('경로가 없으면 중단한다', async () => {
    const outcome = await importGuideJson(old());

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.MIGRATION_UNAVAILABLE]);
  });

  it('경로가 있으면 올려서 가져온다', async () => {
    const outcome = await importGuideJson(old(), { registry: [lift] });

    expect(outcome.ok).toBe(true);
    expect(outcome.migratedFrom).toBe('0.9');
    expect(outcome.document?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('여러 단계를 순서대로 잇는다', async () => {
    const steps: GuideMigration[] = [
      { from: '0.8', to: '0.9', migrate: (d) => ({ ...(d as object), schemaVersion: '0.9' }) },
      lift,
    ];
    const outcome = await importGuideJson(
      JSON.stringify({ ...raw('valid-minimal.howsheet.json'), schemaVersion: '0.8' }),
      { registry: steps },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.migratedFrom).toBe('0.8');
  });

  it('마이그레이션이 던지면 중단하고 보고한다', async () => {
    const broken: GuideMigration = {
      from: '0.9',
      to: SCHEMA_VERSION,
      migrate() {
        throw new Error('변환 중 실패');
      },
    };
    const outcome = await importGuideJson(old(), { registry: [broken] });

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.MIGRATION_FAILED]);
    expect(outcome.issues[0]?.message).toContain('변환 중 실패');
  });

  it('입력을 망가뜨리는 마이그레이션도 그 결과만 남긴다', async () => {
    // 원본 보호를 여기서 단언하지 않는다. 입력이 문자열이라 호출자가 잃을
    // 객체가 없고, 저장된 문서는 이 함수가 손대지 않는다. 실제 원본 보호는
    // 저장소의 withSnapshot이 하고 json-roundtrip 통합 테스트가 본다.
    //
    // 여기서 볼 수 있는 것은 "입력을 제자리에서 고치는 마이그레이션도 정상
    // 동작한다"까지다.
    const inPlace: GuideMigration = {
      from: '0.9',
      to: SCHEMA_VERSION,
      migrate(document) {
        const target = document as Record<string, unknown>;
        target.schemaVersion = SCHEMA_VERSION;
        (target.meta as Record<string, unknown>).title = '바뀐 제목';
        return target;
      },
    };

    const outcome = await importGuideJson(old(), { registry: [inPlace] });

    expect(outcome.ok).toBe(true);
    expect(outcome.document?.meta.title).toBe('바뀐 제목');
  });
});

describe('importGuideJson - 자산 대조', () => {
  async function fileWith(assetData: Record<string, unknown>): Promise<string> {
    const document = raw('valid-linear-5step.howsheet.json');
    const assets = document.assets as { id: string; checksum: string; byteSize: number }[];
    assets[0]!.checksum = await checksumOf(PNG_BYTES);
    assets[0]!.byteSize = PNG_BYTES.byteLength;
    return JSON.stringify({ ...document, [ASSET_DATA_KEY]: assetData });
  }

  it('본문이 없으면 경고하고 이미지 없이 가져온다', async () => {
    const outcome = await importGuideJson(await fileWith({}));

    expect(outcome.ok).toBe(true);
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.ASSET_DATA_MISSING]);
    expect(outcome.ok && outcome.assets).toEqual([]);
  });

  it('체크섬이 다르면 막는다', async () => {
    const outcome = await importGuideJson(
      await fileWith({ 'asset-diagram': toDataUrl(new Uint8Array([1, 2, 3]).buffer, 'image/png') }),
    );

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toContain(ISSUE_CODES.ASSET_CHECKSUM_MISMATCH);
  });

  it('Data URL이 아니면 막는다', async () => {
    const outcome = await importGuideJson(
      await fileWith({ 'asset-diagram': 'https://example.com/a.png' }),
    );

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toContain(ISSUE_CODES.ASSET_DATA_MALFORMED);
  });

  it('MIME이 manifest와 다르면 막는다', async () => {
    const outcome = await importGuideJson(
      await fileWith({ 'asset-diagram': toDataUrl(PNG_BYTES, 'image/webp') }),
    );

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toContain(ISSUE_CODES.ASSET_MIME_MISMATCH);
  });

  it('manifest에 없는 본문은 무시하되 알린다', async () => {
    const outcome = await importGuideJson(
      await fileWith({
        'asset-diagram': toDataUrl(PNG_BYTES, 'image/png'),
        'asset-unknown': toDataUrl(PNG_BYTES, 'image/png'),
      }),
    );

    expect(outcome.ok).toBe(true);
    expect(codesOf(outcome.issues)).toEqual([ISSUE_CODES.ASSET_DATA_ORPHANED]);
    expect(outcome.ok && outcome.assets.map((asset) => asset.id)).toEqual(['asset-diagram']);
  });

  it('자산 맵이 객체가 아니면 막는다', async () => {
    const document = raw('valid-minimal.howsheet.json');
    const outcome = await importGuideJson(
      JSON.stringify({ ...document, [ASSET_DATA_KEY]: '문자열' }),
    );

    expect(outcome.ok).toBe(false);
    expect(codesOf(outcome.issues)).toContain(ISSUE_CODES.ASSET_DATA_MALFORMED);
  });
});
