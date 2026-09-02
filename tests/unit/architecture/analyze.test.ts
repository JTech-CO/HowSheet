import { describe, expect, it } from 'vitest';

import {
  DOM_GLOBALS,
  EDITOR_ONLY_PACKAGES,
  FORBIDDEN_DIRECTORIES,
  READER_RUNTIME_ALLOWED_PACKAGES,
  READER_RUNTIME_ALLOWED_PREFIXES,
  analyze,
  packageRoot,
  parseModule,
  resolveSpecifier,
} from '../../../scripts/verify-architecture.mjs';

type Violation = { rule: string; file: string; detail: string };

const rulesOf = (v: Violation[]) => v.map((x) => x.rule);

const file = (path: string, imports: string[] = [], extra: Record<string, unknown> = {}) => ({
  path,
  imports,
  globals: [] as string[],
  usesDangerouslySetInnerHTML: false,
  ...extra,
});

/** 실제 소스를 파싱해 그대로 판정에 넣는다. 파서와 규칙을 함께 검증한다. */
const analyzeSource = (path: string, source: string) =>
  analyze({ files: [{ path, ...parseModule(source, path) }] }) as Violation[];

describe('domain 순수성 (하네스 M1 DoD 5)', () => {
  // import 문만 보는 검사는 JSX 자동 주입을 놓친다. reader-runtime에는 이미
  // 같은 규칙이 있었는데 domain에는 없어, `.tsx` 파일 하나로 뚫리는 상태였다.
  it.each(['src/domain/guide.view.tsx', 'src/domain/guide.view.jsx'])(
    "domain에 JSX 파일 '%s'를 두면 실패한다",
    (path) => {
      const v = analyze({ files: [file(path)] }) as Violation[];
      expect(rulesOf(v)).toContain('DOMAIN_PURITY');
    },
  );

  it('domain의 .ts 파일은 그 자체로 위반이 아니다', () => {
    expect(analyze({ files: [file('src/domain/guide.types.ts')] })).toEqual([]);
  });

  it.each(['react', 'react-dom', 'zustand', 'dexie', 'react-hook-form'])(
    "domain이 '%s'를 import하면 실패한다",
    (pkg) => {
      const v = analyze({ files: [file('src/domain/guide.schema.ts', [pkg])] }) as Violation[];
      expect(rulesOf(v)).toContain('DOMAIN_PURITY');
    },
  );

  // 정확 일치로 판정하면 React 19의 표준 진입점이 그대로 통과한다.
  it.each([
    'react-dom/client',
    'react/jsx-runtime',
    'zustand/middleware',
    'dexie/dist/dexie.js',
    'dexie-react-hooks',
    '@testing-library/react/pure',
  ])("domain이 서브경로 '%s'를 import해도 실패한다", (spec) => {
    const v = analyze({ files: [file('src/domain/guide.schema.ts', [spec])] }) as Violation[];
    expect(rulesOf(v)).toContain('DOMAIN_PURITY');
  });

  it.each(['window', 'document', 'localStorage', 'indexedDB', 'fetch'])(
    "domain이 브라우저 전역 '%s'를 사용하면 실패한다",
    (name) => {
      const v = analyze({
        files: [file('src/domain/guide.defaults.ts', [], { globals: [name] })],
      }) as Violation[];
      expect(rulesOf(v)).toContain('DOMAIN_PURITY');
    },
  );

  it('전역을 호출하지 않고 참조만 해도 잡는다', () => {
    const v = analyzeSource('src/domain/a.ts', 'const w = window;\nexport const x = [w];\n');
    expect(rulesOf(v)).toContain('DOMAIN_PURITY');
  });

  it('globalThis 경유 우회를 잡는다', () => {
    const v = analyzeSource('src/domain/a.ts', 'export const t = globalThis.document.title;\n');
    expect(rulesOf(v)).toContain('DOMAIN_PURITY');
  });

  it('따옴표를 담은 정규식 리터럴이 뒤의 전역 사용을 가리지 않는다', () => {
    const source = [
      'const QUOTE_RE = /[\'"]/g;',
      'export const t = document.title.replace(QUOTE_RE, "");',
    ].join('\n');
    const v = analyzeSource('src/domain/a.ts', source);
    expect(rulesOf(v)).toContain('DOMAIN_PURITY');
  });

  it('domain이 다른 계층을 import하면 실패한다', () => {
    const v = analyze({
      files: [file('src/domain/guide.types.ts', ['@/storage/db'])],
    }) as Violation[];
    expect(rulesOf(v)).toContain('DOMAIN_PURITY');
  });

  it('domain 내부 모듈끼리는 상대 경로로 import할 수 있다', () => {
    const v = analyze({
      files: [file('src/domain/guide.schema.ts', ['./guide.types', '@/domain/validation.types'])],
    });
    expect(v).toEqual([]);
  });

  it('node: 내장 모듈은 허용한다', () => {
    const v = analyze({ files: [file('src/domain/guide.types.ts', ['node:crypto'])] });
    expect(v).toEqual([]);
  });
});

describe('reader-runtime 경계 (하네스 M1 DoD 6·10, INV-11)', () => {
  it.each([
    '@/components/editor/StepEditor/StepEditor',
    '@/store/guide.store',
    '@/storage/db',
    '@/pages/EditorPage/EditorPage',
    '@/app/router',
    '../store/guide.store',
  ])("reader-runtime이 '%s'를 import하면 실패한다", (spec) => {
    const v = analyze({
      files: [file('src/reader-runtime/reader-renderer.ts', [spec])],
    }) as Violation[];
    expect(rulesOf(v)).toContain('READER_RUNTIME_BOUNDARY');
  });

  it('허용 목록은 디렉터리가 아니라 모듈 단위로 판정한다 - features/autosave는 거부', () => {
    const v = analyze({
      files: [file('src/reader-runtime/reader-state.ts', ['@/features/autosave/autosave.service'])],
    }) as Violation[];
    expect(rulesOf(v)).toContain('READER_RUNTIME_BOUNDARY');
  });

  // 경로만 보는 판정이다. `markdown-to-html`은 이 목록에 넣지 않는다 - 경로는
  // 허용이지만 전이 검사가 거부한다. 대상 모듈 파일이 없는 합성 입력에서는
  // BFS가 즉시 멈춰 위반 0건이 나오므로, 여기에 두면 사실과 반대되는 것을
  // 단언하게 된다. 그 경우는 아래 전이 describe에서 중간 모듈까지 넣고 본다.
  it.each([
    '@/features/branching/branch-engine',
    '@/features/branching/path-calculator',
    '@/features/sanitize/sanitize-html',
    '@/domain/guide.types',
    './reader-storage',
  ])("reader-runtime이 '%s'를 경로 기준으로 import하는 것은 허용한다", (spec) => {
    const v = analyze({ files: [file('src/reader-runtime/reader-renderer.ts', [spec])] });
    expect(v).toEqual([]);
  });

  // 외부 패키지는 기본 거부다. 금지 목록이면 M2의 zod, M10의 unified가 조용히 통과한다.
  it.each(['react', 'react-dom/client', 'zod', 'unified', 'remark-parse', '@tiptap/core'])(
    "reader-runtime이 외부 패키지 '%s'를 import하면 실패한다",
    (spec) => {
      const v = analyze({ files: [file('src/reader-runtime/index.ts', [spec])] }) as Violation[];
      expect(rulesOf(v)).toContain('READER_RUNTIME_BOUNDARY');
    },
  );

  it('node: 내장 모듈은 reader-runtime에서도 허용한다', () => {
    const v = analyze({ files: [file('src/reader-runtime/index.ts', ['node:crypto'])] });
    expect(v).toEqual([]);
  });

  it('reader-runtime에 JSX 파일을 두면 실패한다 (JSX 런타임이 React를 끌어온다)', () => {
    const v = analyze({ files: [file('src/reader-runtime/reader-renderer.tsx')] }) as Violation[];
    expect(rulesOf(v)).toContain('READER_RUNTIME_BOUNDARY');
  });

  it('허용 목록은 D-04가 정한 네 경로다', () => {
    expect(READER_RUNTIME_ALLOWED_PREFIXES).toEqual([
      'src/domain/',
      'src/features/branching/',
      'src/features/sanitize/',
      'src/reader-runtime/',
    ]);
  });

  // 정확 동등이다. `toContain`으로 완화하면 허용 목록이 조용히 자란다. (D-12)
  it('외부 패키지 허용 목록은 dompurify 하나뿐이다', () => {
    expect(READER_RUNTIME_ALLOWED_PACKAGES).toEqual(['dompurify']);
  });
});

/**
 * D-11 전이 검사.
 *
 * 결정 로그는 "전이 zod 유입을 탐지 확인"이라고 적었지만 그것을 고정한 테스트가
 * 없었다. 확인은 1회성이고 테스트만 규칙을 지킨다.
 *
 * 합성 입력에 **중간 모듈 파일까지 넣는 것**이 핵심이다. BFS는 `files` 집합
 * 안에서만 해석하므로, 대상 모듈이 없으면 즉시 멈춰 위반 0건이 나온다.
 */
describe('reader-runtime 전이 의존 (D-11, INV-11)', () => {
  const sanitizeHtml = file('src/features/sanitize/sanitize-html.ts', [
    'dompurify',
    '../../domain/guide.types.ts',
  ]);
  const markdownToHtml = file('src/features/sanitize/markdown-to-html.ts', [
    'unified',
    'remark-parse',
    'remark-gfm',
    'remark-rehype',
    'rehype-stringify',
    './sanitize-html.ts',
  ]);
  const guideTypes = file('src/domain/guide.types.ts', []);
  const guideSchema = file('src/domain/guide.schema.ts', ['zod', './guide.types.ts']);

  const packagesFlagged = (violations: Violation[]) =>
    violations
      .filter((v) => v.rule === 'READER_RUNTIME_BOUNDARY')
      .map((v) => v.detail.match(/외부 패키지 '([^']+)'/)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort();

  it('markdown-to-html을 거치면 remark 계열이 전부 걸린다', () => {
    const v = analyze({
      files: [
        file('src/reader-runtime/reader-renderer.ts', ['../features/sanitize/markdown-to-html.ts']),
        markdownToHtml,
        sanitizeHtml,
        guideTypes,
      ],
    }) as Violation[];

    // dompurify는 D-12로 허용됐으므로 여기 없다. remark 계열 5종이 남는다.
    expect(packagesFlagged(v)).toEqual([
      'rehype-stringify',
      'remark-gfm',
      'remark-parse',
      'remark-rehype',
      'unified',
    ]);
    // 어느 모듈을 거쳐 들어왔는지 보고한다. 그것이 없으면 고칠 곳을 못 찾는다.
    expect(v.some((entry) => entry.detail.includes('markdown-to-html.ts'))).toBe(true);
  });

  // D-12의 핵심 주장. `markdown-to-html.ts`는 막히고 `sanitize-html.ts`는 통과한다.
  it('sanitize-html만 거치면 위반이 없고 remark가 따라오지 않는다', () => {
    const v = analyze({
      files: [
        file('src/reader-runtime/reader-renderer.ts', ['../features/sanitize/sanitize-html.ts']),
        markdownToHtml,
        sanitizeHtml,
        guideTypes,
      ],
    }) as Violation[];

    expect(v).toEqual([]);
    expect(packagesFlagged(v)).toEqual([]);
  });

  it('D-11의 원래 사례 - guide.schema를 거친 zod 유입을 잡는다', () => {
    const v = analyze({
      files: [
        file('src/reader-runtime/reader-state.ts', ['../domain/guide.schema.ts']),
        guideSchema,
        guideTypes,
      ],
    }) as Violation[];

    expect(packagesFlagged(v)).toEqual(['zod']);
  });

  it('guide.types만 거치면 아무것도 딸려오지 않는다', () => {
    const v = analyze({
      files: [file('src/reader-runtime/reader-state.ts', ['../domain/guide.types.ts']), guideTypes],
    });
    expect(v).toEqual([]);
  });
});

describe('금지 디렉터리 (하네스 M1 DoD 9, D-01)', () => {
  // 구현 상수에서 목록을 끌어오면 항목이 사라져도 테스트가 조용히 통과한다.
  const EXPECTED = ['src/components/common', 'src/lib', 'src/hooks', 'src/types'];

  it('금지 목록은 M1 DoD 9가 명시한 네 경로다', () => {
    expect(FORBIDDEN_DIRECTORIES.map((d: { dir: string }) => d.dir)).toEqual(EXPECTED);
  });

  it.each(EXPECTED)("'%s'가 존재하면 실패한다", (dir) => {
    const v = analyze({ files: [], directories: [dir] }) as Violation[];
    expect(rulesOf(v)).toContain('FORBIDDEN_DIRECTORY');
  });

  it('금지 디렉터리 안의 파일로도 탐지된다', () => {
    const v = analyze({ files: [file('src/lib/branching/engine.ts')] }) as Violation[];
    expect(rulesOf(v)).toContain('FORBIDDEN_DIRECTORY');
  });

  it('허용 디렉터리는 통과한다', () => {
    const v = analyze({
      files: [],
      directories: ['src/components/ui', 'src/features', 'src/domain'],
    });
    expect(v).toEqual([]);
  });
});

describe('그 밖의 경계', () => {
  it('components/ui는 domain을 import할 수 없다 (§3.2-7)', () => {
    const v = analyze({
      files: [file('src/components/ui/Button/Button.tsx', ['@/domain/guide.types'])],
    }) as Violation[];
    expect(rulesOf(v)).toContain('UI_DOMAIN_INDEPENDENCE');
  });

  it.each(['dexie', 'dexie/dist/dexie.js', 'dexie-react-hooks'])(
    "'%s'는 storage 밖에서 import할 수 없다 (§3.2-5)",
    (spec) => {
      const v = analyze({ files: [file('src/store/guide.store.ts', [spec])] }) as Violation[];
      expect(rulesOf(v)).toContain('STORAGE_ENCAPSULATION');
    },
  );

  it('storage 안에서는 dexie를 import할 수 있다', () => {
    const v = analyze({ files: [file('src/storage/db.ts', ['dexie'])] });
    expect(v).toEqual([]);
  });

  it('테스트 파일은 저장소 캡슐화 규칙에서 제외된다', () => {
    const v = analyze({ files: [file('tests/integration/storage/db.test.ts', ['dexie'])] });
    expect(v).toEqual([]);
  });
});

describe('살균 경계 (INV-07, 기술 §7.1-2)', () => {
  it('dangerouslySetInnerHTML은 MarkdownText 밖에서 금지된다', () => {
    const v = analyzeSource(
      'src/components/content/CodeBlock/CodeBlock.tsx',
      'export const C = () => <div dangerouslySetInnerHTML={{ __html: h }} />;\n',
    );
    expect(rulesOf(v)).toContain('SANITIZE_BOUNDARY');
  });

  it('JSX 본문의 아포스트로피가 검사를 무력화하지 않는다', () => {
    const source = [
      'export const C = () => (',
      '  <figure>',
      "    <figcaption>Here's the code</figcaption>",
      '    <div dangerouslySetInnerHTML={{ __html: h }} />',
      '  </figure>',
      ');',
    ].join('\n');
    const v = analyzeSource('src/components/content/CodeBlock/CodeBlock.tsx', source);
    expect(rulesOf(v)).toContain('SANITIZE_BOUNDARY');
  });

  it('prop 객체 키 형태도 잡는다', () => {
    const v = analyzeSource(
      'src/components/content/CodeBlock/CodeBlock.tsx',
      'const props = { dangerouslySetInnerHTML: { __html: h } };\nexport default props;\n',
    );
    expect(rulesOf(v)).toContain('SANITIZE_BOUNDARY');
  });

  it('MarkdownText 안에서는 허용된다', () => {
    const v = analyzeSource(
      'src/components/content/MarkdownText/MarkdownText.tsx',
      'export const M = () => <div dangerouslySetInnerHTML={{ __html: h }} />;\n',
    );
    expect(v).toEqual([]);
  });
});

describe('파서', () => {
  it('여러 형태의 import 지정자를 모두 수집한다', () => {
    const parsed = parseModule(
      [
        "import a from 'alpha';",
        "import { b } from './beta';",
        "import 'side-effect.css';",
        "export { c } from '@/gamma';",
        "const d = await import('./delta');",
        "const e = require('epsilon');",
      ].join('\n'),
      'probe.ts',
    );
    expect([...parsed.imports].sort()).toEqual(
      ['./beta', './delta', '@/gamma', 'alpha', 'epsilon', 'side-effect.css'].sort(),
    );
  });

  it('type-only import도 수집한다', () => {
    const parsed = parseModule("import type { X } from '@/domain/guide.types';", 'probe.ts');
    expect(parsed.imports).toEqual(['@/domain/guide.types']);
  });

  it('주석과 문자열 안의 import 표기는 import가 아니다', () => {
    const source = [
      '/**',
      ' * @example',
      " * import { useGuide } from '@/store/guide.store';",
      ' */',
      'const note = "import \'dexie\'";',
      'export const x = note;',
    ].join('\n');
    const parsed = parseModule(source, 'src/domain/a.ts');
    expect(parsed.imports).toEqual([]);
    expect(analyze({ files: [{ path: 'src/domain/a.ts', ...parsed }] })).toEqual([]);
  });

  it('주석과 문자열 안의 식별자는 전역 사용으로 세지 않는다', () => {
    const parsed = parseModule(
      ['// document.title 을 만지지 않는다', "export const s = 'window.alert(1)';"].join('\n'),
      'probe.ts',
    );
    expect(parsed.globals).toEqual([]);
  });

  it('실제 전역 사용은 잡아낸다', () => {
    expect(parseModule('const t = document.title;', 'probe.ts').globals).toContain('document');
    expect(parseModule('localStorage.getItem("k");', 'probe.ts').globals).toContain('localStorage');
  });

  it('속성 접근은 전역 사용이 아니다', () => {
    expect(parseModule('const t = ctx.document.title;', 'probe.ts').globals).toEqual([]);
  });

  it('선언 이름 자체는 전역 사용으로 세지 않는다', () => {
    expect(parseModule('const document = 1;\nexport default 2;', 'probe.ts').globals).toEqual([]);
  });

  // 스코프 분석은 하지 않는다. 파일 단위 섀도잉 집합으로 완화했더니 파라미터
  // 하나가 파일 전체의 탐지를 무력화해 M1 DoD 5가 실제로 뚫렸다.
  it('전역 이름을 가리는 지역 식별자도 보수적으로 사용으로 본다', () => {
    expect(parseModule('function f(document) { return document; }', 'probe.ts').globals).toContain(
      'document',
    );
  });

  it('한 함수에서 가려도 다른 함수의 실제 전역 접근을 놓치지 않는다', () => {
    const source = [
      'function touch(document) { return document.id; }',
      "export function leak() { document.body.innerHTML = 'x'; }",
    ].join('\n');
    expect(parseModule(source, 'probe.ts').globals).toContain('document');
  });

  it('globalThis 구조분해 우회를 잡는다', () => {
    const source = ['const { document: d } = globalThis;', 'export const x = d.title;'].join('\n');
    expect(parseModule(source, 'probe.ts').globals).toContain('document');
  });

  it('crypto 등 확장된 감시 목록도 잡는다', () => {
    expect(parseModule('export const id = crypto.randomUUID();', 'probe.ts').globals).toContain(
      'crypto',
    );
    expect(parseModule('export const h = location.href;', 'probe.ts').globals).toContain(
      'location',
    );
  });

  it('선언이 없으면 전역 사용으로 잡는다', () => {
    expect(parseModule('export const t = document.title;', 'probe.ts').globals).toContain(
      'document',
    );
    expect(parseModule('export const w = window;', 'probe.ts').globals).toContain('window');
    expect(parseModule('export const r = fetch(url);', 'probe.ts').globals).toContain('fetch');
  });

  it('감시 목록에 도메인이 피해야 할 API가 모두 들어 있다', () => {
    for (const name of [
      'window',
      'document',
      'navigator',
      'location',
      'fetch',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'crypto',
    ]) {
      expect(DOM_GLOBALS).toContain(name);
    }
  });
});

describe('지정자 해석', () => {
  it.each([
    [
      'src/domain/a.ts',
      '@/features/branching/branch-engine',
      'src/features/branching/branch-engine',
    ],
    ['src/reader-runtime/reader-renderer.ts', './reader-state', 'src/reader-runtime/reader-state'],
    ['src/reader-runtime/reader-renderer.ts', '../store/guide.store', 'src/store/guide.store'],
    ['src/domain/a.ts', 'react', null],
  ])('%s + %s -> %s', (from, spec, expected) => {
    expect(resolveSpecifier(from, spec)).toBe(expected);
  });

  it.each([
    ['react-dom/client', 'react-dom'],
    ['react', 'react'],
    ['@testing-library/react/pure', '@testing-library/react'],
    ['dexie/dist/dexie.js', 'dexie'],
    ['./local', null],
    ['@/domain/x', null],
    ['node:fs', null],
  ])('packageRoot(%s) -> %s', (spec, expected) => {
    expect(packageRoot(spec)).toBe(expected);
  });

  it('편집기 전용 패키지 목록에 서브경로가 있는 패키지들이 들어 있다', () => {
    expect(EDITOR_ONLY_PACKAGES).toContain('react-dom');
    expect(EDITOR_ONLY_PACKAGES).toContain('dexie-react-hooks');
  });
});
