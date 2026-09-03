/**
 * 스키마 마이그레이션 레지스트리.
 *
 * 기준: 기술 백서 §2.3.5. 하네스 M8 할 일 5, DoD 5·6.
 * 계약(`GuideMigration`, `planMigration`)은 `domain/guide.schema.ts`에 있다.
 *
 * ## 지금 비어 있는 이유
 *
 * `SCHEMA_VERSION`이 `'1.0'`이고 그 앞의 공개 버전이 없다. 올릴 대상이 없는데
 * 단계를 만들면 존재한 적 없는 `0.9` 문서를 위한 코드가 제품에 남는다. 픽션은
 * 검증할 수 없고, 검증할 수 없는 코드는 나중에 지울 근거도 없다.
 *
 * **빈 레지스트리가 마이그레이션 경로를 못 쓰게 만들지는 않는다.** `planMigration`은
 * 레지스트리를 전역이 아니라 **인자**로 받는다. 그래서 실행기(`runMigrations`)는
 * 실제 코드이고, 테스트가 합성 레지스트리를 넣어 성공·실패·경로 없음 세 갈래를
 * 전부 돌린다. 여기가 비어 있다고 DoD 5가 공허해지지 않는다.
 *
 * ## 1.1이 생기면
 *
 * 1. `domain/guide.types.ts`의 `SCHEMA_VERSION`을 올린다.
 * 2. 이 배열에 `{ from: '1.0', to: '1.1', migrate }`를 넣는다.
 * 3. `guide.schema.ts`의 `schemaVersion: z.literal(SCHEMA_VERSION)`이 옛 문서를
 *    거부하므로, 마이그레이션이 **버전 문자열까지** 바꿔 놓아야 한다.
 *
 * 3번이 지금 minor 관용이 실제로는 동작하지 않는 이유다. `assessSchemaVersion`은
 * `1.1`을 `newerMinor`로 통과시키지만 literal이 뒤에서 거부한다. PROGRESS.md
 * 미결 항목에 적혀 있고, 스키마 major/minor를 올리는 것은 AGENTS.md §7 STOP
 * 대상이라 M8이 임의로 풀지 않는다.
 */

import type { GuideMigration } from '../../../domain/guide.schema.ts';

/**
 * `from` 버전에서 다음 버전으로 가는 단계들. 순서는 상관없다.
 * `planMigration`이 `from`을 따라 경로를 만든다.
 */
export const MIGRATION_REGISTRY: readonly GuideMigration[] = [];
