# Security

- secret, token, password, private key를 source code에 넣지 않는다. `.env` · `secrets/` · `*.pem`은 커밋하지 않는다(`.gitignore`). `.env.example`에는 이름과 개발용 예시 값만 둔다.
- `.env` 계열 파일 내용을 읽거나 출력하지 않는다(`.claude/settings.json`이 막는다). 설정 확인은 "설정됨 / 미설정"까지만 한다.
- 로그에 인증정보/개인정보(토큰 · 쿠키 · 세션 ID · 비밀번호 · 이메일)를 남기지 않는다.
- 클라이언트 입력은 server에서 다시 검증한다.
- 인증(authentication)과 인가(authorization)를 구분한다.
- UI에서 버튼을 숨기는 것을 권한 검증으로 간주하지 않는다.
- SQL/query/path/url을 사용자 입력과 단순 문자열 결합하지 않는다.
- 새로운 dependency는 필요성과 유지보수 상태를 확인한 뒤 추가한다.
- 보안에 영향을 주는 변경은 PR의 「영향 범위 / 위험」에 명시한다.
- 테스트를 통과시키려고 Spring Security를 전역으로 끄거나 전역 `permitAll()`을 남기지 않는다.

기준: [`docs/CONTRACTS.md`](../../docs/CONTRACTS.md) 「6. 에러 응답과 Security 규칙」 · [ARCHITECTURE.md 「인증과 권한」](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/ARCHITECTURE.md) (기획 저장소 @796fc25).

## 인증 · 세션 · CSRF

- Spring Security **서버 세션(HttpSession)** 기반이다. 별도 인증 서버 · JWT를 만들지 않는다.
- 로그인 방식은 GitHub OAuth와 보안 심사용 ID/PW 두 가지지만 **세션 · CSRF · 인가는 하나의 Spring Security 설정**을 쓴다. 로그인할 때 세션 ID를 새로 발급하고, 로그아웃은 `POST`만 받는다.
- 세션 쿠키는 `HttpOnly`, HTTPS에서 `Secure`, `SameSite`를 붙인다.
- **CSRF 방어를 켠다.** 모든 상태 변경 요청에 토큰을 요구한다(쿠키 `XSRF-TOKEN` → 헤더 `X-XSRF-TOKEN`). 쓰기 요청의 `Origin`이 `APP_ORIGIN`이 아니면 거부한다.
- 인증 안 된 API 요청은 리다이렉트하지 않고 `401 unauthorized` JSON으로 응답한다.

## 인가 · 사무실(Workspace) 격리 · IDOR

- 요청마다 로그인 → 사무실 접근 → 역할 순서로 검사한다(CONTRACTS.md 「6」 검사 순서). SSE도 연결할 때 같은 검사를 거친다.
- 사무실 단위 데이터는 **항상 사무실 조건으로** 조회한다. 경로의 ID로만 찾지 말고 그 ID가 경로의 사무실 것인지 함께 확인한다 — 다른 사무실 것이면 `404 not_found`(IDOR 방어).
- 권한 없는 사무실은 `404 not_found`로 존재를 숨기고, 사무실 안의 역할 위반은 `403 forbidden_role`이다.
- 역할(레포 관리자 · 참여자)은 GitHub 로그인 때 레포마다 정해 세션에 둔다.
- **강사**: 서버 설정 허용 목록의 **GitHub 사용자 ID**(로그인 이름 아님)이고, 사무실별 강사 지정이 있어야 강사다. 지정 여부는 요청마다 DB에서 확인한다. 허용 목록 계정은 콜라보레이터여도 참여자 · 레포 관리자로 판정하지 않는다. 강사의 쓰기는 **학생이 요청한 건**(도움 요청 답변 · 꼬리질문 · 결정 피드백)과 컨벤션 라이브러리에만 열리고, 나머지는 `forbidden_role`이다.
- **보안 심사용 ID/PW 로그인**: 명시적으로 켠 환경에서만 경로가 있다(기본 꺼짐, 꺼지면 `404`). 심사용 계정은 **시연 사무실(Demo Workspace)에만** 접근한다. 비밀번호는 `PasswordEncoder` 해시로만 저장하고 비밀번호 · 해시를 저장소 · 이슈 · PR에 넣지 않는다. 테스트 계정이라는 이유로 세션 · CSRF · 인가 검사를 건너뛰지 않는다.
- PR 평가는 익명이다. 회차 목록 · Snapshot · 안건 · 리포트 등 어느 응답에도 평가자 · 동료 피드백 작성자를 식별할 값을 넣지 않는다.

## GitHub 연동

- GitHub 토큰은 읽기 전용 최소 권한으로 발급하고, 서버에만 둔다. 브라우저로 내보내지 않는다 (NFR-04).
- **GitHub 원본(이슈 · PR · 코멘트 · 라벨 등)을 바꾸는 GitHub API 호출을 보내지 않는다.** 앱은 GitHub를 읽기만 한다 (CON-02). OAuth 코드 교환 · GitHub App 설치 토큰 발급 같은 인증 요청과 앱 서버 자체 API의 쓰기는 별개다 ([ARCHITECTURE.md 「GitHub 읽기 전용 원칙」](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/ARCHITECTURE.md)).
- GitHub App 키 파일(`*.pem`)은 `secrets/`에만 둔다. 다른 경로에 두거나 커밋하지 않는다.
- 사용자의 GitHub 원본 변경 동작(이슈 · PR 생성 · 닫기 · 병합, 라벨 · 담당자 변경)은 서버가 대신하지 않고 GitHub 웹페이지로 이동시킨다 (P3).
