import { describe, expect, it } from 'vitest';

import {
  canonicalNumber,
  createBasis,
  extractClaimedQuotes,
  extractFacts,
  isSupported,
  type FactCandidate,
} from '@/features/evaluate/facts.ts';

/**
 * 기준: 하네스 P8 DoD 3 - 자료에 없는 사실이 프롬프트에 들어가지 않는다.
 *
 * 두 방향을 함께 본다. 꾸민 사실을 놓치면 DoD 3이 비고, 디자인 수치를 사실로
 * 잡으면 제품정의 §6.2-3("CSS로 옮길 수 있게")을 따른 좋은 프롬프트가 떨어진다.
 */

const values = (facts: FactCandidate[], kind?: FactCandidate['kind']) =>
  facts.filter((fact) => kind === undefined || fact.kind === kind).map((fact) => fact.value);

describe('결과물을 만드는 방법은 사실이 아니다', () => {
  it.each([
    ['CSS 단위', '본문 16px, 제목 1.5rem로 둔다.'],
    ['단위로 끝나는 숫자 목록', '간격 스케일은 4, 8, 16, 24, 32px이다.'],
    ['줄 간격', '줄 간격은 1.6으로 둔다.'],
    ['대비', '대비는 4.5:1 이상이다.'],
    ['본문 폭', '본문 최대 폭 68자.'],
    ['굵기', '강조는 굵기 600으로 한다.'],
    ['목록 번호', '3. 표를 만든다.'],
    ['문서 구조를 세는 수', '7단계를 2열로 나눈다.'],
    ['색 코드', '배경은 #f5f5f5, 본문은 #111이다.'],
  ])('%s', (_, clause) => {
    expect(extractFacts(clause)).toEqual([]);
  });

  it('CSS와 HTML 코드 조각, 글꼴 스택을 사실로 보지 않는다', () => {
    const clause =
      '`@media print`에서 `font-weight: 600`, `<details>`, `--space-2`, ' +
      '`system-ui, "Apple SD Gothic Neo", sans-serif`를 쓴다.';
    expect(extractFacts(clause)).toEqual([]);
  });

  it('웹 기술 이름과 시스템 글꼴 이름은 자료와 무관하다', () => {
    expect(extractFacts('HTML과 SVG로 그리고 Segoe UI와 `viewBox`를 쓴다.')).toEqual([]);
  });
});

describe('꾸미면 티가 나는 토큰을 뽑는다', () => {
  it('디자인 낱말 뒤라도 사실 단위가 붙으면 사실이다', () => {
    expect(values(extractFacts('재시도 간격은 45초로 적는다.'), 'number')).toEqual(['45']);
  });

  it('수치·비율·날짜', () => {
    const facts = extractFacts('월 처리량 48,317건, 만족도 93.7%, 2019년 11월 27일 도입.');
    expect(values(facts, 'number')).toEqual(['48317', '93.7', '2019', '11', '27']);
  });

  it('버전·URL·이메일·도메인', () => {
    const facts = extractFacts(
      'v9.8.7을 쓰고 https://docs.example.org/limits, ops@example.com, status.example.io를 적는다.',
    );
    expect(values(facts, 'version')).toEqual(['9.8.7']);
    expect(values(facts, 'url')).toEqual(['https://docs.example.org/limits']);
    expect(values(facts, 'email')).toEqual(['ops@example.com']);
    expect(values(facts, 'domain')).toEqual(['status.example.io']);
    // URL 안의 숫자나 이름을 다시 세지 않는다.
    expect(values(facts, 'number')).toEqual([]);
  });

  it('명령 코드 조각', () => {
    expect(values(extractFacts('`systemctl restart worker`를 넣는다.'), 'code')).toEqual([
      'systemctl restart worker',
    ]);
  });

  it('대문자가 섞인 이름 - 코드 조각 안에 있어도 본다', () => {
    const facts = extractFacts('Kubernetes와 `Istio` 위에서 돈다.');
    expect(values(facts, 'name')).toEqual(['Kubernetes', 'Istio']);
  });

  it('자료에서 따왔다고 주장하는 인용 - 문장이 둘이어도 끊지 않는다', () => {
    expect(
      values(extractClaimedQuotes('자료의 “모든 요청은 반드시 암호화한다” 문구를 강조한다.')),
    ).toEqual(['모든 요청은 반드시 암호화한다']);
    expect(
      values(
        extractClaimedQuotes(
          '자료에 따르면 “버킷은 정각에 초기화된다. 모든 요금제에 같다”를 적는다.',
        ),
      ),
    ).toEqual(['버킷은 정각에 초기화된다. 모든 요금제에 같다']);
    expect(
      values(extractClaimedQuotes('팀장이 남긴 “책임은 클라이언트에 있다”라는 말을 인용하세요.')),
    ).toEqual(['책임은 클라이언트에 있다']);
  });

  it.each([
    ['"대비"는 디자인 낱말이 아니다', '전월 대비 37% 줄었다.', '37'],
    ['개월은 구조를 세는 수가 아니다', '18개월 동안 운영됐다.', '18'],
    ['대비를 말하지 않는 비율', '읽기와 쓰기의 비율이 8:1이다.', '8'],
    ['아주 큰 px는 내용이다', '가로 4000px를 넘는 사진.', '4000'],
    ['숫자만 있는 # 번호', '장애 티켓 #4821에서 시작됐다.', '4821'],
    ['점으로 적은 날짜', '- 2026. 7. 13. 개발 착수', '2026'],
  ])('%s', (_, clause, number) => {
    expect(values(extractFacts(clause), 'number')).toContain(number);
  });

  it.each([
    ['HTTP 헤더는 CSS 선언이 아니다', '`X-RateLimit-Limit: 1000`'],
    ['명령 옵션은 사용자 정의 속성이 아니다', '`--clean`'],
    ['주소를 담은 태그', '`<img src="https://example.com/logo.png">`'],
    ['퍼센트만 적은 코드', '`87%`'],
  ])('%s', (_, clause) => {
    expect(values(extractFacts(clause), 'code')).toHaveLength(1);
  });

  it('지어낸 갱신식', () => {
    expect(values(extractFacts('모멘텀 식 v ← β · v + η · g도 설명한다'), 'code')).toEqual([
      'v ← β · v + η · g',
    ]);
  });

  it('숫자에 단위를 달아 둔다', () => {
    expect(extractFacts('노드 3대로 이중화')).toEqual([{ kind: 'number', value: '3', unit: '대' }]);
  });
});

describe('자료와 대조한다', () => {
  const basis = createBasis([
    'Pro 요금제는 분당 1,000회다. v2.4.1부터 `rate-limit.yaml`을 본다.\n자료 인용 문장이다.',
  ]);

  it('숫자를 쉼표·앞자리 0과 무관하게 맞춘다', () => {
    expect(canonicalNumber('1,000')).toBe('1000');
    expect(canonicalNumber('08')).toBe('8');
    expect(isSupported({ kind: 'number', value: '1000', unit: '회' }, basis)).toBe(true);
    expect(isSupported({ kind: 'number', value: '1001' }, basis)).toBe(false);
  });

  it('자료의 숫자는 단위가 달라도 단위 없이 적힌 표 칸이면 근거가 된다', () => {
    const table = createBasis(['| Free | 100 | 20 |']);
    expect(isSupported({ kind: 'number', value: '100', unit: '회' }, table)).toBe(true);
    expect(isSupported({ kind: 'number', value: '1000', unit: '회' }, basis)).toBe(true);
    expect(isSupported({ kind: 'number', value: '1000', unit: '건' }, basis)).toBe(false);
  });

  it('규칙 문구의 숫자는 단위까지 같아야 근거가 된다', () => {
    const rules = createBasis(['## 3. 결과물\n외부 요청이 0건이어야 한다.'], true);
    expect(isSupported({ kind: 'number', value: '0', unit: '건' }, rules)).toBe(true);
    // "## 3."의 3이 "노드 3대"를 허락하지 않는다.
    expect(isSupported({ kind: 'number', value: '3', unit: '대' }, rules)).toBe(false);
  });

  it('버전은 버전으로만 맞춘다 - 다른 숫자의 부분 문자열이 버전을 허락하지 않는다', () => {
    expect(isSupported({ kind: 'version', value: '2.4.1' }, basis)).toBe(true);
    expect(isSupported({ kind: 'version', value: '4.1' }, basis)).toBe(false);
    expect(isSupported({ kind: 'version', value: '9.8.7' }, basis)).toBe(false);
    // 버전 안의 숫자를 따로 세지 않는다.
    expect(isSupported({ kind: 'number', value: '1' }, basis)).toBe(false);
  });

  it('이름은 대소문자와 무관하게, 인용은 공백과 무관하게', () => {
    expect(isSupported({ kind: 'name', value: 'PRO' }, basis)).toBe(true);
    expect(isSupported({ kind: 'code', value: 'rate-limit.yaml' }, basis)).toBe(true);
    expect(isSupported({ kind: 'quote', value: '자료 인용 문장이다.' }, basis)).toBe(true);
    expect(isSupported({ kind: 'quote', value: '없는 문장' }, basis)).toBe(false);
  });
});
