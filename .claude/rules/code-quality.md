# Code Quality

- 현재 codebase의 패턴을 먼저 따른다.
- 중복을 제거한다는 이유만으로 성급한 추상화를 만들지 않는다. 구현이 하나뿐인 인터페이스 · 팩토리를 만들지 않는다.
- 함수/컴포넌트는 하나의 주된 책임을 갖도록 한다.
- 이름은 구현 방식보다 역할과 의미를 표현한다.
- 불필요한 상태를 만들지 않는다. 파생 가능한 값은 저장 상태로 중복 관리하지 않는다.
- error를 catch한 뒤 무시하지 않는다.
- 외부 데이터의 null/undefined/invalid 가능성을 고려한다.
- magic value가 도메인 의미를 가진다면 상수/타입으로 표현한다.
- 기존 public contract를 바꾸면 호출부 전체를 확인한다.
- 생성 파일을 사람이 수동 편집하지 않는다(lockfile, 이미 적용된 Flyway 마이그레이션 포함).
- 이슈 범위를 넘는 대규모 리팩터링 · 파일 이동을 하지 않는다(`scope-control.md`).

기준 문서: [코드 컨벤션 (BE)](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/%EC%BD%94%EB%93%9C%20%EC%BB%A8%EB%B2%A4%EC%85%98%20%28BE%29.md) · 공통 계약 [`docs/CONTRACTS.md`](../../docs/CONTRACTS.md) · [`docs/CONTRACTS_API.md`](../../docs/CONTRACTS_API.md) · [ARCHITECTURE.md](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/ARCHITECTURE.md) (기획 저장소 @796fc25).

## 백엔드 (`backend/` — Java 21 · Spring Boot 4.1 · Spring MVC · Spring Data JPA · Spring Security 세션 · MySQL 8.4 · Flyway)

**꼭 지킬 것**

- GitHub API는 백엔드의 GitHub 어댑터 패키지(`github`) 안에서만 부르고, GitHub 원본을 바꾸는 호출은 만들지 않는다 (CON-02). 인증용 POST(OAuth 코드 교환 · 설치 토큰 발급)는 별개다.
- GitHub 토큰은 서버에만 둔다. 로그에 토큰 · 쿠키 · 이메일을 남기지 않는다 (NFR-04).
- 권한은 API에서 확인한다(자세한 것은 `security.md`). `X-Actor` 같은 클라이언트 헤더는 인증이 아니다.
- 개인 지표(학습 타임라인 · 회고 리포트 · 기술 결정 카드)는 본인과 강사 요청의 응답에만 담는다. 사람별 합계 · 순위 필드는 만들지 않는다 (NFR-06, FR-FLOW-06, FR-LRN-09).
- 강사는 보기 전용이다. 학생이 요청한 건의 답변 · 꼬리질문 · 결정 피드백과 컨벤션 라이브러리 편집 밖의 강사 쓰기는 `forbidden_role`로 거부한다 (FR-AUTH-08).
- GitHub 동기화 실패는 삼키지 않는다. 마지막 성공 시각과 실패 사유를 남기고 화면은 마지막 데이터로 유지한다 (FR-GH-05, NFR-09).
- 시각은 UTC로 저장 · 응답한다(`Z`로 끝나는 ISO 8601). API의 내부 ID는 문자열이다(Entity는 `Long`).

**구조**

- **Controller → Service → Repository.** Controller는 요청 매핑 · 요청 DTO 검증 · 인가 검사 · 응답 DTO 반환만 한다. 규칙과 트랜잭션(`@Transactional`)은 Service에, 저장은 Spring Data JPA Repository에 둔다. 트랜잭션 경계는 Service 공개 메서드다.
- **요청 DTO와 응답 DTO를 나누고, Entity를 응답으로 바로 내보내지 않는다.** DTO 필드 · 경로 · enum 값은 CONTRACTS_API.md 그대로 쓴다.
- 패키지 사이는 그 패키지의 Service로만 부르고 다른 패키지의 Repository를 직접 쓰지 않는다(`[제안]`).
- 사무실 단위 데이터는 항상 사무실(Workspace) 조건으로 조회 · 저장한다. 쿼리는 매개변수 바인딩만 쓴다.
- 스키마는 Flyway 마이그레이션(`backend/src/main/resources/db/migration/V{n}__{설명}.sql`)으로만 바꾼다. `ddl-auto`로 테이블을 만들지 않는다.
- SSE 알림은 트랜잭션 커밋 뒤에 보낸다.

**에러 응답**: `{ "error": { "code": "...", "message": "..." } }`. code는 소문자 snake — `invalid` · `not_found` · `conflict` · `unavailable` · `unauthorized` · `forbidden_role` · `github_unauthorized` · `github_rate_limited`. 새 code는 계약 변경이다. 전역 예외 처리 한 곳에서 이 모양으로 바꾼다.

**기준값**: 팀 설정 화면에서 바꾸는 값(프로젝트 기간, 막힘 기준 시간)은 `TeamSettings`에서 읽는다. 나머지 숫자는 상수 한 곳(백엔드 한 곳, 화면 계산용 프론트 한 곳)에 모은다.

**이름 (권장)**: 새 타입은 코드 컨벤션 (BE) 용어 표의 영어 이름(`Requirement`, `RequirementLink`, `Submission`, `Evaluation`, `EvaluationRound`, `AgendaItem`, `HelpRequest`, `DecisionCard` 등)을 쓰고, 데모에 이미 있는 이름(`Task`, `Member`, `Meeting`, `DataSource`)은 바꾸지 않는다. 시간 값에는 단위(`reviewWaitHours`), GitHub 번호와 앱 ID는 구분(`githubIssueNumber` ↔ `taskId`).

## 프론트엔드 (`frontend/` — React 19 · TypeScript · Vite · Three.js · React Three Fiber · Zustand)

- 기존 3D 데모(장면 · 카메라 · 드래그 · HUD · DataSource · store)를 재사용한다. 화면을 다시 쓰거나 3D 전체를 리팩터링하지 않는다.
- 화면은 `src/data/DataSource.ts` 인터페이스로만 데이터를 받는다. 화면 코드에서 `fetch('/api/…')`를 직접 부르지 않는다. API 요청은 상대 경로 `/api/**`.
- 전역 상태는 `src/store.ts`(Zustand) 하나다. 새 상태 관리 라이브러리를 들이지 않는다.
- 3D 코드는 첫 화면 번들에 넣지 않는다 — `npm run build`의 `check-bundle`이 막는다(NFR-02).
- 방향은 `도메인 데이터 → SceneModel → ThemeLayout → R3F 렌더링`이다. 디자인 테마는 미확정이므로 테마를 확정하는 변경(새 테마 · 에셋 교체 · 전체 재디자인)을 하지 않는다.
- 컴포넌트 `PascalCase.tsx`, 그 밖의 모듈 `camelCase.ts`(데모 관례). 린터는 oxlint(`.oxlintrc.json`), 포매터는 없다.
