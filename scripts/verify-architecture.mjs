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

/** D-01 — 통합 전 두 백서에 있던 대체 경로. 존재 자체가 위반이다. */
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

/** §3.2-5 — IndexedDB 구현은 storage/가 캡슐화한다. */
export const STORAGE_ONLY_PACKAGES = ['dexie', 'dexie-react-hooks'];

/**
 * D-04 — reader-runtime의 내부 import 허용 목록.
 * 디렉터리 단위가 아니라 모듈 단위로 판정한다. features 전체를 금지하면 리더가
 * 분기 엔진과 살균기를 쓸 수 없고, features 전체를 허용하면 편집기 전용 모듈이
 * 리더 번들에 들어온다.
 */
export const READER_RUNTIME_ALLOWED_PREFIXES = [
  'src/domain/',
  'src/features/branching/',
  'src/features/sanitize/',
  'src/reader-runtime/',
];

/**
 * reader-runtime이 쓸 수 있는 외부 패키지. **기본 거부**다.
 * 금지 목록으로 두면 M2의 zod, M10의 unified/remark처럼 나중에 추가되는
 * 편집기 전용 의존성이 목록에 추가되지 않아 조용히 리더 번들에 들어간다.
 */
export const READER_RUNTIME_ALLOWED_PACKAGES = [];

/** M1 DoD 5 — domain은 브라우저 API에 의존하지 않는다. */
export const DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'fetch',
  'localStorage',
  'sessionStorage',
  'indexedDB',
];

/** 전역 객체를 통한 우회. `globalThis.document` 같은 형태를 잡는다. */
const GLOBAL_CARRIERS = new Set(['globalThis', 'window', 'self']);

/** §3.3 — 살균된 Markdown 렌더링 경계는 프로젝트 전체에서 한 곳뿐이다. */
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

    // dangerouslySetInnerHTML — JSX 속성과 prop 객체 키 양쪽을 본다.
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

    // 브라우저 전역
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

function underAnyPrefix(target, prefixes) {
  return prefixes.some(
    (prefix) => target === prefix.replace(/\/$/, '') || target.startsWith(prefix),
  );
}

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

  const add = (rule, file, detail) => violations.push({ rule, file, detail });

  // D-01 — 금지 디렉터리
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
    const inReaderRuntime = file.path.startsWith('src/reader-runtime/');
    const inUi = file.path.startsWith('src/components/ui/');
    const inStorage = file.path.startsWith('src/storage/');
    const inSrc = file.path.startsWith('src/');

    // INV-11 — reader-runtime은 프레임워크 비의존이다. JSX 파일은 React 런타임을
    // 자동 주입하므로 import 문 없이도 React가 리더 번들에 들어간다.
    if (inReaderRuntime && /\.(tsx|jsx)$/.test(file.path)) {
      add(
        'READER_RUNTIME_BOUNDARY',
        file.path,
        'reader-runtime에는 JSX 파일을 두지 않는다. JSX 런타임이 React를 리더 번들에 넣는다. (INV-11)',
      );
    }

    for (const specifier of imports) {
      const target = resolveSpecifier(file.path, specifier);
      const pkg = packageRoot(specifier);

      // M1 DoD 5 — domain 순수성
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

      // M1 DoD 6·10, INV-11 — reader-runtime 경계
      if (inReaderRuntime) {
        if (pkg && !READER_RUNTIME_ALLOWED_PACKAGES.includes(pkg)) {
          add(
            'READER_RUNTIME_BOUNDARY',
            file.path,
            `reader-runtime이 외부 패키지 '${specifier}'를 import한다. ` +
              '리더 런타임의 패키지 허용 목록은 기본 거부다. 필요하면 ' +
              'READER_RUNTIME_ALLOWED_PACKAGES에 명시적으로 추가한다. (INV-11)',
          );
        }
        if (target && !underAnyPrefix(target, READER_RUNTIME_ALLOWED_PREFIXES)) {
          add(
            'READER_RUNTIME_BOUNDARY',
            file.path,
            `reader-runtime이 허용 목록 밖의 '${specifier}'를 import한다. ` +
              `허용: ${READER_RUNTIME_ALLOWED_PREFIXES.join(', ')} (M1 DoD 6·10, D-04)`,
          );
        }
      }

      // §3.2-7 — ui는 도메인을 모른다
      if (inUi && target && target.startsWith('src/domain/')) {
        add(
          'UI_DOMAIN_INDEPENDENCE',
          file.path,
          `components/ui가 '${specifier}'를 import한다. content 이상 계층에 둔다.`,
        );
      }

      // §3.2-5 — 저장소 캡슐화
      if (inSrc && !inStorage && pkg && STORAGE_ONLY_PACKAGES.includes(pkg)) {
        add(
          'STORAGE_ENCAPSULATION',
          file.path,
          `'${specifier}'는 src/storage/ 안에서만 import한다. (File_Structure.md §3.2-5)`,
        );
      }
    }

    // M1 DoD 5 — domain의 브라우저 전역 사용
    if (inDomain && globals.length > 0) {
      add(
        'DOMAIN_PURITY',
        file.path,
        `domain이 브라우저 전역 ${globals.join(', ')}을(를) 사용한다. (M1 DoD 5)`,
      );
    }

    // §3.3 / INV-07 — 살균 경계
    if (file.usesDangerouslySetInnerHTML && !file.path.startsWith(SANITIZE_BOUNDARY)) {
      add(
        'SANITIZE_BOUNDARY',
        file.path,
        `dangerouslySetInnerHTML은 ${SANITIZE_BOUNDARY} 안에서만 사용한다. (INV-07, 기술 §7.1-2)`,
      );
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
    console.error('verify:architecture — src/ 아래에서 검사할 소스를 찾지 못했습니다.');
    process.exitCode = 1;
    return;
  }

  const violations = analyze(collected);

  if (violations.length > 0) {
    console.error(`verify:architecture — 위반 ${violations.length}건\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.file}`);
      console.error(`      ${v.detail}`);
    }
    console.error('\n경계 규칙: docs/File_Structure.md §3');
    process.exitCode = 1;
    return;
  }

  console.log(
    `verify:architecture — 통과. 소스 ${collected.files.length}개(src ${srcCount}개), 규칙 7종을 검사했습니다.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
