import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseGuideDocument } from '@/domain/guide.schema.ts';
import type { GuideDocument } from '@/domain/guide.types.ts';
import { ISSUE_CODES } from '@/domain/validation.types.ts';
import {
  ASSET_DATA_KEY,
  canonicalJson,
  exportGuideJson,
  type ExportAssetSource,
} from '@/features/export-json/json-exporter.ts';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures');

function documentOf(name: string): GuideDocument {
  const outcome = parseGuideDocument(
    JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf8')),
  );
  if (!outcome.ok) throw new Error(`${name} 파싱 실패`);
  return outcome.document;
}

function bytesOf(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function sourceFor(document: GuideDocument): ExportAssetSource[] {
  return document.assets.map((item, index) => ({
    id: item.id,
    mimeType: item.mimeType,
    bytes: bytesOf(index, index + 1, index + 2),
  }));
}

describe('exportGuideJson - 파일 형식', () => {
  it('자산이 없으면 GuideDocument 그대로다', () => {
    const document = documentOf('valid-minimal.howsheet.json');
    const parsed = JSON.parse(exportGuideJson({ document, assets: [] }).text);

    // 봉투로 감싸지 않는다. 감싸면 픽스처 10종과 형식이 갈린다.
    expect(parsed).toEqual(document);
    expect(ASSET_DATA_KEY in parsed).toBe(false);
  });

  it('자산이 있으면 최상위 형제 키로 싣는다', () => {
    const document = documentOf('valid-linear-5step.howsheet.json');
    const parsed = JSON.parse(exportGuideJson({ document, assets: sourceFor(document) }).text);

    expect(Object.keys(parsed[ASSET_DATA_KEY])).toEqual(['asset-diagram']);
    expect(parsed[ASSET_DATA_KEY]['asset-diagram']).toMatch(/^data:image\/png;base64,/);
  });

  it('자산 맵을 떼면 원래 문서가 남는다', () => {
    // 가져오기가 파싱 전에 이 키를 떼어 내는 것이 안전하다는 근거다.
    const document = documentOf('valid-linear-5step.howsheet.json');
    const parsed = JSON.parse(exportGuideJson({ document, assets: sourceFor(document) }).text);
    const { [ASSET_DATA_KEY]: _dropped, ...rest } = parsed;

    expect(rest).toEqual(document);
  });

  it('Zod가 assetData를 strip하므로 그대로 파싱해도 문서만 남는다', () => {
    const document = documentOf('valid-linear-5step.howsheet.json');
    const text = exportGuideJson({ document, assets: sourceFor(document) }).text;
    const outcome = parseGuideDocument(JSON.parse(text));

    expect(outcome.ok).toBe(true);
    expect(outcome.document).toEqual(document);
  });

  it('파일명에 제목과 revision이 들어간다 (DoD 7)', () => {
    const document = documentOf('valid-minimal.howsheet.json');
    const result = exportGuideJson({ document, assets: [] });

    expect(result.fileName).toBe(`${document.meta.title.replace(/\s+/g, '-')}.r1.howsheet.json`);
    expect(result.mimeType).toBe('application/json');
  });
});

describe('exportGuideJson - 결정론 (DoD 2)', () => {
  it('같은 입력을 두 번 내보내면 바이트가 같다', () => {
    const document = documentOf('valid-branched.howsheet.json');
    const first = exportGuideJson({ document, assets: [] }).text;
    const second = exportGuideJson({ document, assets: [] }).text;

    expect(second).toBe(first);
  });

  it('키 삽입 순서가 달라도 결과가 같다', () => {
    // IndexedDB 구조화 복제와 JSON.parse는 삽입 순서를 다르게 만들 수 있다.
    const document = documentOf('valid-linear-5step.howsheet.json');
    const shuffled = Object.fromEntries(
      Object.entries(document as unknown as Record<string, unknown>).reverse(),
    ) as unknown as GuideDocument;

    expect(exportGuideJson({ document: shuffled, assets: [] }).text).toBe(
      exportGuideJson({ document, assets: [] }).text,
    );
  });

  it('자산을 넘긴 순서가 달라도 결과가 같다', () => {
    // manifest 항목이 둘이어야 순서가 의미를 갖는다. 픽스처에 없으므로 만든다.
    const base = documentOf('valid-linear-5step.howsheet.json');
    const document: GuideDocument = {
      ...base,
      assets: [base.assets[0]!, { ...base.assets[0]!, id: 'asset-second', fileName: 'second.png' }],
    };
    const first: ExportAssetSource = {
      id: 'asset-diagram',
      mimeType: 'image/png',
      bytes: bytesOf(1),
    };
    const second: ExportAssetSource = {
      id: 'asset-second',
      mimeType: 'image/png',
      bytes: bytesOf(2),
    };

    const forward = exportGuideJson({ document, assets: [first, second] }).text;
    expect(exportGuideJson({ document, assets: [second, first] }).text).toBe(forward);
    // 정렬이 실제로 일어났는지도 본다. 두 결과가 같기만 하면 우연일 수 있다.
    expect(Object.keys(JSON.parse(forward)[ASSET_DATA_KEY])).toEqual([
      'asset-diagram',
      'asset-second',
    ]);
  });

  it('내보내기가 시각을 찍지 않는다', () => {
    // 문서의 createdAt·updatedAt만 있어야 한다. 내보낸 시각을 더하면 바뀐 것이
    // 없어도 두 번째 내보내기가 달라진다.
    const document = documentOf('valid-minimal.howsheet.json');
    const parsed = JSON.parse(exportGuideJson({ document, assets: [] }).text);

    expect(parsed.createdAt).toBe(document.createdAt);
    expect(parsed.updatedAt).toBe(document.updatedAt);
    expect(Object.keys(parsed).filter((key) => /export|generated|savedAt/i.test(key))).toEqual([]);
  });

  it('배열 순서는 바꾸지 않는다', () => {
    // 키는 정렬하지만 배열은 순서가 의미다. 정렬하면 단계 순서가 뒤집힌다.
    const document = documentOf('valid-linear-5step.howsheet.json');
    const parsed = JSON.parse(exportGuideJson({ document, assets: [] }).text);

    expect(parsed.steps.map((step: { id: string }) => step.id)).toEqual(
      document.steps.map((step) => step.id),
    );
  });
});

describe('canonicalJson', () => {
  it('객체 키를 재귀적으로 정렬한다', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n',
    );
  });

  it('배열 요소 순서는 유지한다', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n');
  });

  it('undefined 값을 가진 키를 버린다', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{\n  "b": 1\n}\n');
  });

  it('줄바꿈으로 끝난다', () => {
    expect(canonicalJson({})).toMatch(/\n$/);
  });
});

describe('exportGuideJson - 자산 (DoD 8)', () => {
  it('여러 블록이 한 자산을 가리켜도 데이터는 한 벌이다', () => {
    const document = documentOf('valid-linear-5step.howsheet.json');
    const imageBlocks = document.steps
      .flatMap((step) => step.blocks)
      .filter((block) => block.type === 'image');

    // 픽스처 전제: 이미지 블록 2개가 자산 1개를 가리킨다.
    expect(imageBlocks).toHaveLength(2);
    expect(new Set(imageBlocks.map((block) => block.assetId)).size).toBe(1);

    const parsed = JSON.parse(exportGuideJson({ document, assets: sourceFor(document) }).text);
    expect(Object.keys(parsed[ASSET_DATA_KEY])).toHaveLength(1);
  });

  it('manifest에 없는 자산은 담지 않는다', () => {
    const document = documentOf('valid-minimal.howsheet.json');
    const parsed = JSON.parse(
      exportGuideJson({
        document,
        assets: [{ id: 'not-in-manifest', mimeType: 'image/png', bytes: bytesOf(1) }],
      }).text,
    );

    expect(ASSET_DATA_KEY in parsed).toBe(false);
  });

  it('본문 없는 manifest 항목을 조용히 빠뜨리지 않는다 (M8 주의)', () => {
    const document = documentOf('valid-linear-5step.howsheet.json');
    const result = exportGuideJson({ document, assets: [] });

    expect(result.issues.map((issue) => issue.code)).toEqual([ISSUE_CODES.ASSET_DATA_MISSING]);
    expect(result.issues[0]?.path).toBe('assets[0].id');
  });

  it('본문이 없어도 내보내기 자체는 계속한다', () => {
    // 저장소를 쓸 수 없을 때의 유일한 백업 경로다. 이미지 한 장 때문에 글
    // 전체를 잃게 두지 않는다. (§4.6)
    const document = documentOf('valid-linear-5step.howsheet.json');
    const result = exportGuideJson({ document, assets: [] });

    expect(JSON.parse(result.text).steps).toHaveLength(document.steps.length);
  });
});
