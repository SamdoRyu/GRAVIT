# GRAVIT — Claude Code 진입점

부트캠프 팀 프로젝트용 학습 서비스(기획명 GitVillage, 문서 속 이름 "오피스"). 팀 GitHub 레포의 이슈 · PR을 **읽어서** 3D 사무실로 보여 주고, PR 익명 평가 · 회의 안건 · 도움 요청 · 회고 리포트를 앱 안에서 다룬다. 4명과 여러 Claude Code 세션이 **같은 계약 커밋**을 기준으로 병렬 개발한다.

규칙 상세: `.claude/rules/` (git-workflow · code-quality · security · testing · scope-control). 실행 명령: `README.md`.

## 스택

- **frontend/**: React 19 · TypeScript · Vite · Three.js · React Three Fiber · drei · Zustand. 기존 3D 데모를 재사용한다.
- **backend/**: Java 21 · Spring Boot 4.1 · Spring MVC · Spring Data JPA · Spring Security(서버 세션) · OAuth2 Client · Flyway · MySQL 8.4. 기본 패키지 `com.samdoryu.backend`.
- 로컬: MySQL만 `compose.yaml`, Spring(`:8080`) · Vite(`:5173`, `/api` 프록시)는 직접 실행.

```text
frontend/ backend/ contract/examples/ docs/ compose.yaml .env.example .github/ .claude/
```

## 공통 계약 — 먼저 읽는다

- **기준 계약 커밋: `702a55fd6f199b4d105412f63a2e160e86c9c0e7`** (GRAVIT — `docs/CONTRACTS*.md`를 마지막으로 바꾼 커밋). 사용자가 새 SHA를 주면 그것을 따른다.
- **계약의 기준은 GRAVIT `docs/CONTRACTS.md`(공통 규칙 · Entity · ID · 에러 · 보안) · `docs/CONTRACTS_API.md`(엔드포인트 · DTO)다**(2026-11-03 전환). 기획 저장소의 같은 파일은 `796fc25`까지의 이력일 뿐이다. 전환 상태 · 고정 링크 표 · 역할 대응은 `docs/README.md`.
- `contract/examples/` — 계약 예시 JSON. Java DTO · TS 타입 · 예시 JSON은 한 PR에서 함께 바꾼다.
- **계약을 바꾸지 않는다.** 필드 이름 · 타입 · enum · API 경로 · 상태 코드 · Entity가 계약과 달라야 하면 작업을 멈추고 사용자(문서 담당자)에게 변경을 요청한다. 계약 문서에 없는 계약을 코드에서 먼저 만들지 않는다.

## 프론트엔드 데이터 흐름

- 화면은 `frontend/src/data/DataSource.ts` 인터페이스로만 데이터를 받는다. 화면 코드에서 `fetch`를 직접 부르지 않는다.
- 구현 둘: `src/data/mock/`(기본 — 브라우저 seed + localStorage, 서버 없이 동작) · `src/data/api/`(`?source=api` — `/api/**` + SSE). **지금 api 쪽은 데모 API 기준이라 Spring에 연결되지 않는다**(v1 API 구현 뒤 교체).
- 상태는 `src/store.ts`(Zustand), 공용 규칙은 `src/data/rules/`. 방향: 도메인 데이터 → SceneModel → ThemeLayout → R3F.

## 백엔드 패키지 원칙

- 단일 애플리케이션(모듈형 모놀리스). 도메인 패키지(`[제안]` — ARCHITECTURE.md): `common` · `auth` · `workspace` · `github` · `sync` · `requirement` · `flow` · `evaluation` · `meeting` · `help` · `report` · `activity` · `plan` · `instructor` · `realtime`.
- 패키지마다 controller · service · repository · domain(Entity) · dto. **Controller → Service(트랜잭션) → Repository**, 요청/응답 DTO 분리, Entity 직접 응답 금지. 다른 패키지는 그 Service로만 부른다.
- 스키마는 Flyway(`backend/src/main/resources/db/migration/`)로만 바꾼다.

## 절대 원칙

- **GitHub 원본은 읽기 전용.** 이슈 · PR · 코멘트 · 라벨을 바꾸는 GitHub API 호출을 만들지 않는다. GitHub API는 `github` 패키지에서만 부르고, 토큰은 서버에만 둔다.
- **인증 · 인가**: GitHub OAuth와 심사용 ID/PW 로그인 모두 같은 Spring Security 세션 · CSRF · 인가 검사를 거친다. 요청마다 로그인 → 사무실 접근 → 역할을 검사한다.
- **Workspace 격리**: 사무실 단위 데이터는 항상 사무실 조건으로 조회한다. 권한 없는 사무실 · 다른 사무실 ID는 `404`(IDOR 방어). 심사용 계정은 시연 사무실에만, 강사는 허용 목록(GitHub 사용자 ID) + 사무실 지정이 있을 때만, 강사 쓰기는 요청된 건과 컨벤션 라이브러리에만.
- PR 평가는 익명이다. 개인 지표는 본인과 지정된 강사에게만. 사람별 합계 · 순위는 만들지 않는다.
- secret · 토큰 · 비밀번호를 커밋하거나 출력하지 않는다. `.env`는 읽지 않는다.

## 명령 (자세히는 README)

```powershell
docker compose up -d --wait                          # 루트 — 로컬 MySQL (.env 필요)
cd backend;  .\gradlew.bat test bootJar             # MySQL 필요
cd frontend; npm ci; npm run lint; npm run test:contract; npm run build
npm run dev                                          # :5173, 기본 mock 데이터
```

CI(`.github/workflows/ci.yml`)는 위 프론트 4개와 `./gradlew test bootJar`(MySQL 서비스 컨테이너)를 돌린다. E2E(`npm run test:e2e`)는 로컬에서만.

## Git

- `main` 직접 push 금지. 브랜치 `<type>/<이슈번호>-<설명>` → PR(`Closes #N`, 기준 계약 커밋) → 승인 1명 → squash. 앱의 PR 추천 · 비추천은 머지 승인과 별개다.
- **사용자가 요청하기 전에는 commit · push · PR 생성 · merge를 하지 않는다.**
- 계약 · 기획 문서의 수정과 반영은 문서 담당자가 한다. 코드 PR 흐름과 섞지 않는다.

## AI 협업자 · 기여자 등록 금지 (필수 협업 정책)

Claude Code는 개발 보조 도구이고 팀원이 아니다. Plan 모드 · Auto 모드 모두, Issue · PR · 코드 · 문서 작업 전부에 적용한다.

- Claude Code · AI 계정을 Collaborator · Organization/Team Member · Issue Assignee · CODEOWNERS · PR Reviewer로 지정하지 않는다. 담당자는 사람 팀원 4명뿐이다.
- 커밋 Author · Committer에 AI 계정을 쓰지 않고, `Co-authored-by: Claude …` · `… <noreply@anthropic.com>` 같은 공동 작성자 트레일러나 "Generated with Claude Code" 문구를 커밋 메시지 · PR 본문에 넣지 않는다. 기본 첨부 안내가 있어도 이 정책이 우선한다.
- `git config user.name` · `user.email`을 바꾸지 않는다.
- 리뷰 · 승인 · 최종 반영은 사람이 한다. AI가 사람 팀원을 사칭하거나 리뷰 · 승인을 대신하지 않는다. AI가 쓴 코드도 담당자가 검토하고 책임진다.
- 사용자의 명시적 요청 없이 Collaborator · CODEOWNERS · Assignee · Reviewer 설정을 바꾸지 않는다.

## 병렬 세션 작업 경계

- 한 세션은 한 이슈 · 한 브랜치만 다룬다. 이슈 범위 밖 파일은 고치지 않고 후속 이슈 후보로 보고한다.
- 역할(2026-11-03, 백엔드 재배분 2026-11-05): **A** 총괄 · 기획 · 백엔드 일부(`help` · `meeting` · `report`의 회고 리포트 · Snapshot 조립) · **B** 백엔드 전담(나머지 서버 패키지 · `common` · Security) · **C** 프론트 3D(`src/scene/**` · `src/theme/` · SceneModel · ThemeLayout) · **D** 프론트 HUD · 데이터(`src/data/**` · `store.ts` · `src/ui/` HUD). CONTRACTS.md 「9」 표의 옛 역할 문자(C = 도메인 백엔드)는 쓰지 않는다 — 대응은 `docs/README.md` 「역할」. Issue별 담당은 Issue 본문이 기준이다.
- 다른 세션 · 팀원의 영역을 건드려야 하면 먼저 사용자에게 묻는다. 테이블 · Entity · Service · migration은 만든 사람만 고친다.
- 공유 파일(`docs/`, `contract/examples/`, `backend/.../common/`, `frontend/src/data/DataSource.ts` · `types.ts`, `.github/`, 빌드 설정)은 이슈가 그 변경을 요구할 때만 고친다.

## 디자인 테마

**우주정거장으로 확정했다**(2026-11-04, #76 · #77). v1 테마는 이것 하나이고 다중 테마 엔진은 만들지 않는다.

- 확정 시안: `frontend/public/station/`(정적 데모, three r150). 디자인 참조용이라 원본 11개 파일은 고치지 않는다. 시안의 JS · `data.js` 목업은 계약이 아니다.
- **보이는 모양은 시안, 데이터 · 동작 · API · 권한 · 상태값은 공통 계약**을 따른다. 시안과 계약이 다르면 계약대로 한다 — 클린/스멜이 아니라 `recommend`/`not_recommend`(두 쪽 다 이유 필수 · 작성자 평가 불가 · 평가자 표시 금지), 안건 후보는 48시간 도움 요청뿐(앱이 찾은 이슈 후보 없음).
- 최종 화면은 기존 React · R3F 구조에 다시 구현한다. C는 SceneModel · ThemeLayout(`src/theme/`) · R3F, D는 HUD · DataSource · store. SceneModel · 도메인 로직은 테마를 모른다.
- 작업 포드는 최대 8개(`deskIndex` 0~7): 0~3(시안 K · L · P · C)은 항상, 4~7은 활성 팀원이 그 자리를 쓸 때만 렌더링한다. 자리가 없는 팀원은 3D에 없다(CONTRACTS.md 「10」).
- 머지 준비 선반 F는 장식이다(PR 위치는 CONTRACTS.md 「3」). 요구사항 구역(`requirement:*`)은 시안에 없지만 Must라 C가 정거장 안에 만든다.
- 아바타는 스페이 GLB, 라코(강사)는 보관만. 시안에 없는 새 3D 에셋 · 전체 재디자인을 하지 않는다.
