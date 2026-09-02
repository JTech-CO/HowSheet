import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import {
  DOM_GLOBALS as WATCHED_GLOBALS,
  EDITOR_ONLY_PACKAGES,
} from './scripts/verify-architecture.mjs';

// 권위 있는 판정은 scripts/verify-architecture.mjs가 한다. 목록을 그 모듈에서
// 가져와 두 곳이 어긋나지 않게 한다. 서브경로(`react-dom/client`)까지 막아야 하므로
// exact-match인 `paths`가 아니라 glob `patterns`를 쓴다.
const EDITOR_ONLY_PATTERNS = EDITOR_ONLY_PACKAGES.flatMap((name) => [name, `${name}/*`]);

// 브라우저 저장소 API는 storage/ 밖에서 직접 쓰지 않는다. (File_Structure.md §3.2-5)
const STORAGE_GLOBALS = [
  { name: 'localStorage', message: 'src/storage/local-storage.ts를 통해서만 접근한다.' },
  { name: 'sessionStorage', message: 'src/storage/local-storage.ts를 통해서만 접근한다.' },
  { name: 'indexedDB', message: 'src/storage/db.ts를 통해서만 접근한다.' },
];

// domain은 React·브라우저 API에 의존하지 않는다. (하네스 M1 DoD 5)
// 감시 목록은 verify-architecture.mjs가 단독으로 소유한다.
const DOM_GLOBALS = WATCHED_GLOBALS.map((name) => {
  const storage = STORAGE_GLOBALS.find((entry) => entry.name === name);
  return storage ?? { name, message: 'domain은 브라우저 API에 의존하지 않는다.' };
});

export default tseslint.config(
  {
    ignores: [
      'dist*/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'artifacts/**',
      'node_modules/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // React 컴포넌트
  {
    files: ['src/**/*.tsx', 'tests/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // `reset.css`가 모든 목록의 마커를 지운다. Safari/VoiceOver는
      // `list-style: none`이 붙으면 목록 역할까지 없애므로 실제 목록에는
      // `role="list"`를 명시해야 한다. ARIA만 보면 중복이지만 그 중복이
      // 목록 시맨틱을 되살리는 유일한 방법이다. ul·ol의 list만 예외로 둔다.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      // 가로 스크롤되는 코드 블록은 키보드로 스크롤할 수 있어야 한다(WCAG 2.1.1).
      // 그 방법은 `tabindex=0`뿐이다. 스크롤 가능한 영역에 이름을 붙이려고
      // `role="group"`을 함께 쓰므로 그 조합만 허용한다.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['group', 'tabpanel'], allowExpressionValues: true },
      ],
    },
  },
  {
    // .tsx만 보면 `features/autosave/useAutosave.ts`처럼 .ts에 있는 훅이
    // 규칙 밖에 남는다. 그 파일의 eslint-disable 주석도 "rule not found"로
    // 실패한다. 훅 규칙은 확장자가 아니라 훅에 걸어야 한다.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Node에서 실행되는 설정·검증 스크립트
  {
    files: ['*.config.{ts,js}', 'scripts/**/*.mjs', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  // ── 모듈 경계 ─────────────────────────────────────────────────
  // 권위 있는 판정은 scripts/verify-architecture.mjs가 한다. 아래는 편집 중
  // 즉시 피드백을 주기 위한 굵은 deny-list다. (File_Structure.md §3.2)
  {
    // `.tsx`까지 본다. domain에 JSX 파일을 두는 것 자체는 verify:architecture가
    // 막지만, 여기서 확장자를 좁혀 두면 그 파일의 import·전역 검사가 통째로
    // 빠진다.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...DOM_GLOBALS],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: EDITOR_ONLY_PATTERNS,
              message: 'domain은 React·상태·저장소 라이브러리를 import하지 않는다. (M1 DoD 5)',
            },
            {
              group: ['@/*', '!@/domain', '!@/domain/**'],
              message: 'domain은 다른 계층을 import하지 않는다.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/reader-runtime/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: EDITOR_ONLY_PATTERNS,
              message: 'reader-runtime은 편집기 전용 라이브러리를 import하지 않는다. (INV-11)',
            },
            {
              group: ['@/components/**', '@/pages/**', '@/app/**', '@/store/**', '@/storage/**'],
              message: 'reader-runtime은 편집기 계층을 import하지 않는다. (INV-11)',
            },
            {
              group: ['@/features/*', '!@/features/branching', '!@/features/sanitize'],
              message:
                'reader-runtime이 import할 수 있는 feature는 branching과 sanitize뿐이다. (D-04)',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/domain/**'],
              message: 'ui는 도메인 지식을 갖지 않는다. content 이상 계층에 둔다.',
            },
          ],
        },
      ],
    },
  },
  {
    // domain은 위에서 더 넓은 목록으로 이미 제한한다. 여기서 다시 지정하면
    // flat config의 뒤 블록이 앞 블록의 옵션을 통째로 덮어써 domain 규칙이 죽는다.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**', 'src/domain/**'],
    rules: { 'no-restricted-globals': ['error', ...STORAGE_GLOBALS] },
  },

  // 테스트는 콘솔·any 제약을 완화한다.
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
