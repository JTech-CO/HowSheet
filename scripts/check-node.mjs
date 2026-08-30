#!/usr/bin/env node
/**
 * Node 런타임 가드. `preinstall`에서 실행한다.
 *
 * pnpm의 `engine-strict`는 의존성의 engines만 보고 루트 프로젝트의 engines는
 * 강제하지 않는다(2026-08-30 확인). 지원하지 않는 런타임에서 알 수 없는 네이티브
 * 크래시를 만나는 것보다 설치 단계에서 이유와 함께 멈추는 편이 낫다.
 *
 * 차단 대상:
 *   - Node 25.2.0 — `fs.rm(recursive)`가 비ASCII 경로에서 프로세스를 하드 크래시
 *     시킨다(Windows, STATUS_STACK_BUFFER_OVERRUN / 0xC0000409). `vite build`의
 *     출력 디렉터리 정리가 이 호출을 쓰므로 `pnpm build`가 죽는다.
 *     PROGRESS.md 결정 로그 2026-08-30 참조.
 */

import process from 'node:process';

const REQUIRED_MAJOR = 24;
const REQUIRED_MINIMUM = [24, 20, 0];

/** 특정 버전에서만 재현되는 알려진 결함. major 범위와 별개로 항상 막는다. */
const KNOWN_BROKEN = new Map([
  [
    '25.2.0',
    'fs.rm(recursive)이 비ASCII 경로에서 프로세스를 크래시시켜 `pnpm build`가 실패합니다.',
  ],
]);

const raw = process.versions.node;
const [major, minor, patch] = raw.split('.').map(Number);

function fail(reason) {
  console.error('\n✖ 지원하지 않는 Node 런타임입니다.\n');
  console.error(`  현재  : v${raw}`);
  console.error(
    `  필요  : v${REQUIRED_MINIMUM.join('.')} 이상 v${REQUIRED_MAJOR + 1} 미만 (.nvmrc)`,
  );
  console.error(`  이유  : ${reason}\n`);
  console.error('  해결  : fnm use  또는  nvm use   (저장소 루트의 .nvmrc를 읽습니다)');
  console.error(`          없다면 Node ${REQUIRED_MINIMUM.join('.')} LTS를 설치합니다.\n`);
  process.exit(1);
}

const broken = KNOWN_BROKEN.get(raw);
if (broken) fail(broken);

const belowMinimum =
  major < REQUIRED_MINIMUM[0] ||
  (major === REQUIRED_MINIMUM[0] &&
    (minor < REQUIRED_MINIMUM[1] ||
      (minor === REQUIRED_MINIMUM[1] && patch < REQUIRED_MINIMUM[2])));

if (major !== REQUIRED_MAJOR || belowMinimum) {
  fail('이 저장소는 .nvmrc의 LTS 라인에서만 게이트 통과를 보장합니다.');
}
