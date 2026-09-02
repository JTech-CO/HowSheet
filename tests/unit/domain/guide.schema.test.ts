import { describe, expect, it } from 'vitest';

import { createGuideDocument } from '@/domain/guide.defaults.ts';
import {
  assessSchemaVersion,
  guideMetaSchema,
  isAllowedUrl,
  parseGuideDocument,
  parseSchemaVersion,
  planMigration,
  validateGuideDocument,
  type GuideMigration,
} from '@/domain/guide.schema.ts';
import { SCHEMA_VERSION, type GuideDocument } from '@/domain/guide.types.ts';
import { ISSUE_CODES, type IssueCode } from '@/domain/validation.types.ts';

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;

function baseDocument(): GuideDocument {
  counter = 0;
  return createGuideDocument({
    id: 'guide-test',
    now: '2026-08-30T00:00:00.000Z',
    newId,
    title: '테스트 가이드',
  });
}

/** 구조적 복제. 원본을 건드리지 않고 위반을 주입하기 위해 쓴다. */
function mutate(change: (doc: GuideDocument) => void): unknown {
  const doc = structuredClone(baseDocument()) as GuideDocument;
  change(doc);
  return doc;
}

/** 자산 manifest까지 갖춘 이미지 블록 하나를 기본 문서에 더한다. */
function imageBlock(overrides: Record<string, unknown>): unknown {
  return mutate((d) => {
    d.assets.push({
      id: 'asset-img',
      fileName: 'a.png',
      mimeType: 'image/png',
      byteSize: 100,
      checksum: `sha256-${'a'.repeat(64)}`,
    });
    d.steps[0]!.blocks.push({
      id: 'img-1',
      order: 1,
      type: 'image',
      assetId: 'asset-img',
      alt: '설명',
      ...overrides,
    } as never);
  });
}

function codesOf(raw: unknown): IssueCode[] {
  return parseGuideDocument(raw).result.issues.map((issue) => issue.code);
}

function issueAt(raw: unknown, code: IssueCode) {
  return parseGuideDocument(raw).result.issues.find((issue) => issue.code === code);
}

describe('기본 문서 (M2 DoD 1)', () => {
  it('기본 문서가 스키마를 통과한다', () => {
    const outcome = parseGuideDocument(baseDocument());
    expect(outcome.ok).toBe(true);
    expect(outcome.result.issues).toEqual([]);
  });

  it('시작 단계가 하나 있고 실제 단계를 가리킨다', () => {
    const doc = baseDocument();
    expect(doc.steps).toHaveLength(1);
    expect(doc.steps.map((step) => step.id)).toContain(doc.startStepId);
  });

  it('최소 하나의 종료 가능 경로를 갖는다', () => {
    const doc = baseDocument();
    const terminal = doc.steps.filter(
      (step) => step.branchRules.length === 0 && step.defaultNextStepId === undefined,
    );
    expect(terminal.length).toBeGreaterThanOrEqual(1);
  });
});

describe('필드 검증 (M2 DoD 3)', () => {
  it.each([
    ['빈 제목', (d: GuideDocument) => (d.meta.title = ''), ISSUE_CODES.TITLE_LENGTH, 'meta.title'],
    [
      '121자 제목',
      (d: GuideDocument) => (d.meta.title = 'ㄱ'.repeat(121)),
      ISSUE_CODES.TITLE_LENGTH,
      'meta.title',
    ],
    [
      '201자 대상 사용자',
      (d: GuideDocument) => (d.meta.audience = 'ㄱ'.repeat(201)),
      ISSUE_CODES.AUDIENCE_LENGTH,
      'meta.audience',
    ],
    [
      '빈 단계 제목',
      (d: GuideDocument) => (d.steps[0]!.title = ''),
      ISSUE_CODES.STEP_TITLE_LENGTH,
      'steps[0].title',
    ],
    [
      '101자 단계 제목',
      (d: GuideDocument) => (d.steps[0]!.title = 'ㄱ'.repeat(101)),
      ISSUE_CODES.STEP_TITLE_LENGTH,
      'steps[0].title',
    ],
  ])('%s → %s @ %s', (_label, change, code, path) => {
    const issue = issueAt(mutate(change), code);
    expect(issue).toBeDefined();
    expect(issue?.path).toBe(path);
    expect(issue?.stage).toBe('field');
  });

  it('20,000자를 넘는 본문 블록을 거부한다', () => {
    const issue = issueAt(
      mutate((d) => {
        const block = d.steps[0]!.blocks[0]!;
        if (block.type === 'text') block.markdown = 'a'.repeat(20_001);
      }),
      ISSUE_CODES.TEXT_BLOCK_TOO_LONG,
    );
    expect(issue?.path).toBe('steps[0].blocks[0].markdown');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ])("링크 URL '%s'를 거부한다", (url) => {
    const issue = issueAt(
      mutate((d) => {
        d.steps[0]!.blocks.push({ id: 'link-1', order: 1, type: 'link', label: 'x', url });
      }),
      ISSUE_CODES.URL_PROTOCOL_NOT_ALLOWED,
    );
    expect(issue?.path).toBe('steps[0].blocks[1].url');
  });

  it.each(['https://example.com', 'http://example.com/a?b=c#d'])(
    '링크 URL %s는 허용한다',
    (url) => {
      const raw = mutate((d) => {
        d.steps[0]!.blocks.push({ id: 'link-1', order: 1, type: 'link', label: 'x', url });
      });
      expect(parseGuideDocument(raw).ok).toBe(true);
    },
  );

  it('URL 형식이 아니면 별도 코드로 보고한다', () => {
    const issue = issueAt(
      mutate((d) => {
        d.steps[0]!.blocks.push({
          id: 'link-1',
          order: 1,
          type: 'link',
          label: 'x',
          url: 'not a url',
        });
      }),
      ISSUE_CODES.URL_MALFORMED,
    );
    expect(issue).toBeDefined();
  });

  it.each(['image/svg+xml', 'text/html', 'application/pdf'])(
    "이미지 MIME '%s'를 거부한다",
    (mimeType) => {
      const issue = issueAt(
        mutate((d) => {
          d.assets.push({
            id: 'asset-1',
            fileName: 'a.svg',
            mimeType,
            byteSize: 10,
            checksum: 'abc',
          });
        }),
        ISSUE_CODES.IMAGE_MIME_NOT_ALLOWED,
      );
      expect(issue?.path).toBe('assets[0].mimeType');
    },
  );

  it('5MB를 넘는 이미지 원본을 거부한다', () => {
    const issue = issueAt(
      mutate((d) => {
        d.assets.push({
          id: 'asset-1',
          fileName: 'a.png',
          mimeType: 'image/png',
          byteSize: 5 * 1024 * 1024 + 1,
          checksum: 'abc',
        });
      }),
      ISSUE_CODES.IMAGE_TOO_LARGE,
    );
    expect(issue?.path).toBe('assets[0].byteSize');
  });

  it('누락 ID를 보고한다', () => {
    const issue = issueAt(
      mutate((d) => (d.steps[0]!.id = '   ')),
      ISSUE_CODES.EMPTY_ID,
    );
    expect(issue?.path).toBe('steps[0].id');
  });

  it('필수 필드가 없으면 MISSING_FIELD로 보고한다', () => {
    const raw = mutate((d) => {
      delete (d.meta as { language?: string }).language;
    });
    const issue = issueAt(raw, ISSUE_CODES.MISSING_FIELD);
    expect(issue?.path).toBe('meta.language');
  });

  it.each([
    [
      'settings.printMode',
      (d: GuideDocument) => ((d.settings as { printMode: string }).printMode = 'nope'),
    ],
    [
      'steps[0].completionMode',
      (d: GuideDocument) =>
        ((d.steps[0] as unknown as { completionMode: string }).completionMode = 'nope'),
    ],
  ])('잘못된 enum %s를 보고한다', (path, change) => {
    const issue = issueAt(mutate(change), ISSUE_CODES.INVALID_ENUM_VALUE);
    expect(issue?.path).toBe(path);
  });
});

describe('중복 ID (M2 DoD 4)', () => {
  it.each([
    ['단계', (d: GuideDocument) => d.steps.push(structuredClone(d.steps[0]!)), 'steps[1].id'],
    [
      '준비물',
      (d: GuideDocument) => {
        const item = { id: 'prep-1', label: 'a', required: true, order: 0 };
        d.preparation.push(item, { ...item, order: 1 });
      },
      'preparation[1].id',
    ],
    [
      '경고',
      (d: GuideDocument) => {
        const w = {
          id: 'warn-1',
          severity: 'info' as const,
          title: 't',
          body: 'b',
          requiresAcknowledgement: false,
          order: 0,
        };
        d.warnings.push(w, { ...w, order: 1 });
      },
      'warnings[1].id',
    ],
    [
      '자산',
      (d: GuideDocument) => {
        const a = {
          id: 'asset-1',
          fileName: 'a.png',
          mimeType: 'image/png',
          byteSize: 1,
          checksum: 'x',
        };
        d.assets.push(a, { ...a });
      },
      'assets[1].id',
    ],
  ])('%s 컬렉션의 중복 ID를 잡는다', (_label, change, path) => {
    const issue = issueAt(mutate(change), ISSUE_CODES.DUPLICATE_ID);
    expect(issue).toBeDefined();
    expect(issue?.path).toBe(path);
    expect(issue?.stage).toBe('document');
  });

  it('한 단계 안 블록 ID 중복도 잡는다', () => {
    const issue = issueAt(
      mutate((d) => d.steps[0]!.blocks.push(structuredClone(d.steps[0]!.blocks[0]!))),
      ISSUE_CODES.DUPLICATE_ID,
    );
    expect(issue?.path).toBe('steps[0].blocks[1].id');
  });

  it('중복이 1건이라도 있으면 검증이 실패한다', () => {
    const raw = mutate((d) => d.steps.push(structuredClone(d.steps[0]!)));
    expect(parseGuideDocument(raw).ok).toBe(false);
  });
});

describe('문서 구조 검증', () => {
  it('단계가 없으면 NO_STEPS', () => {
    const raw = mutate((d) => {
      d.steps = [];
    });
    expect(codesOf(raw)).toContain(ISSUE_CODES.NO_STEPS);
  });

  it('시작 단계가 없으면 START_STEP_NOT_FOUND', () => {
    const raw = mutate((d) => (d.startStepId = 'step-nope'));
    const issue = issueAt(raw, ISSUE_CODES.START_STEP_NOT_FOUND);
    expect(issue?.path).toBe('startStepId');
  });

  it('필수 경고에 확인 문구가 없으면 오류다', () => {
    const raw = mutate((d) =>
      d.warnings.push({
        id: 'warn-1',
        severity: 'danger',
        title: '위험',
        body: '내용',
        requiresAcknowledgement: true,
        order: 0,
      }),
    );
    const issue = issueAt(raw, ISSUE_CODES.WARNING_ACK_LABEL_REQUIRED);
    expect(issue?.path).toBe('warnings[0].acknowledgementLabel');
  });

  it('없는 오류 해결 항목을 참조하면 보고한다', () => {
    const raw = mutate((d) => d.steps[0]!.troubleshootingIds.push('ts-nope'));
    expect(codesOf(raw)).toContain(ISSUE_CODES.TROUBLESHOOTING_REF_NOT_FOUND);
  });

  it('없는 자산을 참조하는 이미지 블록을 보고한다', () => {
    const raw = mutate((d) =>
      d.steps[0]!.blocks.push({
        id: 'img-1',
        order: 1,
        type: 'image',
        assetId: 'asset-nope',
        alt: '설명',
      }),
    );
    expect(codesOf(raw)).toContain(ISSUE_CODES.ASSET_REF_NOT_FOUND);
  });

  /**
   * 하네스 M5 DoD 6 후반부. 빈 `alt`와 장식용 선언을 분리한다.
   *
   * 기술 §2.2.4:235는 이 규칙을 **필드 검증**에 둔다. 내보내기 차단은 INV-05가
   * 이 오류를 받아 자동으로 따라온다.
   */
  it('장식용 선언 없이 alt가 비면 보고한다 (M5 DoD 6)', () => {
    const issue = issueAt(imageBlock({ alt: '' }), ISSUE_CODES.IMAGE_ALT_REQUIRED);
    expect(issue?.path).toBe('steps[0].blocks[1].alt');
    expect(issue?.severity).toBe('error');
    expect(issue?.stage).toBe('field');
  });

  it('장식용으로 선언하면 빈 alt를 통과시킨다 (M5 DoD 6)', () => {
    expect(codesOf(imageBlock({ alt: '', decorative: true }))).not.toContain(
      ISSUE_CODES.IMAGE_ALT_REQUIRED,
    );
  });

  it('장식용 선언이 false면 빈 alt를 그대로 보고한다', () => {
    expect(codesOf(imageBlock({ alt: '', decorative: false }))).toContain(
      ISSUE_CODES.IMAGE_ALT_REQUIRED,
    );
  });

  it('공백만 채운 alt는 장식용 선언 없이는 누락으로 본다', () => {
    expect(codesOf(imageBlock({ alt: '   ' }))).toContain(ISSUE_CODES.IMAGE_ALT_REQUIRED);
  });

  it('alt가 채워져 있으면 선언 없이 통과한다', () => {
    expect(codesOf(imageBlock({}))).not.toContain(ISSUE_CODES.IMAGE_ALT_REQUIRED);
  });

  it('같은 단계에 없는 블록을 분기 기준으로 삼으면 보고한다', () => {
    const raw = mutate((d) =>
      d.steps[0]!.branchRules.push({
        id: 'rule-1',
        sourceBlockId: 'block-nope',
        operator: 'equals',
        value: 'x',
        targetStepId: d.steps[0]!.id,
        priority: 0,
      }),
    );
    expect(codesOf(raw)).toContain(ISSUE_CODES.BRANCH_SOURCE_BLOCK_NOT_FOUND);
  });

  it('잘못된 분기 참조를 임의로 고치지 않는다 (하네스 M2 주의)', () => {
    const raw = mutate((d) =>
      d.steps[0]!.branchRules.push({
        id: 'rule-1',
        operator: 'checked',
        targetStepId: 'step-does-not-exist',
        priority: 0,
      }),
    ) as GuideDocument;
    const outcome = parseGuideDocument(raw);
    // M2는 그래프 대상 존재 여부를 판정하지 않는다. 값도 바꾸지 않는다.
    expect(outcome.ok).toBe(true);
    expect(outcome.document?.steps[0]?.branchRules[0]?.targetStepId).toBe('step-does-not-exist');
  });
});

describe('스키마 버전 (M2 DoD 6·7)', () => {
  it.each([
    ['1.0', 'supported'],
    ['1.1', 'newerMinor'],
    ['2.0', 'unsupportedMajor'],
    ['0.9', 'migrationRequired'],
  ])('%s → %s', (version, status) => {
    expect(assessSchemaVersion({ schemaVersion: version }).status).toBe(status);
  });

  it.each(['1', '1.0.0', 'v1.0', '', 'abc', null, undefined, 10])(
    '형식이 아닌 %s는 malformed',
    (version) => {
      expect(assessSchemaVersion({ schemaVersion: version }).status).toBe('malformed');
    },
  );

  it('높은 major는 UNSUPPORTED_SCHEMA_MAJOR로 중단하고 문서를 만들지 않는다', () => {
    const raw = mutate((d) => ((d as { schemaVersion: string }).schemaVersion = '2.0'));
    const outcome = parseGuideDocument(raw);
    expect(outcome.ok).toBe(false);
    expect(outcome.document).toBeNull();
    expect(outcome.result.issues.map((i) => i.code)).toEqual([
      ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR,
    ]);
  });

  it('높은 major는 전체 파싱조차 시도하지 않는다', () => {
    // 스키마 위반을 함께 넣어도 버전 이슈만 나와야 한다. 판정 순서가 뒤바뀌면
    // 편집 가능한 문서로 강등될 위험이 생긴다.
    const raw = mutate((d) => {
      (d as { schemaVersion: string }).schemaVersion = '2.0';
      d.meta.title = '';
    });
    expect(codesOf(raw)).toEqual([ISSUE_CODES.UNSUPPORTED_SCHEMA_MAJOR]);
  });

  /**
   * DoD 7의 방향은 '스키마에 minor 필드를 더해도 기존 1.0 문서가 통과하는가'다.
   * 입력에 모르는 키가 있어도 통과하는지(= Zod 기본 strip 동작)와는 다른 이야기다.
   *
   * 사본 스키마로는 이것을 확인할 수 없다. optional 필드를 더한 z.object가
   * 기존 값을 통과시키는 것은 자명해서 무엇을 단언해도 참이 된다. 실제로
   * 프로덕션 스키마에 들어간 필드로 봐야 한다 - `ImageBlock.decorative`가
   * M5 보정에서 추가된 그 필드다. (전수 확인은 fixtures.test.ts)
   */
  it('프로덕션 스키마에 minor 호환 필드가 들어와도 그 키 없는 1.0 문서가 통과한다', () => {
    // decorative 키가 아예 없는 1.0 문서다.
    const outcome = parseGuideDocument(imageBlock({}));
    expect(outcome.ok).toBe(true);
    expect(outcome.result.issues).toEqual([]);

    // optional 필드는 없는 채로 남는다. 기본값을 채워 넣어 문서를 바꾸지 않는다.
    const block = outcome.document?.steps[0]?.blocks[1];
    expect(block?.type).toBe('image');
    expect(Object.hasOwn(block!, 'decorative')).toBe(false);

    // 필드를 더했다고 버전을 올리지 않는다. 지금 올리면 마이그레이션이 없는
    // 상태(M8 전)라 기존 1.0 문서가 전부 열리지 않는다.
    expect(SCHEMA_VERSION).toBe('1.0');
  });

  it('meta 스키마는 모르는 키를 버리고 알려진 값은 유지한다', () => {
    const existing = baseDocument().meta;
    expect(guideMetaSchema.safeParse(existing).success).toBe(true);
    expect(guideMetaSchema.safeParse({ ...existing, difficulty: 'hard' }).success).toBe(true);
  });

  it('1.0 문서에 모르는 필드가 있어도 파싱되지만 그 필드는 버려진다', () => {
    const raw = mutate((d) => ((d as unknown as Record<string, unknown>).futureField = 'x'));
    const outcome = parseGuideDocument(raw);
    expect(outcome.ok).toBe(true);
    // 알려진 동작이다. 내보내기에서 이 값이 사라지므로 보존 정책은 M8이 정한다.
    // PROGRESS.md 미결 항목 참조.
    expect((outcome.document as unknown as Record<string, unknown>).futureField).toBeUndefined();
  });

  it('parseSchemaVersion이 major.minor를 분해한다', () => {
    expect(parseSchemaVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(parseSchemaVersion('12.34')).toEqual({ major: 12, minor: 34 });
    expect(parseSchemaVersion('1.0.1')).toBeNull();
  });
});

describe('마이그레이션 인터페이스 (M2 할 일 5)', () => {
  const registry: GuideMigration[] = [
    { from: '0.8', to: '0.9', migrate: (d) => d },
    { from: '0.9', to: SCHEMA_VERSION, migrate: (d) => d },
  ];

  it('현재 버전까지의 경로를 만든다', () => {
    expect(planMigration('0.8', registry)?.map((m) => `${m.from}->${m.to}`)).toEqual([
      '0.8->0.9',
      `0.9->${SCHEMA_VERSION}`,
    ]);
  });

  it('이미 현재 버전이면 빈 경로다', () => {
    expect(planMigration(SCHEMA_VERSION, registry)).toEqual([]);
  });

  it('이어지지 않으면 null을 돌려준다', () => {
    expect(planMigration('0.5', registry)).toBeNull();
  });

  it('순환하는 등록표에서 무한 루프에 빠지지 않는다', () => {
    const cyclic: GuideMigration[] = [
      { from: '0.8', to: '0.9', migrate: (d) => d },
      { from: '0.9', to: '0.8', migrate: (d) => d },
    ];
    expect(planMigration('0.8', cyclic)).toBeNull();
  });
});

describe('URL 판정', () => {
  it.each(['https://example.com', 'http://a.b/c'])('%s 허용', (url) => {
    expect(isAllowedUrl(url)).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'ftp://a.b', 'nope'])(
    '%s 거부',
    (url) => {
      expect(isAllowedUrl(url)).toBe(false);
    },
  );
});

describe('결정론 (M2 DoD 8)', () => {
  it('같은 입력은 같은 이슈 목록을 낸다', () => {
    const raw = mutate((d) => {
      d.meta.title = '';
      d.steps.push(structuredClone(d.steps[0]!));
    });
    const first = JSON.stringify(parseGuideDocument(raw).result.issues);
    const second = JSON.stringify(parseGuideDocument(structuredClone(raw)).result.issues);
    expect(second).toBe(first);
  });

  it('validateGuideDocument와 parseGuideDocument의 판정이 일치한다', () => {
    const doc = baseDocument();
    expect(validateGuideDocument(doc).valid).toBe(parseGuideDocument(doc).ok);
  });
});
