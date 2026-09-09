#!/usr/bin/env node
/**
 * 모듈 import 경계 검증.
 *
 * 기준: File_Structure.md §3.2 하드 경계, §3.3 살균 경계.
 * 하네스 M1 DoD 5·6·9·10, M7 DoD 10, INV-07, INV-11을 이 스크립트가 판정한다.
 *
 * 소스 해석은 TypeScript 컴파일러 AST로 한다. 직접 렉서를 쓰면 JSX 본문의
 * 아포스트로피나 따옴표를 담은 정규식 리터럴에서 파싱이 어긋나 검사가 조용히
 * 무력화된다. 주석·문자열 안의 import 표기가 실제 import로 오인되는 문제도
 * AST가 구조적으로 막는다.
 *
 * 순수 판정 로직(analyze)과 파일 시스템 접근(main)을 분리해 두었다.
 * analyze는 tests/unit/architecture에서 합성 입력으로 직접 검증한다.
 *
 * Windows·macOS·Linux에서 동일하게 실행되도록 Node API만 사용한다. (하네스 §0.9)
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 계층 규칙은 src/에만, 살균 경계는 스캔 대상 전체에 적용한다. */
const SCAN_ROOTS = ['src', 'tests', 'scripts'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'artifacts',
  'fixtures',
]);

/** D-01 - 통합 전 두 백서에 있던 대체 경로. 존재 자체가 위반이다. */
export const FORBIDDEN_DIRECTORIES = [
  { dir: 'src/components/common', use: 'src/components/ui' },
  { dir: 'src/lib', use: 'src/features/*' },
  { dir: 'src/hooks', use: '소유 feature 내부 (예: src/features/autosave/useAutosave.ts)' },
  { dir: 'src/types', use: 'src/domain/*.types.ts' },
];

/** 편집기 전용 프레임워크·라이브러리. domain에서 금지한다. */
export const EDITOR_ONLY_PACKAGES = [
  'react',
  'react-dom',
  'react-router-dom',
  'zustand',
  'dexie',
  'dexie-react-hooks',
  'react-hook-form',
  '@testing-library/react',
];

/** §3.2-5 - IndexedDB 구현은 storage/가 캡슐화한다. */
export const STORAGE_ONLY_PACKAGES = ['dexie', 'dexie-react-hooks'];

/**
 * §3.2-5 - 브라우저 저장소 전역도 storage/ 안에서만 만진다.
 * 패키지만 막으면 `window.localStorage`를 직접 쓰는 우회가 모든 게이트를
 * 통과한다. 그러면 §4.5.2 키 허용 목록(INV-10)이 강제되는 지점이 사라진다.
 */
export const STORAGE_ONLY_GLOBALS = ['localStorage', 'sessionStorage', 'indexedDB'];

/**
 * M1 DoD 5 - domain은 브라우저 API에 의존하지 않는다.
 * eslint.config.js가 이 목록을 가져다 쓰므로 두 곳이 어긋날 수 없다.
 */
export const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'crypto',
  'matchMedia',
  'requestAnimationFrame',
  'FileReader',
  'atob',
  'btoa',
];

/** 전역 객체를 통한 우회. `globalThis.document` 같은 형태를 잡는다. */
const GLOBAL_CARRIERS = new Set(['globalThis', 'window', 'self']);

/**
 * §7-1, P4 DoD 5 - 키를 만지는 모듈은 프로젝트 전체에서 하나다.
 *
 * 저장 키 문자열이 다른 파일에 나타나면 마스킹·삭제·로그 금지 규칙을 우회하는
 * 두 번째 경로가 생긴 것이다. 상수를 import해 쓰는 것은 막지 않는다 - 막는 것은
 * **리터럴을 다시 적는 일**이다.
 */
export const API_KEY_MODULE = 'src/storage/api-key.store.ts';

/**
 * 우리 네임스페이스 아래의 키 관련 저장 키 리터럴인지 본다.
 *
 * `howsheet:theme` 같은 화면 설정은 걸리지 않고 `howsheet:apiKey`,
 * `howsheet:api-key`, `howsheet:anthropicKey`가 걸린다. 경계 검사에서는
 * 놓치는 것보다 과하게 잡는 쪽이 안전하다.
 */
export function isApiKeyLiteral(value) {
  return value.includes('howsheet:') && /key/i.test(value);
}

/**
 * INV-01, P5 - 전체 키를 읽는 접근자를 부를 수 있는 곳.
 *
 * 이름을 그대로 잡는다. 정의한 자리, 요청을 보내는 자리, 그리고 그 둘을
 * 검사하는 테스트뿐이다. 스토어나 컴포넌트가 이 이름을 부르면 키가 화면 상태로
 * 흘러들 길이 생긴다.
 */
export const API_KEY_READER = 'readForAnthropicRequest';

export const API_KEY_READER_ALLOWED = [
  'src/storage/api-key.store.ts',
  'src/features/synthesize/',
  'tests/unit/api-key/',
];

/** §3.3 - 살균된 Markdown 렌더링 경계는 프로젝트 전체에서 한 곳뿐이다. */
export const SANITIZE_BOUNDARY = 'src/components/content/MarkdownText/';

const DANGEROUS_PROP = 'dangerouslySetInnerHTML';

// ────────────────────────────────────────────────────────────── 파싱

function scriptKindFor(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.tsx' || ext === '.jsx') return ts.ScriptKind.TSX;
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 선언 위치에서 쓰인 이름은 전역 사용이 아니다. */
function isDeclarationName(node) {
  const parent = node.parent;
  if (!parent) return false;
  return (
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent)) &&
      parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node)
  );
}

/** `obj.document`처럼 속성 이름으로 쓰인 경우. 단 globalThis/window 경유는 사용으로 본다. */
function isPlainPropertyName(node) {
  const parent = node.parent;
  if (!parent || !ts.isPropertyAccessExpression(parent) || parent.name !== node) return false;
  const carrier = parent.expression;
  if (ts.isIdentifier(carrier) && GLOBAL_CARRIERS.has(carrier.text)) return false;
  return true;
}

/** 소스에서 import 지정자, 브라우저 전역 사용, 살균 경계 위반 신호를 뽑는다. */
export function parseModule(source, filePath = 'probe.tsx') {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(filePath),
  );

  const imports = [];
  const globals = new Set();
  const apiKeyLiterals = new Set();
  let usesApiKeyReader = false;
  let usesDangerouslySetInnerHTML = false;

  const visit = (node) => {
    // import / export ... from '...'
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }

    // import x = require('...')
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      imports.push(node.moduleReference.expression.text);
    }

    // import('...') / require('...')
    if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const [first] = node.arguments;
      if ((dynamicImport || requireCall) && first && ts.isStringLiteral(first)) {
        imports.push(first.text);
      }
    }

    // dangerouslySetInnerHTML - JSX 속성과 prop 객체 키 양쪽을 본다.
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === DANGEROUS_PROP
    ) {
      usesDangerouslySetInnerHTML = true;
    }
    if (
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      node.name &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === DANGEROUS_PROP
    ) {
      usesDangerouslySetInnerHTML = true;
    }

    // 키 저장 키 리터럴. 템플릿 리터럴도 본다 - 백틱으로 적으면 빠져나간다.
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isApiKeyLiteral(node.text)
    ) {
      apiKeyLiterals.add(node.text);
    }

    // 전체 키 접근자. 선언이든 호출이든 이름이 나오면 잡는다.
    if (ts.isIdentifier(node) && node.text === API_KEY_READER) {
      usesApiKeyReader = true;
    }

    // 브라우저 전역
    // 스코프 분석은 하지 않는다. 지역 선언이 전역 이름을 가려도 참조는 전역
    // 사용으로 본다. 파일 단위 섀도잉 집합으로 완화했더니 파라미터 하나가 파일
    // 전체의 탐지를 무력화해 M1 DoD 5가 뚫렸다. 경계 검사에서는 놓치는 것보다
    // 과하게 잡는 쪽이 안전하다. 도메인 코드는 전역과 겹치는 이름을 피한다.
    if (
      ts.isIdentifier(node) &&
      DOM_GLOBALS.includes(node.text) &&
      !isDeclarationName(node) &&
      !isPlainPropertyName(node)
    ) {
      globals.add(node.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    imports: [...new Set(imports)],
    globals: [...globals],
    apiKeyLiterals: [...apiKeyLiterals],
    usesApiKeyReader,
    usesDangerouslySetInnerHTML,
  };
}

/** import 지정자를 저장소 기준 posix 경로로 바꾼다. 외부 패키지는 null. */
export function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return `src/${specifier.slice(2)}`;
  }
  if (specifier.startsWith('.')) {
    const dir = path.posix.dirname(fromFile);
    return path.posix.normalize(path.posix.join(dir, specifier));
  }
  return null;
}

/** 지정자에서 패키지 이름만 뽑는다. `react-dom/client` → `react-dom`. 내부 경로는 null. */
export function packageRoot(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('node:')) {
    return null;
  }
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? null);
}

/** 이 스크립트가 판정하는 규칙 종류. 요약 줄의 숫자는 여기서 나온다. */
export const RULE_KINDS = [
  'FORBIDDEN_DIRECTORY',
  'DOMAIN_PURITY',
  'UI_DOMAIN_INDEPENDENCE',
  'STORAGE_ENCAPSULATION',
  'SANITIZE_BOUNDARY',
  'API_KEY_BOUNDARY',
  'API_KEY_READER',
];

// ────────────────────────────────────────────────────────────── 판정

/**
 * @param {{files: Array<{path: string, imports?: string[], globals?: string[],
 *          usesDangerouslySetInnerHTML?: boolean}>,
 *          directories?: string[]}} input
 * @returns {Array<{rule: string, file: string, detail: string}>}
 */
export function analyze(input) {
  const files = input.files ?? [];
  const directories = input.directories ?? [];
  const violations = [];

  const add = (rule, file, detail) => {
    // 요약 줄이 실제 검사 항목과 어긋나지 않게 한다. 규칙을 늘리면서 목록에
    // 넣지 않으면 여기서 바로 드러난다.
    if (!RULE_KINDS.includes(rule)) {
      throw new Error(`RULE_KINDS에 없는 규칙입니다: ${rule}`);
    }
    violations.push({ rule, file, detail });
  };

  // D-01 - 금지 디렉터리
  const presentDirs = new Set([...directories, ...files.map((f) => path.posix.dirname(f.path))]);
  for (const { dir, use } of FORBIDDEN_DIRECTORIES) {
    const hit = [...presentDirs].some((d) => d === dir || d.startsWith(`${dir}/`));
    if (hit) {
      add('FORBIDDEN_DIRECTORY', dir, `${dir}는 사용하지 않는다. 대신 ${use}에 둔다. (D-01)`);
    }
  }

  for (const file of files) {
    const imports = file.imports ?? [];
    const globals = file.globals ?? [];
    const inDomain = file.path.startsWith('src/domain/');
    const inUi = file.path.startsWith('src/components/ui/');
    const inStorage = file.path.startsWith('src/storage/');
    const inSrc = file.path.startsWith('src/');

    // domain에는 JSX 파일을 두지 않는다. JSX 런타임이 React를 자동 주입하므로
    // import 문만 보는 검사는 그 경로를 놓친다. `src/domain/x.tsx` 하나로
    // domain 순수성이 조용히 뚫린다.
    if (inDomain && /\.(tsx|jsx)$/.test(file.path)) {
      add(
        'DOMAIN_PURITY',
        file.path,
        'domain에는 JSX 파일을 두지 않는다. JSX 런타임이 React를 자동 주입한다. (M1 DoD 5)',
      );
    }

    for (const specifier of imports) {
      const target = resolveSpecifier(file.path, specifier);
      const pkg = packageRoot(specifier);

      // M1 DoD 5 - domain 순수성
      if (inDomain) {
        if (pkg && EDITOR_ONLY_PACKAGES.includes(pkg)) {
          add('DOMAIN_PURITY', file.path, `domain이 '${specifier}'를 import한다. (M1 DoD 5)`);
        }
        if (target && !target.startsWith('src/domain/')) {
          add(
            'DOMAIN_PURITY',
            file.path,
            `domain이 다른 계층 '${specifier}'를 import한다. (File_Structure.md §3.2-1)`,
          );
        }
      }

      // ui는 도메인을 모른다
      if (inUi && target && target.startsWith('src/domain/')) {
        add(
          'UI_DOMAIN_INDEPENDENCE',
          file.path,
          `components/ui가 '${specifier}'를 import한다. content 이상 계층에 둔다.`,
        );
      }

      // §3.2-5 - 저장소 캡슐화
      if (inSrc && !inStorage && pkg && STORAGE_ONLY_PACKAGES.includes(pkg)) {
        add(
          'STORAGE_ENCAPSULATION',
          file.path,
          `'${specifier}'는 src/storage/ 안에서만 import한다. (File_Structure.md §3.2-5)`,
        );
      }
    }

    // §3.2-5 - 저장소 전역은 src/storage/ 안에서만
    if (inSrc && !inStorage) {
      const hits = globals.filter((name) => STORAGE_ONLY_GLOBALS.includes(name));
      if (hits.length > 0) {
        add(
          'STORAGE_ENCAPSULATION',
          file.path,
          `${hits.join(', ')}은(는) src/storage/ 안에서만 만진다. ` +
            '키 허용 목록을 우회하는 경로가 생긴다. (File_Structure.md §3.2-5, INV-10)',
        );
      }
    }

    // M1 DoD 5 - domain의 브라우저 전역 사용
    if (inDomain && globals.length > 0) {
      add(
        'DOMAIN_PURITY',
        file.path,
        `domain이 브라우저 전역 ${globals.join(', ')}을(를) 사용한다. (M1 DoD 5)`,
      );
    }

    // §7-1 / INV-01 - 키 경계
    const keyLiterals = file.apiKeyLiterals ?? [];
    if (keyLiterals.length > 0 && file.path !== API_KEY_MODULE) {
      add(
        'API_KEY_BOUNDARY',
        file.path,
        `키 저장 키 ${keyLiterals.join(', ')}를 여기서 다시 적는다. ` +
          `${API_KEY_MODULE}에서 상수를 가져다 쓴다. (제품정의 §7-1, P4 DoD 5)`,
      );
    }

    // INV-01 - 전체 키 접근자
    if (
      file.usesApiKeyReader === true &&
      !API_KEY_READER_ALLOWED.some(
        (allowed) => file.path === allowed || file.path.startsWith(allowed),
      )
    ) {
      add(
        'API_KEY_READER',
        file.path,
        `${API_KEY_READER}는 ${API_KEY_READER_ALLOWED.join(', ')}에서만 부른다. ` +
          '여기서 부르면 전체 키가 화면 상태로 흘러들 길이 생긴다. (INV-01)',
      );
    }

    // §3.3 / INV-07 - 살균 경계
    if (file.usesDangerouslySetInnerHTML && !file.path.startsWith(SANITIZE_BOUNDARY)) {
      add(
        'SANITIZE_BOUNDARY',
        file.path,
        `dangerouslySetInnerHTML은 ${SANITIZE_BOUNDARY} 안에서만 사용한다. (INV-07, 기술 §7.1-2)`,
      );
    }
  }

  // 대상이 없는 규칙은 통과가 아니다. 키 모듈이 사라지거나 리터럴이 빠지면
  // 위의 검사가 빈 집합 위에서 돌면서 조용히 통과한다. (하네스 P4 주의)
  if (input.requireApiKeyOwner === true) {
    const owner = files.find((file) => file.path === API_KEY_MODULE);
    if (owner === undefined) {
      add('API_KEY_BOUNDARY', API_KEY_MODULE, '키 모듈이 없다. 이 규칙의 검사 대상이 사라졌다.');
    } else {
      if ((owner.apiKeyLiterals ?? []).length === 0) {
        add(
          'API_KEY_BOUNDARY',
          API_KEY_MODULE,
          '키 모듈에 저장 키 리터럴이 없다. 규칙이 빈 집합 위에서 돈다.',
        );
      }
      if (owner.usesApiKeyReader !== true) {
        add(
          'API_KEY_READER',
          API_KEY_MODULE,
          `키 모듈에 ${API_KEY_READER}가 없다. 이름이 바뀌었다면 규칙도 함께 고친다.`,
        );
      }
    }
  }

  return violations;
}

// ────────────────────────────────────────────────────────────── CLI

async function collectFiles(absoluteDir, relativeDir, out) {
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)) continue;

    const absolute = path.join(absoluteDir, entry.name);
    const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      out.directories.push(relative);
      await collectFiles(absolute, relative, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      const source = await readFile(absolute, 'utf8');
      out.files.push({ path: relative, ...parseModule(source, relative) });
    }
  }
}

async function directoryExists(relative) {
  try {
    return (await stat(path.join(REPO_ROOT, relative))).isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  const collected = { files: [], directories: [] };
  for (const root of SCAN_ROOTS) {
    await collectFiles(path.join(REPO_ROOT, root), root, collected);
  }

  // 파일이 하나도 없는 금지 디렉터리도 잡아낸다.
  for (const { dir } of FORBIDDEN_DIRECTORIES) {
    if (await directoryExists(dir)) collected.directories.push(dir);
  }

  const srcCount = collected.files.filter((f) => f.path.startsWith('src/')).length;
  if (srcCount === 0) {
    console.error('verify:architecture - src/ 아래에서 검사할 소스를 찾지 못했습니다.');
    process.exitCode = 1;
    return;
  }

  const violations = analyze({ ...collected, requireApiKeyOwner: true });

  if (violations.length > 0) {
    console.error(`verify:architecture - 위반 ${violations.length}건\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.file}`);
      console.error(`      ${v.detail}`);
    }
    console.error('\n경계 규칙: docs/HowSheet_v2_제품정의.md §8');
    process.exitCode = 1;
    return;
  }

  console.log(
    `verify:architecture - 통과. 소스 ${collected.files.length}개(src ${srcCount}개), ` +
      `규칙 ${RULE_KINDS.length}종을 검사했습니다.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
