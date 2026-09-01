#!/usr/bin/env node
/**
 * 의존성 버전 고정 검증.
 *
 * 기준: 하네스 M1 DoD 2("의존성이 정확한 버전으로 고정된다"), `.npmrc`의
 * `save-exact=true`.
 *
 * `.npmrc` 설정만 믿을 수 없다는 것이 M5에서 드러났다. M4와 M5에서 추가한
 * 패키지 8종이 전부 캐럿 범위로 들어왔는데, 어떤 게이트도 그것을 보지 않아
 * 두 phase가 통과했다. 설정은 의도이고 검사는 사실이다.
 *
 * 캐럿·틸드 범위는 `pnpm install`이 도는 시점마다 다른 버전을 가져올 수 있다.
 * 그러면 "이 커밋에서 통과한 게이트"가 재현되지 않는다.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** 정확한 semver만 허용한다. `1.2.3`, `1.2.3-rc.1`은 되고 `^1.2.3`은 안 된다. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** 버전 대신 다른 출처를 가리키는 표기. 범위가 아니므로 통과시킨다. */
const NON_REGISTRY = /^(?:workspace:|link:|file:|catalog:|npm:)/;

export function findLooseVersions(manifest) {
  const loose = [];

  for (const section of SECTIONS) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== 'string') continue;
      if (NON_REGISTRY.test(version)) continue;
      if (EXACT_VERSION.test(version)) continue;
      loose.push({ section, name, version });
    }
  }

  return loose;
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const loose = findLooseVersions(manifest);

  if (loose.length > 0) {
    console.error(`verify:dependencies - 범위로 지정된 의존성 ${loose.length}건\n`);
    for (const entry of loose) {
      console.error(`  [${entry.section}] ${entry.name}: ${entry.version}`);
    }
    console.error(
      '\n정확한 버전으로 고정한다. (하네스 M1 DoD 2)' +
        '\n`pnpm add`가 범위를 남기면 package.json을 고치고 `pnpm install --lockfile-only`를 실행한다.',
    );
    process.exitCode = 1;
    return;
  }

  const counted = SECTIONS.reduce(
    (total, section) => total + Object.keys(manifest[section] ?? {}).length,
    0,
  );
  console.log(`verify:dependencies - 통과. 의존성 ${counted}개가 모두 정확한 버전이다.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
