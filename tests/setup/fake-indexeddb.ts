/**
 * 통합 테스트용 IndexedDB 설치.
 *
 * `fake-indexeddb/auto`는 import되는 시점에 전역 `indexedDB`를 채운다. 그런데
 * ESM은 import를 선언 순서대로 평가하므로, 테스트 파일이 `@/storage/db.ts`를
 * 먼저 import하면 Dexie가 전역이 비어 있는 상태로 먼저 평가된다. 그러면
 * `openStorage`가 MissingAPIError를 만나 **조용히 메모리 백엔드로 떨어지고**,
 * IndexedDB 통합 테스트는 실제로 IndexedDB를 한 번도 건드리지 않은 채 통과한다.
 *
 * setupFiles는 테스트 모듈보다 먼저 실행되므로 그 순서 문제가 생기지 않는다.
 * (M3 DoD 8)
 */

import 'fake-indexeddb/auto';
