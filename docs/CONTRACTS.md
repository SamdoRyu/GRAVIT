<!-- GRAVIT 이전 정보 (이 블록은 GRAVIT에서 추가했다. 본문은 원본을 옮긴 뒤 GRAVIT에서 고친 곳이 있다 — docs/README.md 「GRAVIT에서 고친 곳」)
  원본: SamdoRyu/docs-for-PJ-review @ 796fc25b459cd4a25af89e085c093f4e2c25f5b0 — docs/CONTRACTS.md
  이전일: 2026-11-03
  기준 위치 전환 절차: docs/README.md
-->
> **[GRAVIT 이전본]** 원본 [docs-for-PJ-review@796fc25 `docs/CONTRACTS.md`](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/CONTRACTS.md) 를 옮겼다(2026-11-03). 그 뒤 GRAVIT에서 고친 곳은 [docs/README.md](README.md) 「GRAVIT에서 고친 곳」에 적는다. 본문에서 이름만 나오는 기획 문서(03 · 05 · 06 · ARCHITECTURE.md 등)는 [docs/README.md](README.md)의 고정 링크 표에서 연다. 계약 변경 권한과 기준 위치는 [docs/README.md](README.md)를 따른다.

# 공통 계약 — 오피스 v1

> 문서: CONTRACTS.md · 상태: **v1 확정 (2026-11-03)** · 마지막 갱신: 2026-11-10
> 이 문서를 읽는 에이전트에게: 여러 Claude Code 세션과 4명이 같은 계약으로 병렬 개발하려고 모아 둔 곳이다. 여기 없는 계약을 세션마다 따로 만들지 말고, 필요하면 문서 담당자에게 이 문서를 먼저 고쳐 달라고 요청한다(「9. 계약 변경 절차」). 작업 기준은 문서 담당자가 공지한 계약 커밋이다. 요구사항 · 정책의 기준은 03 · 05 · 06이고, 이 문서는 그것을 구현 모양으로 옮긴 것이다.
> **엔드포인트별 경로 · 요청 · 응답 DTO · 역할 · 실패 코드 · JSON 예시는 [CONTRACTS_API.md](CONTRACTS_API.md) 한 곳에만 둔다.** 이 문서는 진입점이고 공통 규칙을 둔다. 같은 계약을 두 문서에 따로 적지 않는다.

**항목마다 붙인 표시**

| 표시 | 뜻 |
| --- | --- |
| **[확정]** | 결정 기록 · 03 · 05 · 06에서 이미 정한 정책을 옮겼다. 이 문서에서 바꾸지 않는다 |
| **[계약]** | 확정 정책을 구현하려고 정한 인터페이스 모양(이름 · 필드 · 경로 · 상태 코드). 2026-11-03에 v1으로 확정했다. 바꿀 때는 「9」 계약 변경 절차를 따른다 (이전 표시 "[계약 초안]"을 대신함) |
| **[구현 기본값]** | 합의된 기본값으로 시작하고, 구현 중 바꿔도 재승인이 필요 없는 값(2026-11-01 추가 결정). 단 보안 · 인증 · 권한 · 데이터 무결성에 닿는 값을 바꿀 때는 「9」 계약 변경 절차를 따른다. 목록은 「10」 |
| **[결정 필요]** | 팀이 아직 승인하지 않은 세부 정책. 구현이 기대면 안 되는 부분이라, 기본값 없이 비워 두거나 설정 한 곳으로 모은다 |

### 2026-11-03 결정 (사용자 선택 Q1~Q6)

공통 계약을 확정하면서 사용자가 고른 6가지다. 근거와 원문은 결정 기록(`docs/reviews/decision-meeting-2026-10-28.md` 「공통 계약 확정 결정 (2026-11-03)」).

| # | 결정 | 이 문서에서 |
| --- | --- | --- |
| Q1 | Entity 기본키는 `Long`(MySQL `BIGINT`), API의 내부 ID는 **문자열**. GitHub 식별자는 내부 ID와 따로 둔다 | 「2」 ID 정책 |
| Q2 | 요구사항은 DB 고유 ID를 유지하고, Markdown 원본 ID(`FR-AUTH-01` 등)를 우선 매칭 키로 재동기화한다. 모호하면 데이터 보존을 우선한다 | 「3」 요구사항 재동기화 |
| Q3 | 3D · 공통 HUD 데이터는 `WorkspaceSnapshot` 하나로, 개인 학습 데이터(학습 타임라인 · 회고 리포트 · 기술 결정 카드)는 별도 API로 나눈다 | 「5」 · 「8」, CONTRACTS_API.md 「5」 · 「15」 |
| Q4 | Must 병렬 개발에 필요한 공통 인터페이스(경로 · 메서드 · DTO · enum · 역할 · 소유권 검사 · 실패 코드 · 페이지 · ID · 시각)를 상세히 확정한다 | 「4」 · 「5」 · 「6」, CONTRACTS_API.md 전체 |
| Q5 | 논리 계약의 기준은 이 문서(+ CONTRACTS_API.md)다. 백엔드는 Java DTO, 프론트는 TypeScript 타입으로 구현하고 **계약 테스트**로 맞춘다. OpenAPI 기반 TS 자동 생성은 필수가 아니다 | 「9」 계약 테스트 |
| Q6 | 프론트엔드 · 백엔드를 **하나의 개발 저장소(모노레포)**에 둔다 — `frontend/` · `backend/` · `compose.yaml` · `.env.example` | 「9」 파일 표 · ARCHITECTURE.md 「저장소」 |

같은 날 문서 관리 방식도 팀의 실제 운영에 맞춰 정했다 — 기획 문서는 문서 담당자 1명이 고치고 GitHub에 반영하며, 계약 버전은 기획 저장소 커밋으로 공유한다. PR · 전원 리뷰는 문서 변경의 필수 조건이 아니다(「9」).

스택 [확정]: 프론트 React + TypeScript + Vite + R3F + Zustand, 백엔드 Java 21 · Gradle · Spring Boot(MVC) · Spring Data JPA · Spring Security 세션, DB MySQL 8.x(2026-11-01 결정 · 2026-11-01 추가 결정). 개발 저장소는 모노레포다(2026-11-03 결정). Spring Boot 버전 · migration 도구 · 구체 DB 설정 · 세션 저장소 세부 · 배포 플랫폼은 Spring Boot 골격 단계에서 정한다 — ARCHITECTURE.md 「기술 스택」.

---

## 1. 공통 원칙 [확정]

- 앱은 GitHub를 읽기만 한다. 앱이 만든 값은 앱 DB에만 저장한다 (CON-02 · P3).
- GitHub 원본을 바꾸는 사용자 동작(이슈 생성 · 닫기, PR 생성 · 병합 · 닫기, 라벨 · 담당자 · 상태 변경)은 API가 없다 — 화면이 해당 GitHub 웹페이지로 이동시키고, 바뀐 상태는 다음 동기화에서 읽는다. 앱 API의 쓰기는 앱이 관리하는 데이터(요구사항 연결 · 평가 · 안건 · 작업 마감 등)만이다 (P3 — 2026-11-01 추가 결정).
- 시각은 UTC로 저장 · 응답한다(ISO 8601 문자열). 한국 시간 변환은 화면에서 한다. 스탠드업 날짜처럼 "하루"를 뜻하는 날짜 값은 한국 시간 기준 날짜(`YYYY-MM-DD`)다 [구현 기본값].
- 사람별 합계 · 순위 · 비교 필드를 Entity에도 DTO에도 두지 않는다 (FR-FLOW-06 · FR-LRN-09 · P6).
- 개인 지표(학습 타임라인 · 회고 리포트 · 기술 결정 카드)는 본인과 강사의 요청에만 응답한다 (NFR-06 · P5). 이 데이터는 `WorkspaceSnapshot`에 넣지 않고 개인 API로만 준다 (2026-11-03 결정 — Q3).
- 평가자 · 동료 피드백 작성자는 저장하되 응답에 담지 않는다 (TBD-13 · TBD-12). 중첩 DTO · Snapshot · 상세 응답 어디에도 담지 않는다 [계약].
- 사무실 단위 데이터는 모두 사무실(Workspace)에 속하고, 모든 조회 · 쓰기 · 실시간 알림이 사무실 접근 검사를 거친다 (P2 — 2026-11-01 결정).
- 위치는 원본 상태 · 담당자에서만 계산한다. `RequirementLink` · `AgendaItem`은 원본 이슈 · PR의 상태 · 위치를 바꾸지 않는다 (05 「상태값」 — 2026-11-01 결정).
- 앱 내부 ID와 GitHub 식별자(이슈 · PR 번호, 사용자 · 레포 ID)는 섞지 않는다. 권한 판정에는 GitHub 사용자 ID와 내부 ID만 쓰고, GitHub 로그인 이름은 표시용이다 (2026-11-03 결정 — Q1).

## 2. 도메인 모델과 Entity 관계 [계약]

이름은 코드 컨벤션 (BE) 「이름」을 따른다. 모든 Entity의 기본키는 `Long id`다(아래 「ID 정책」). 표의 "→"는 N–1 참조(외래키)다. 연관관계는 기본 단방향 N–1로 두고, 양방향은 꼭 필요한 곳만 쓴다 — 코드 컨벤션 (BE) 「저장」.

| Entity | 범위 | 주요 필드 | 관계 · 규칙 | 근거 |
| --- | --- | --- | --- | --- |
| `Workspace` (사무실) | 서버 | 종류(`GITHUB` · `DEMO`), `githubRepoId` · `githubOwner` · `githubRepo`(`GITHUB`만), 설치 ID, 표시 이름, 연 사람 → AppUser, 열린 시각 | 1–1 `TeamSettings`, 1–1 `SyncState`, 1–N 아래 사무실 단위 항목 전부. `DEMO`는 Seed 데이터로 채우고 GitHub를 부르지 않는다 | 06 사무실 · P2 |
| (시연 사무실 접근 대상) | 사무실(`DEMO`) | 들어갈 수 있는 사용자와 그 역할 — 심사용 계정. 지정된 실제 강사는 `InstructorAssignment`로 들어온다 | → Workspace(`DEMO`), → AppUser. [확정] 명시적으로 등록한 대상만 들어간다(2026-11-01 추가 결정). 심사용 계정은 서버 설정 `REVIEW_ACCOUNTS`로 넣는다. 우리 조 실제 GitHub 계정은 넣지 않는다 — 배포하지 않아 우리 조 시연은 실제 사무실로 한다(2026-11-09 결정) | P2 · P15 |
| `TeamSettings` | 사무실 | 프로젝트 시작 · 끝(날짜), 명세 문서 경로, `reviewWaitHours`, `noCommitHours` | Workspace 1–1 | 06 팀 설정 |
| `AppUser` | 서버 | 계정 종류(`GITHUB` · `REVIEW`), `githubUserId`(`GITHUB`만 · 유일), `githubLogin`(표시용 — 로그인 · 동기화 때 갱신), 표시 이름, 프로필 사진 주소 | — . 동기화가 콜라보레이터를 팀원으로 만들 때 아직 로그인하지 않은 사람의 행도 만든다 [구현 기본값]. 이메일 칸은 두지 않는다 | NFR-04 · P15 |
| `ReviewAccount` (심사용 계정) | 서버 | 로그인 ID(`username` · 유일), 비밀번호 해시(평문 금지 — Spring `PasswordEncoder`), 사용 가능 여부 | AppUser(`REVIEW`) 1–1. [확정] 시연 사무실에만 접근하고 GitHub 권한이 없다. 심사용 로그인이 켜진 환경에서만 쓰인다. 비밀번호 · 해시를 저장소에 커밋하지 않는다 (2026-11-01 추가 결정) | FR-AUTH-01 · P15 |
| (승인된 강사 계정) | 서버 | [확정] **서버 설정 허용 목록**의 GitHub 사용자 ID 목록 — DB에 두지 않고 관리 화면이 없다(2026-11-01 추가 결정 — ARCHITECTURE.md 「인증과 권한」 대안 A). 설정 이름은 환경 변수 가이드 | — | P1 |
| `InstructorAssignment` | 사무실 | **강사 GitHub 사용자 ID**(`instructorGithubUserId`), 지정한 사람 → AppUser, 지정 시각, 해제 시각 | → Workspace. 강사는 AppUser 외래키가 아니라 GitHub 사용자 ID로 가리킨다 — 아직 로그인하지 않은 강사도 지정할 수 있고, 로그인 이름이 바뀌어도 그대로다. 해제해도 행을 지우지 않고 해제 시각을 남긴다. 현재 지정(해제 시각 없음)은 (사무실, GitHub 사용자 ID)당 하나 | FR-AUTH-06 · P1 |
| `Member` (팀원) | 사무실 | 사용자 → AppUser(시연 Seed 팀원은 없음), 책상 자리(`deskIndex` 0~7 — 최대 8자리, 빠진 팀원과 자리가 없는 팀원은 비움 [확정 — 2026-11-04 결정]), 레포 관리자 여부, 활동 기록 수집 동의 시각, 빠진 시각(`removedAt`), `syncedAt` | → Workspace, → AppUser. 서버 설정 허용 목록의 강사 계정은 콜라보레이터여도 팀원이 아니다 [확정 — P1]. 콜라보레이터에서 빠지면 행을 지우지 않고 `removedAt`을 남기고 책상 자리를 비운다(과거 평가 · 안건 · 코멘트가 가리키므로 행은 남긴다) | 06 팀원 · FR-GH-04 |
| `Task` (이슈 앱 모델) | 사무실 | `githubIssueNumber`, 제목, 열림 · 닫힘, 닫힘 사유(완료 · 계획 안 함), 라벨, GitHub 만든 · 고친 · 닫힌 시각, 상태가 바뀐 시각, `syncedAt` | → Workspace. 담당자는 `TaskAssignee`로 둔다(2026-11-01 추가 결정) | 06 GitHub 원본 데이터 |
| `TaskAssignee` (이슈 담당자) | 사무실 | 이슈, 팀원, `syncedAt` | → Task, → Member — **Task와 Member의 다대다(N–M)를 표현하는 중간 Entity**. [확정] 담당자 수에 서버 제한이 없다(팀은 1명 권장). 동기화가 GitHub 담당자 전원으로 맞춘다. 팀원이 아닌 GitHub 담당자는 넣지 않는다 [구현 기본값]. 대표 담당자는 저장하지 않는다(「3」) (2026-11-01 추가 결정) | FR-GH-02 · FR-OFF-02 · P14 |
| `Submission` (PR 앱 모델) | 사무실 | `githubPrNumber`, 제목, 작성자(`authorGithubUserId` · 작성자 팀원), 상태(열림 · Draft · 머지 · 닫힘), `headSha`, 리뷰 요청 · 리뷰, 라벨, 마지막 커밋 시각, 머지 · 닫힌 시각, 상태가 바뀐 시각, `syncedAt` | → Workspace, → Member(작성자 — 팀원이 아니면 없음) | 06 · FR-GH-02 |
| `SubmissionIssueLink` | 사무실 | PR, 이슈, 출처(GitHub 연결 종류) | Submission N–M Task. [확정] **GitHub가 공식으로 인식하는 연결 관계만** 저장한다 — PR 본문 · 제목의 `#N` 언급만으로 만들지 않고, 앱이 추측해 만들지 않는다. 조회 API는 구현 때(2026-11-01 추가 결정) | FR-GH-04 |
| `Requirement` | 사무실 | 원본 ID(`sourceKey` — `##` 제목의 요구사항 ID, 없으면 비움), 제목, 매칭용 정규화 제목, 문서 안 순서, 상태(`ACTIVE` · `MISSING` · `NEEDS_REVIEW`), 마지막으로 문서에서 본 시각 | → Workspace. 재동기화 규칙은 「3」 (2026-11-03 결정 — Q2) | FR-REQ-02 |
| `RequirementLink` | 사무실 | 요구사항, 이슈, 연결한 사람 → AppUser, 연결 시각 | → Requirement, → Task. 동기화 · 재동기화가 지우지 않는다 | FR-REQ-04 · 07 |
| `EvaluationRound` | 사무실 | **회차 ID**, 회차 번호(PR 안에서 1, 2, …), 시작 시점 `headSha`, 여는 사유(`NEW_PR` · `NEW_COMMIT` · `MEETING_REEVALUATE`), 시작 · 닫힌 시각 | → Submission. 회차 ID와 `headSha`는 별개 — 같은 `headSha`에 회차 여러 개 가능. 지우지 않는다 | FR-LRN-06 · P7 |
| `Evaluation` | 사무실 | 평가자 → AppUser, `RECOMMEND` · `NOT_RECOMMEND`, 이유(필수), 고친 시각 | → EvaluationRound. 평가자는 1인 1회 · 작성자 제외 검사에만 쓰고 응답에 담지 않는다 | FR-LRN-01 · 02 |
| `AgendaItem` | 사무실 | 종류(이슈 · PR · 도움 요청 · 배운 점 공유 · 기타), 원본 참조(이슈 · PR · 도움 요청 중 하나 또는 없음), PR 안건이면 올린 시점의 평가 회차, 제목, 배경, 해 본 것, 혼자 결론 못 낸 이유, 상태(확정 · 회의 완료 · 거둠 — 「3」), 올린 사람 → Member, PR 결정, 결론, 후속 담당자 · 기한, 배운 점, 다룬 회의, 강사 피드백 요청 여부 · 시각 | → Workspace, → 원본(선택), → Meeting(선택) | 06 회의 안건 · FR-LRN-04~12 |
| `InstructorFeedback` | 사무실 | 안건(결정 기록), 강사 → AppUser, 내용, 시각 | AgendaItem 1–N | FR-LRN-22 |
| `Meeting` | 사무실 | 시작 · 끝, 참석자, 메모 | → Workspace. 다룬 안건은 `AgendaItem`이 회의를 가리킨다 | 06 회의 |
| `Standup` | 사무실 | 작성자 → Member, 날짜(한국 시간 기준 날짜 [구현 기본값]), 어제 한 일, 막힌 것 | → Workspace, → Member | FR-MTG-01 · 02 |
| `HelpRequest` · `HelpComment` | 사무실 | 요청자 → Member, 내용, 상태, 강사에게 요청한 시각, 닫을 때 배운 점, 도움이 된 코멘트, 넘어온 스탠드업(선택), 전환된 안건(선택) / 코멘트 작성자 → AppUser, 내용, 강사 답변 여부 | HelpRequest 1–N HelpComment, HelpRequest 1–N AgendaItem — 거두지 않은 안건(`confirmed` · `discussed`)은 0..1, 거둔 안건은 여럿 남을 수 있다(2026-11-10 — #313) | FR-LRN-15~21 |
| `TaskDueDate` | 사무실 | 이슈, 마감일, 입력한 사람 → AppUser · 시각 | Task 1–1. [확정] 고칠 수 있는 사람은 그 사무실 ROLE-02와 그 이슈의 담당자(`TaskAssignee`) 전원 — P14. GitHub 이슈는 바뀌지 않는다 | FR-PLAN-02 · 03 (2026-11-01 결정 · 권한은 2026-11-01 추가 결정) |
| `DecisionCard` · `FollowUpQuestion` | 사무실 | PR, 본인 → Member, 9칸, 본인 확인 시각, 꼬리질문 요청 시각 / 강사 → AppUser, 내용 | DecisionCard 1–N FollowUpQuestion | FR-REP-07 · 11 · P11 |
| `RetroReport` | 사무실 | 본인 → Member, 종류(최종 · 중간), 배운 점, 만든 시각 (나머지 칸은 계산) | → Member | FR-REP-01~03 · 05 |
| `ActivityRecord` · `ActivityConfirmation` · `PeerFeedback` | 사무실 | 06 「저장 항목」 칸 그대로. 확인은 확인자마다 한 행. 동료 피드백 작성자는 저장하고 응답에 담지 않는다 | → Member | FR-ACT |
| `ConventionLibraryItem` | 서버 | 대상, 이름, 내용, 설명, 작성 강사 → AppUser, 수정 시각 | 서버 전체에 하나 | FR-LIB |
| `SyncState` | 사무실 | 진행 중 여부, 마지막 성공 시각, 마지막 실패 시각 · code · 사유, 마지막 명세 문서 읽기 경고 | Workspace 1–1 | FR-GH-05 · P4 |

- 학습 타임라인 · 강사 요청함 · 막힘 · 진행률 · 팀 지표 · 요구사항 판 배치(대기 칸) · 대표 담당자 · 도움 요청의 안건 후보 여부는 **저장하지 않고 계산한다** [확정 — 06 「화면에 보이지만 따로 저장하지 않는 값」].

### ID 정책 (2026-11-03 결정 — Q1)

**내부 ID** — 앱이 만든 행의 식별자.

| 규칙 | 내용 |
| --- | --- |
| 저장 | 모든 Entity의 기본키는 `Long`, MySQL `BIGINT`. 생성 방식은 `[구현 기본값]` `IDENTITY`(AUTO_INCREMENT) |
| JSON | 내부 ID는 **10진 문자열**로 낸다 — `"id": "42"`, `"taskId": "42"`. 숫자로 내지 않는다 |
| 요청 | 경로 변수 · 요청 DTO의 내부 ID도 문자열이다. 서버는 `^[1-9][0-9]{0,18}$`이고 `Long` 범위 안인지 검사한 뒤 `Long`으로 바꾼다. 변환은 공통 코드 한 곳에서 한다 [구현 기본값] |
| 형식 오류 | 경로 변수의 ID 형식이 틀리면 `not_found`(그런 대상은 없다), 요청 본문의 ID 형식이 틀리면 `invalid` |
| 이름 | 자기 ID는 `id`, 다른 Entity를 가리키면 `<대상>Id`(`taskId` · `memberId` · `submissionId` · `roundId` …), 여러 개면 `<대상>Ids`. **이름이 `id`이거나 `Id` · `Ids`로 끝나는 JSON 필드는 모두 문자열(또는 문자열 배열)**이다 — 계약 테스트가 이 규칙을 검사한다(「9」) |
| 범위 | 내부 ID는 테이블마다 따로 매긴다. 종류가 다르면 같은 값이 나올 수 있다(이슈 `"5"`와 PR `"5"`). 화면에서 종류를 섞어 쓰는 키는 종류를 앞에 붙인다(「8」 SceneEntity) |
| 소유 | 모든 사무실 단위 조회는 `id`와 사무실을 함께 조건으로 쓴다(`findByIdAndWorkspaceId` 꼴). 다른 사무실의 ID를 넣으면 `not_found`다 — IDOR 방어 |
| 프론트 | 화면은 ID를 불투명한 문자열로만 쓴다. 숫자로 바꾸거나, 크기를 비교하거나, ID로 정렬하지 않는다 |

**GitHub 식별자** — GitHub가 정한 값. 내부 ID와 다른 필드에 둔다.

| 값 | JSON 필드 | JSON 타입 | DB | 뜻 |
| --- | --- | --- | --- | --- |
| 이슈 번호 | `githubIssueNumber` | 숫자 | `INT` | 레포 안에서만 유일. `(사무실, 번호)`가 유일 |
| PR 번호 | `githubPrNumber` | 숫자 | `INT` | 레포 안에서만 유일. `(사무실, 번호)`가 유일 |
| 사용자 ID | `githubUserId` | **문자열** | `BIGINT` | 바뀌지 않는 계정 키. 강사 허용 목록 · 강사 지정 · 작성자 판정의 기준 |
| 레포 · 계정(조직) · 설치 ID | `githubRepoId` · `githubOwnerId` · (설치 ID는 응답에 내지 않음) | **문자열** | `BIGINT` | 64비트 정수라 JavaScript 안전 정수 범위를 넘을 수 있어 문자열로 낸다 |
| 커밋 | `headSha` | 문자열 | `CHAR(40)` | 평가 회차의 시작 커밋. 회차 ID가 아니다 |
| 로그인 이름 | `githubLogin` | 문자열 | `VARCHAR` | **표시용**. 바뀔 수 있으므로 권한 · 연결 판정에 쓰지 않는다 |

- 이슈 · PR 번호는 레포 안의 작은 정수라 숫자로 둔다. 필드 이름이 `Id`로 끝나지 않으므로 위 문자열 규칙과 겹치지 않는다.
- 동기화는 GitHub 식별자(`(사무실, githubIssueNumber)` 등)로 앱 행을 찾아 갱신하고, 내부 ID를 GitHub에서 만들지 않는다.

**데모와의 변환 경계**: 데모의 `t_123` 같은 접두사 ID는 서버 기본키로 쓰지 않는다. 브라우저 mock DataSource는 화면 개발 · 테스트용으로 자기 문자열 ID(예: `"t_1"`)를 만들어도 된다 — 화면이 ID를 불투명한 문자열로만 쓰므로 api · mock 어느 쪽이든 같은 타입(`string`)이다. 데모의 `Task.number`는 `githubIssueNumber`, 데모의 `Member.id`(GitHub 사용자 ID로 쓰려던 칸)는 내부 `memberId`와 `githubUserId` 두 필드로 나눈다(06 「기존 데모 데이터와의 대응」).

**예외**: 스탠드업은 `(사무실, 팀원, 날짜)`가 자연 키라 경로에 날짜를 쓴다(`/standups/{date}/mine`). 강사 지정 경로는 GitHub 사용자 ID를 쓴다(`/instructors/{githubUserId}` — 「6」 식별자 원칙). 그 밖에 내부 ID 대신 다른 키를 쓰는 곳은 없다.

### 소유와 변경 주체 — GitHub 원본과 앱 기록 [계약]

동기화와 앱 API가 같은 행을 두고 다투지 않도록 쓰는 주체를 하나로 정한다.

| 데이터 | 쓰는 주체 | 앱 API의 쓰기 | 동기화가 하는 일 |
| --- | --- | --- | --- |
| `Task` · `Submission` · `TaskAssignee` · `SubmissionIssueLink` | 동기화만 | 없음 | GitHub 값으로 덮어쓴다. 행을 지우지 않는다 — GitHub에서 사라진 이슈 · PR 처리는 「10」 |
| `Member`의 GitHub 칸(로그인 이름 · 사진 · 레포 관리자 여부 · `syncedAt` · `removedAt`) | 동기화 | 없음 | 콜라보레이터 목록으로 맞춘다. 빠지면 `removedAt`을 남기고 책상 자리를 비운다 |
| `Member`의 앱 칸(`deskIndex` · 활동 기록 수집 동의) | 앱(책상은 처음 들어올 때 빈 자리 배정 — 8자리가 다 차 있으면 비워 둔다 [확정 — 2026-11-04 결정]) | 수집 동의 | 지금 팀원의 값은 **덮어쓰지 않는다** |
| `EvaluationRound` | 동기화(새 PR · 새 `headSha`) + 앱(회의의 "수정 후 재평가") | 회의 결정 | 새 회차만 연다. 이전 회차는 건드리지 않는다 |
| `TaskDueDate` · `RequirementLink` · `AgendaItem` · `Evaluation` · `Standup` · `HelpRequest` · 카드 · 리포트 · 활동 기록 | 앱만 | 있음 | **읽지도 덮지도 않는다.** 원본 이슈 · PR이 바뀌어도 그대로다 |
| `Requirement` | 명세 문서 재동기화(「3」) | 없음(연결만) | 매칭 규칙대로 갱신 · 상태 변경. 지우지 않는다 |

## 3. 표시 상태 · 공간 역할 · 비즈니스 규칙

### 표시 상태 · 공간 역할 · 우선순위 [확정]

05-policy.md 「상태값」 표가 기준이다. 요약:

| 대상 | 원본 상태 | 표시 상태 → 공간 역할(`placeRole`) |
| --- | --- | --- |
| 이슈 | 열림 · 담당자 없음 | 대기 → `backlog` |
| 이슈 | 열림 · 담당자 있음 | 작업 중 → `desk:<대표 담당자 memberId>` — 담당자가 여럿이어도 상자는 하나 [확정]. 대표 담당자에게 책상 자리가 없으면 `backlog` [확정 — 2026-11-04 결정] |
| 이슈 | 닫힘 | 완료 또는 종료 → `done`. GitHub 닫힘 사유로 완료 · 종료를 구분해 보일 수 있다 [구현 기본값] |
| PR | 열림 | 검토 → `review` |
| PR | 머지 | 완료 → `done` |
| PR | 닫힘(머지 안 됨) | 종료 → `done` [확정 — FR-LRN-07], 미병합 종료 표시 [구현 기본값] |
| PR | Draft | 열린 PR → `review`, Draft 배지 [구현 기본값] |

- 우선순위: `priority:high` · `priority:medium` · `priority:low` 라벨, 없으면 중립. 라벨 이름 → 값 대응은 백엔드 상수 한 곳이고, 응답의 `priority` 필드로 낸다 [계약]. 라벨이 여러 개면 가장 높은 값 [구현 기본값].
- 회의 안건은 `meeting`에 `AgendaItem`으로 따로 놓이고, 원본은 위 표대로 제자리다.
- 대표 담당자 [확정 — 결정적인 규칙으로 고름 · 2026-11-01 추가 결정]: 규칙은 [구현 기본값] 그 사무실 팀원인 담당자 중 GitHub 사용자 ID(숫자)가 가장 작은 사람이다(GitHub 사용자 ID가 없는 시연 Seed 팀원은 뒤에, 그 안에서는 `memberId` 순). 팀원인 담당자가 없으면 `backlog`. [계약] 서버가 `assigneeMemberIds`를 이 순서로 정렬해 보내고, 화면은 첫 번째를 대표로 쓴다 — 화면이 GitHub ID를 비교하지 않는다. 상세 화면에는 담당자 전원을 보인다.

### 상태값 — JSON 값 [계약]

JSON의 열거 값은 소문자 snake다(코드 컨벤션 (BE) 「이름」). 자바 열거형은 `UPPER_SNAKE`이고, 변환은 공통 코드 한 곳에서 한다. 요청의 알 수 없는 값은 `invalid`.

| 대상 | JSON 값 | 근거 |
| --- | --- | --- |
| 사무실 종류 | `github` · `demo` | P2 |
| 사무실 안 역할 | `repo_admin` · `participant` · `instructor` | P1 |
| 계정 종류 | `github` · `review` | P15 |
| 이슈 상태 · 닫힘 사유 | `open` · `closed` / `completed` · `not_planned` | 05 「상태값」 |
| PR 상태 | `open` · `draft` · `merged` · `closed`(머지 안 됨) | 05 「상태값」 |
| 우선순위 | `high` · `medium` · `low` (없으면 `null`) | P6 |
| 평가 | `recommend` · `not_recommend` | P7 |
| 평가 회차를 연 사유 | `new_pr` · `new_commit` · `meeting_reevaluate` | FR-LRN-06 |
| 요구사항 상태 | `active` · `missing` · `needs_review` | 아래 「요구사항 재동기화」 |
| 안건 종류 | `issue` · `pr` · `help_request` · `learning`(배운 점 공유) · `other` | FR-LRN-04 · 10 · 11 · 19 |
| 안건 상태 | `confirmed`(확정) · `discussed`(회의 완료) · `withdrawn`(거둠) | 05 「상태값」 회의 안건 — 아래 메모 |
| PR 안건 결정 | `revise_and_reevaluate` · `merge_as_is` · `close_pr` | FR-LRN-05 |
| 회의 상태 | `ongoing` · `ended` | FR-MTG-03 |
| 도움 요청 상태 | `open`(열림) · `discussing`(논의 중) · `resolved`(해결) · `on_agenda`(안건) · `ended`(종료) | 05 「상태값」 도움 요청 — 아래 메모 |
| 활동 기록 유형 · 상태 | `planning` · `research` · `design` · `presentation` · `mentor_question` / `pending` · `confirmed` | FR-ACT-01 · 02 |
| 회고 리포트 종류 | `final` · `midterm` | FR-REP-01 · 05 |
| 컨벤션 라이브러리 대상 | `branch_name` · `commit_message` · `pr_title` · `pr_body` · `issue_body` · `issue_template` · `pr_template` | FR-LIB-01 |
| 동기화 진행 | `idle` · `running` | FR-GH-05 |

- **안건 후보**: 05의 "후보"는 v1 Must에서 48시간 미해결 도움 요청(FR-LRN-18)뿐이다. 이것은 `AgendaItem` 행이 아니라 도움 요청의 계산 값(`isAgendaCandidate`)으로 낸다 — 요청자가 확정하면(FR-LRN-19) 그때 `confirmed` 안건이 생긴다. 확정되지 않은 후보는 행이 없으므로 지울 것도 없다(P8 "지우지 않는다"와 같은 결과). 앱이 다른 후보를 자동으로 찾는 것은 추가 제안 후보 8이라 v1 계약에 없다 — 채택되면 `candidate` 값을 계약 변경(「9」)으로 더한다.
- **도움 요청 "안건 후보"**: 위와 같이 상태 값이 아니라 `isAgendaCandidate`(상태가 `open` · `discussing`이고 만든 지 48시간이 지남)다.
- **도움 요청 상태 전이 — 안건 철회** (2026-11-10 — #313): `on_agenda` → (안건 철회) → `open` · `discussing`. 도움 요청 안건을 거두면 안건만 철회하고, 같은 트랜잭션에서 도움 요청을 안건으로 전환하기 직전 상태 그대로 되돌린다(코멘트 유무로 다시 계산하지 않음). 본문 · 코멘트는 그대로이고, 다시 전환할 수 있다. 거둔 안건 행은 `withdrawn`으로 남는다. 자세한 규칙은 CONTRACTS_API.md 「11」.

### 요구사항 재동기화 (2026-11-03 결정 — Q2) [계약]

`##` 제목 하나 = 요구사항 하나(TBD-01 · FR-REQ-02)는 그대로다. 요구사항은 DB 고유 ID를 갖고, 다시 읽어도 같은 요구사항이면 같은 ID를 유지한다. 언제 읽나: 수동 동기화(2026-10-28 결정)와 사무실 열기 직후 첫 동기화.

**읽기**

1. 명세 문서의 `##` 제목(정확히 2단계)을 위에서부터 읽는다. 순서가 `position`이다.
2. 제목 맨 앞이 요구사항 ID 꼴(`^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]+`, 예: `FR-AUTH-01` · `NFR-04`)이면 그것이 **원본 ID(`sourceKey`)**다. 요구사항 종류(`groupKey` — 이름표 · 분류 · 정렬용, 묶음 기준 아님)는 원본 ID에서 끝 번호를 뺀 접두사다 — 화면 계산(ARCHITECTURE.md 「요구사항 묶음 표시」).
3. **정규화 제목**: 제목에서 원본 ID와 바로 뒤의 구분 기호(공백 · `:` · `-` · `.`)를 빼고, 앞뒤 공백을 지우고, 연속 공백을 하나로 줄인 값. 응답의 `title`도 이 값이다.

**매칭** — 같은 사무실의 기존 요구사항(상태 무관)과 맞춘다.

| 순서 | 규칙 |
| --- | --- |
| ① 원본 ID | 문서 안에서 한 번만 나온 원본 ID는 같은 원본 ID의 기존 요구사항과 맞춘다 |
| ② 같은 제목 | ①에서 짝을 못 찾은 제목은, ①에서 짝이 안 된 기존 요구사항 중 정규화 제목이 같은 것과 맞춘다 — **문서 안에서 그 제목이 한 번만 나오고, 기존 후보도 정확히 하나일 때만** |
| ③ 새 요구사항 | 그래도 짝이 없으면 새 요구사항(`active`)을 만든다 |
| ④ 사라진 요구사항 | 짝이 안 된 기존 요구사항은 `missing`이 된다 |

- 맞춰진 요구사항은 제목 · 원본 ID · 순서를 문서 값으로 갱신하고 `active`가 된다. 그래서 순서 변경 · 요구사항 추가로는 ID가 바뀌지 않고, 원본 ID가 있으면 제목을 고쳐도, 원본 ID를 새로 붙이거나 번호를 바꿔도(제목이 같으면) ID가 유지된다.
- **원본 ID가 없는 요구사항의 제목을 바꾸면 자동으로 따라가지 못한다** — 기존 것은 `missing`(연결 보존), 새 제목은 새 요구사항이 된다. 제목 변경을 추적하려면 원본 ID를 붙인다. 레포 관리자가 새 요구사항에 이슈를 다시 연결하고 옛 연결을 지울 수 있다. 복잡한 버전 관리는 만들지 않는다.

**충돌 — 모호하면 연결하지 않는다**

| 상황 | 처리 |
| --- | --- |
| 같은 원본 ID가 문서에 두 번 이상 | 그 제목들은 가져오지 않는다. 같은 원본 ID의 기존 요구사항은 `needs_review`. 동기화 상태에 경고 `duplicate_source_key` |
| 원본 ID 없는 같은 제목이 문서에 두 번 이상, 같은 제목의 기존 후보가 둘 이상, 또는 ①에서 짝을 못 찾은 같은 제목이 문서에 두 번 이상(원본 ID 유무 무관)이고 그 제목의 기존 후보가 있음 (2026-11-05 — 마지막 경우는 새 원본 ID가 붙은 제목과 없는 제목이 같이 나올 때다. 원본 ID가 서로 다른 같은 제목은 기존 후보가 없으면 각각 새로 만든다) | 그 제목들은 자동 매칭 · 생성하지 않는다. 그 제목의 기존 후보는 `needs_review`. 경고 `duplicate_title` |
| 명세 문서를 읽지 못함(경로에 파일 없음 · GitHub 오류) | **요구사항을 하나도 바꾸지 않는다.** 경고 `spec_not_found` 또는 동기화 실패로 남긴다(FR-GH-05) |
| 명세 문서 경로가 비어 있음 | 읽지 않고 요구사항을 바꾸지 않는다 |

- `needs_review`는 다음 재동기화에서 모호함이 풀리면 `active`(짝을 찾음) 또는 `missing`(못 찾음)으로 바뀐다. 문서를 고치면 풀린다 — 따로 승인 API는 없다.
- **`RequirementLink`는 재동기화가 자동으로 지우지 않는다.** `missing` · `needs_review` 요구사항의 연결도 남고, 같은 요구사항이 다시 `active`가 되면 그대로 이어진다. 연결을 지우는 것은 레포 관리자의 `DELETE` 요청뿐이다.
- 상태별 동작: `active`만 3D 요구사항 판 · 대기 칸 · 진행률 · 새 연결 대상이 된다. `missing` · `needs_review`는 요구사항 패널에 상태와 함께 보이고(연결 보존 확인용), 새 연결 요청은 `conflict`다.
- 진행률(FR-REQ-05) [구현 기본값]: 요구사항마다 `doneTaskCount / linkedTaskCount` — 연결된 이슈 중 닫힌 이슈 수(닫힘 사유 무관) / 연결된 이슈 수.

### 평가 회차 [확정 → 계약]

- 회차는 세 경우에만 열린다 — 동기화로 새 PR이 들어옴(`new_pr`, 1회차), 동기화에서 열린 PR의 `headSha`가 바뀜(`new_commit`), 회의 결정 `revise_and_reevaluate`(`meeting_reevaluate`, 그때의 `headSha`). 새 회차를 열면 이전 회차에 `closedAt`을 남긴다. 회차 ID와 `headSha`는 별개이고, 같은 `headSha`에 회차가 여러 개일 수 있다(P7 · FR-LRN-06).
- 현재 회차 = 그 PR의 회차 번호가 가장 큰 회차. 추천 · 비추천 수는 현재 회차만 센다.
- 평가 요청은 평가할 회차 ID를 함께 보낸다. 그 사이 새 회차가 열렸으면 `conflict` — 이전 회차 평가가 새 회차에 섞이지 않게 한다.
- PR이 머지 · 닫히면 평가를 받지 않는다(`conflict`). 마지막 회차는 그대로 보인다.
- 회의 결정 `revise_and_reevaluate`는 열린 PR(Draft 포함) 안건에만 고를 수 있다. 머지 · 닫힌 PR이면 결정 기록 전체를 `conflict`로 거부하고 회차를 열지 않는다(2026-11-05 — 닫힌 PR의 마지막 회차가 0표 회차로 바뀌지 않게). `merge_as_is` · `close_pr`은 PR 상태와 상관없이 기록한다.
- 작성자 판정: PR 작성자 팀원(`authorMemberId`)과 요청한 사람의 팀원이 같으면 작성자다 — `forbidden_role`.

### 막힘 신호 · 평균 리뷰 대기 [구현 기본값 — 2026-11-05]

저장하지 않고 응답 시각에 계산한다(「1」). 기준 시간은 팀 설정 `reviewWaitHours` · `noCommitHours`이고, 기준 시간을 **넘기면**(초과) 막힘이다. 응답에는 막혔는지만 담고 이유는 담지 않는다(FR-FLOW-02).

- **리뷰 대기 시작**: 열린 PR이 열린 시각(`stateChangedAt`)과 마지막 커밋(`lastCommitAt`) 중 늦은 것.
- **센 리뷰**: 리뷰 대기 시작 뒤에 제출된 리뷰 중 작성자 본인 · `dismissed`가 아닌 것.

| 대상 | 막힘 판정 |
| --- | --- |
| 열린 PR — 센 리뷰 없음 | 리뷰 대기 시작부터 `reviewWaitHours` |
| 열린 PR — 센 리뷰 있음 | 마지막 센 리뷰부터 `noCommitHours`(작성자 차례). 승인 뒤 머지를 기다리는 PR도 포함한다 |
| Draft PR | 마지막 커밋과 Draft가 된 시각 중 늦은 것부터 `noCommitHours` |
| 담당자 있는 열린 이슈 | 연결된 열린 PR(Draft 포함)이 있으면 그중 하나라도 막혔는지. 없으면 이슈 `stateChangedAt`과 연결된 PR의 마지막 커밋 · 상태 변경 중 가장 늦은 것부터 `noCommitHours` |
| 머지 · 닫힌 PR, 닫힌 이슈, 담당자 없는 이슈 | 막히지 않는다 |

- `flow.blockedMemberIds` = 막힌 이슈의 담당자 전원 + 막힌 PR의 작성자(팀원일 때), 응답 `members` 순서.
- `flow.averageReviewWaitHours`(FR-FLOW-05): 열린 PR(Draft 제외)마다 리뷰 대기 시작부터 첫 센 리뷰(없으면 응답 시각)까지의 시간, 그 평균을 소수 첫째 자리로. 열린 PR이 없으면 `null`.

### 무결성 제약 [계약]

DB 유일 제약이나 서비스 검사로 막는다. 분산 트랜잭션은 쓰지 않는다 — 쓰기 하나는 Service 메서드 하나의 트랜잭션이다.

| 제약 | 막는 곳 |
| --- | --- |
| `Workspace`: `GITHUB` 종류는 `githubRepoId` 하나에 사무실 하나 | 유일 제약 |
| `AppUser.githubUserId` · `ReviewAccount.username` 유일 | 유일 제약 |
| `Member`: (사무실, 사용자) · (사무실, `deskIndex`) 유일 — 빠진 팀원은 `deskIndex`가 비어 겹치지 않는다 | 유일 제약 |
| `Task`: (사무실, `githubIssueNumber`) · `Submission`: (사무실, `githubPrNumber`) 유일 | 유일 제약 |
| `TaskAssignee`: (이슈, 팀원) · `SubmissionIssueLink`: (PR, 이슈) 유일 | 유일 제약 |
| `Requirement`: (사무실, `sourceKey`) 유일 — 원본 ID가 없는 행끼리는 겹쳐도 된다 | 유일 제약(MySQL은 NULL을 겹쳐 허용) |
| `RequirementLink`: (요구사항, 이슈) 유일 — 같은 연결 요청은 기존 연결을 돌려준다 | 유일 제약 + 서비스 |
| `EvaluationRound`: (PR, 회차 번호) 유일 | 유일 제약 |
| `Evaluation`: (회차, 평가자) 유일 — 1인 1회, 고치면 같은 행을 갱신 | 유일 제약 |
| `Standup`: (사무실, 팀원, 날짜) · `TaskDueDate`: 이슈 하나 · `DecisionCard`: (팀원, PR) · `ActivityConfirmation`: (활동, 확인자) · `PeerFeedback`: (사무실, 작성자, 받는 사람, 주) 유일 | 유일 제약 |
| `HelpRequest` → 거두지 않은 안건(`confirmed` · `discussed`)은 도움 요청당 하나. 거둔(`withdrawn`) 행은 남고 세지 않는다 (2026-11-10 — #313) | 유일 제약(방법은 migration 때 — 예: 거두지 않은 행에만 값이 있는 생성 열에 유일 제약). 거둔 행을 다시 `confirmed`로 쓰지 않는다 — 철회 기록이 사라진다 |
| `InstructorAssignment`: 현재 지정은 (사무실, GitHub 사용자 ID)당 하나 | 서비스 + DB(방법은 migration 때 — 예: 현재 지정 행에만 값이 있는 생성 열에 유일 제약) |
| `Meeting`: 사무실마다 진행 중 회의는 하나 | 서비스(`conflict`) |
| **같은 사무실끼리만 참조** — 요구사항 연결의 요구사항 · 이슈, 안건의 원본 · 회차, 후속 담당자, 도움이 된 코멘트, 카드의 PR 등은 모두 요청한 사무실 것이어야 한다 | 서비스 — 다르면 `not_found`. 계약 테스트로 확인 |
| 안건 종류와 원본 참조 — `issue`는 이슈, `pr`은 PR, `help_request`는 도움 요청을 가리키고, `learning` · `other`는 원본이 없다 | 서비스(`invalid`) |

### 지우지 않는 기록 [확정 → 계약]

권한 해제 · 동기화 뒤에도 과거 기록을 남긴다(P1 · P7 · P8 · 2026-11-01 결정). 아래는 행을 지우는 API가 없다: `EvaluationRound` · `Evaluation`, `AgendaItem`(거두면 `withdrawn`), `InstructorAssignment`(해제 시각), `InstructorFeedback` · `HelpComment` · `FollowUpQuestion`, `Requirement`(`missing`), `Member`(`removedAt`), `Task` · `Submission`. 지울 수 있는 것은 `RequirementLink`(레포 관리자), `TaskDueDate`(마감 지우기), 그리고 조건부로 `HelpRequest`(요청자 — 상태가 `open`이고 코멘트 · 안건 기록이 없는 요청만, CONTRACTS_API.md 「11」 도움 요청 삭제 제한 — 2026-11-10 #315)뿐이다. 도움 요청 삭제 제한은 위 목록의 `AgendaItem` · `HelpComment` 기록을 지키기 위한 것이다.

## 4. API [계약]

엔드포인트별 계약은 **[CONTRACTS_API.md](CONTRACTS_API.md)**가 기준이다(경로 · 메서드 · 경로 변수 · 쿼리 · 요청 · 응답 DTO · 역할 · 소유권 검사 · 실패 · 예시 · 요구사항 ID · 대응 DataSource 메서드). 여기에는 모든 엔드포인트에 공통인 규칙만 둔다.

| 규칙 | 내용 |
| --- | --- |
| 경로 | 앱 API는 `/api/**`. 사무실 단위는 `/api/workspaces/{workspaceId}/…`. 서버 전체(로그인 · 사무실 목록 · 강사 요청함 · 컨벤션 라이브러리)는 사무실 경로 밖이다. GitHub 로그인 시작 · 콜백만 Spring Security 기본 경로를 쓴다 |
| 본문 | 요청 · 응답 모두 `application/json; charset=utf-8`. 예외는 심사용 로그인(폼), SSE(`text/event-stream`), 마크다운 내보내기(`text/markdown`) |
| 상태 코드 | `200` 조회 · 갱신 · 상태를 바꾸는 동작, `201` 새 행을 만든 `POST`(본문에 만든 DTO), `202` 수동 동기화 접수, `204` 지우기 · 로그아웃. 실패는 「6」 |
| 멱등 | `PUT`은 같은 본문을 다시 보내도 결과가 같다. "요청 켜기"(`…-request`) 동작도 이미 켜져 있으면 그대로 `200` |
| 페이지 | 페이지가 있는 목록(학습 타임라인 · 활동 기록)만 `?page=0&size=20`을 받는다. `page`는 0부터, `size` 기본 20 · 최대 100 — 범위 밖은 `invalid`. 응답은 `PageResponse`(Spring `Page`를 그대로 직렬화하지 않는다). 그 밖의 목록은 배열 전체를 준다 — v1 데이터 규모(4인 · 2주)에서 충분하고, 커지면 계약 변경(「9」) |
| 정렬 | 엔드포인트마다 고정이다(CONTRACTS_API.md에 적음). v1은 `sort` 쿼리를 받지 않는다 |
| ID · 시각 · 날짜 | 「2」 ID 정책, 「5」 DTO 규칙 |
| CSRF | 모든 `POST` · `PUT` · `PATCH` · `DELETE`(로그인 · 로그아웃 포함)는 CSRF 토큰이 필요하다(「6」) |
| 시연 사무실 | 같은 API · 같은 검사를 쓴다. 응답의 `workspace.kind`가 `demo`이고, GitHub 링크(`htmlUrl`)는 `null`이다. 수동 동기화는 GitHub를 부르지 않고 바로 성공한다 [구현 기본값] |

- 전체 관리자(ROLE-03) [구현 기본값 — 최소 권한부터]: v1에 전용 화면 · API를 두지 않고, 다른 사무실 데이터나 개인 지표에 접근하는 추가 권한도 주지 않는다. 운영 값(강사 허용 목록 · 심사용 계정 · 시연 사무실 접근 대상)은 서버 설정으로 다룬다. 필요한 권한이 생기면 그 기능을 만들 때 최소 범위로 더한다(02-workflow.md ROLE-03의 "사무실 관리 · 사용자 · 권한 관리"는 그때 구체화).
- 데모의 작업 · 팀원 CRUD, `/api/demo` · `/api/reset`은 만들지 않는다 [계약].
- GitHub 원본을 바꾸는 엔드포인트는 없다. "이슈로 만들기" · "PR 병합" 같은 버튼은 화면이 GitHub 주소(`htmlUrl` 또는 사무실의 `githubOwner` · `githubRepo`로 만든 새 이슈 주소)로 이동시킨다(P3).

## 5. 요청 · 응답 DTO 원칙

- [확정] Entity를 그대로 응답하지 않는다. 본인 · 강사 여부로 필드를 빼는 응답은 DTO를 따로 둔다.
- [확정] 평가 응답에는 평가자가 없고, 현재 회차의 추천·비추천 수와 이유만 있다. 이전 회차는 회차 목록으로 따로 읽는다.
- [확정] 사람별 합계 · 순위 필드가 없다.
- [계약] DTO 필드 표는 CONTRACTS_API.md의 TypeScript 표기가 기준이다. 백엔드는 같은 이름 · 같은 타입의 Java `record`로, 프론트는 같은 TypeScript 타입으로 만든다.
- [계약] 시각 필드 이름은 `…At`(UTC `Instant` — `"2026-11-03T05:12:00Z"`처럼 `Z`로 끝나는 ISO 8601. 소수 초는 있어도 되고 화면은 둘 다 읽는다), 날짜 필드는 `…Date`(`LocalDate` — `"YYYY-MM-DD"`, 한국 시간 기준 달력 날짜), 시간 길이는 단위를 붙인다(`reviewWaitHours` · `durationMinutes`). GitHub 번호와 앱 ID를 나눈다(`githubIssueNumber` ↔ `taskId`).
- [계약] 필드는 빼지 않는다 — 값이 없으면 `null`, 목록이 비면 `[]`. 선택 필드(`?`)는 쓰지 않는다. 요청에서 알 수 없는 필드는 무시하지 않고 `invalid`로 거부한다(오타가 조용히 사라지지 않게) [구현 기본값].
- [계약] 길이 범위가 1자부터인 글 필드(CONTRACTS_API.md의 "1~N자" — 제목 · 내용 · 본문 · 결론 · 배운 점 · 이름 · 경로)는 **공백 문자만으로 된 값을 `invalid`로 거부한다**(2026-11-06 결정 — #175). 길이는 보낸 값 그대로 세고, 앞뒤 공백을 지우지 않고 저장한다. `null`을 받는 필드는 `null`이면 이 검사를 하지 않는다. 평가 이유(`reason`)는 따로 앞뒤 공백을 뺀 뒤 1~200자다(CONTRACTS_API.md 「9」).
- [계약] 시연 사무실의 응답에는 사무실 종류(`demo`)가 들어 있어 화면이 "시연 데이터"를 표시할 수 있다.
- [계약] 이슈 응답에는 담당자 전원(`assigneeMemberIds` — 「3」 대표 담당자 순서)이 들어 있다. 화면은 첫 번째를 대표 담당자로 쓴다.
- [계약] 아직 구현하지 않은 Should · Could 기능의 응답 필드도 계약에 둔다 — 구현 전까지 빈 배열 · `null` · `false`로 낸다. 필드 모양을 나중에 바꾸지 않으려는 것이다.

### 익명성 [확정 → 계약]

- `Evaluation`의 평가자, `PeerFeedback`의 작성자는 **어떤 응답에도** 담지 않는다 — Snapshot, PR 상세, 회차 목록, 안건(PR 안건에 붙는 이유), 학습 타임라인 · 리포트 · 카드의 "받은 평가" 칸, 강사 요청함 모두. 평가 이유 목록에는 평가 ID · 평가자 ID · 시각도 넣지 않고, 정렬은 "추천 먼저, 그 안에서 저장 순서"다.
- 요청한 사람 자신의 평가는 `myEvaluation`으로 따로 돌려준다(본인 것이므로 익명성과 충돌하지 않는다).
- 익명이 아닌 기록(안건을 올린 사람, 도움 요청자, 코멘트 작성자, 강사 피드백 · 꼬리질문 작성 강사, 활동 기록 작성자 · 확인자)은 정책대로 팀에 보인다. 개인과 관련됐다는 이유만으로 숨기지 않는다.

### WorkspaceSnapshot과 개인 API의 경계 (2026-11-03 결정 — Q3) [계약]

| | `WorkspaceSnapshot` (`GET …/snapshot`) | 개인 API (`…/members/{memberId}/…`) |
| --- | --- | --- |
| 담는 것 | 3D 사무실 · 상단 바 · 상세 패널 · 게시판 · 요구사항 패널 · 일정판이 쓰는 **사무실 공통 데이터** — 사무실 · 요청자 정보(`viewer`) · 팀 설정 · 동기화 상태 · 팀원 · 이슈(마감 포함) · PR(현재 회차 요약) · 요구사항 · 연결 · 안건(결정 · 강사 피드백 포함) · 회의 · 도움 요청 요약 · 확인된 활동 메모 · 흐름 계산 값 | 학습 타임라인 · 회고 리포트 · 기술 결정 카드와 꼬리질문 |
| 누가 받나 | 그 사무실에 접근할 수 있는 모든 사람이 **같은 모양**을 받는다. 요청자에 따라 달라지는 필드는 `viewer`와 `myEvaluation` · `canEvaluate`뿐 | 본인과 그 사무실에 지금 지정된 강사만. 다른 학생은 `forbidden_role` |
| 넣지 않는 것 | 개인 지표 전부, 평가자 · 동료 피드백 작성자, 동료 피드백 내용, 활동 기록의 시간(P6), 토큰 · 이메일 · 세션 값 | — |
| 테마 | 테마를 모른다 — 좌표 · 가구 이름이 없다. 화면이 SceneModel → ThemeLayout으로 바꾼다(「8」) | — |

- Snapshot은 데모의 화면 묶음 타입 `Workspace`(`members` · `tasks` · `meetings` …)를 이어받아 v1 모델로 확장한 것이다(「8」). 필드 표는 CONTRACTS_API.md 「5」.
- 도움 요청 코멘트 본문, 회차 목록, 강사 지정 목록, 스탠드업, 활동 기록 목록처럼 패널을 열 때만 필요한 것은 각자의 API로 읽는다.

## 6. 에러 응답과 Security 규칙

### 에러 [확정 — 코드 컨벤션 (BE) 「에러 응답」]

`{ "error": { "code": "...", "message": "..." } }` — code는 소문자 snake. `invalid`(400, 요청 출처 검사 실패는 403) · `not_found`(404) · `conflict`(409) · `unavailable`(503) · `unauthorized`(401) · `forbidden_role`(403) · `github_unauthorized`(503) · `github_rate_limited`(503). 새 code를 만들지 않는다(2026-10-30 결정). `message`는 화면에 보일 한국어 문장이고 내부 정보(스택 · SQL · 토큰)를 담지 않는다.

**상황별 code [계약]** — 같은 상황은 모든 엔드포인트에서 같은 code다.

| 상황 | code (HTTP) |
| --- | --- |
| 세션 없음 · 만료, 심사용 로그인 실패(어느 값이 틀렸는지 말하지 않음) | `unauthorized` (401) |
| CSRF 토큰 없음 · 틀림, 허용 출처(`APP_ORIGIN`)가 아닌 쓰기 요청 | `invalid` (403) |
| 입력 오류 — 필수 칸 없음, 길이 · 범위 밖, 이유 없는 평가, 날짜 순서, 알 수 없는 enum · 필드, 본문의 ID 형식, 승인되지 않은 계정을 강사로 지정 | `invalid` (400) |
| 사무실이 없거나 들어갈 수 없음 — 콜라보레이터가 아님, 지정되지 않았거나 해제된 강사, 실제 사무실을 요청한 심사용 계정, 등록되지 않은 사용자의 시연 사무실 | `not_found` (404) — 존재를 숨긴다 [구현 기본값] |
| 대상이 없거나 다른 사무실 것, 경로의 ID 형식 오류, 꺼진 환경의 심사용 로그인 경로 | `not_found` (404) |
| 사무실 안에서 역할이 맞지 않음 — 강사의 허용되지 않은 쓰기, 참여자의 레포 관리자 동작, 다른 학생의 개인 지표 요청 | `forbidden_role` (403) |
| 대상 조건 위반 — 자기 PR 평가, 요청되지 않은 건에 강사 쓰기, 올린 사람이 아닌 거두기, 요청자가 아닌 닫기 · 전환 · 삭제, 담당자가 아닌 마감 수정, 남의 카드 · 리포트 고치기 | `forbidden_role` (403) |
| 상태 충돌 — 지난 회차 평가, 닫힌 PR 평가, 이미 다룬 · 거둔 안건, 진행 중 회의가 이미 있음, 동기화가 이미 진행 중, 이미 열린 사무실, `active`가 아닌 요구사항에 연결, 같은 PR의 카드 중복, 레포 관리자가 자기 자신을 강사로 지정, 해결 · 종료된 도움 요청에 강사 요청, 지정된 강사가 없는 사무실에서 새 강사 요청, 거두지 않은 안건이 이미 있는 도움 요청의 전환, 삭제 제한에 걸린 도움 요청 삭제(CONTRACTS_API.md 「11」) | `conflict` (409) |
| GitHub 인증 실패 · 호출 한도 | `github_unauthorized` · `github_rate_limited` (503) |
| 그 밖의 서버 오류 | `unavailable` (503) |

- 입력 형식 오류와 권한 오류가 한 요청에 같이 있으면 어느 쪽이 먼저 나와도 된다(Spring의 요청 본문 검증이 인가보다 먼저 돌 수 있다). 계약 테스트는 한 가지만 틀린 요청으로 검사한다.

### 역할 판정 [확정 — 05 P1]

| 역할 | 판정 | 언제 확인 |
| --- | --- | --- |
| ROLE-02 레포 관리자 | 그 레포 admin | 로그인할 때 레포마다 확인해 세션에 둔다 |
| ROLE-01 참여자 | 그 밖의 레포 콜라보레이터(read 포함) | 위와 같음 |
| ROLE-04 강사 | GitHub 로그인 → 서버 설정 허용 목록(GitHub 사용자 ID)에 있음 → 레포 관리자가 그 사무실에 지정함. 콜라보레이터가 아니어도 된다 | 허용 목록은 서버 설정, 지정은 **요청마다** 앱 DB 확인 |
| ROLE-03 전체 관리자 | `MASTER_ADMIN_GITHUB_LOGIN` | 서버 설정 |
| 심사용 계정 | 시연 사무실 접근 대상에 등록된 역할(ROLE-01 · 02 · 04 중 하나) | 로그인할 때 확인해 세션에 둔다. 강사 역할은 지정과 같이 요청마다 확인한다 |

- [확정] 일반 학생은 강사로 지정할 수 없다.
- [확정] 한 사무실에서 한 사람의 역할은 하나다. 강사로 지정된 사무실에서는 강사 정책만 적용하고 ROLE-01 · 02 쓰기 권한을 합치지 않는다(권한 상승 방지). 레포 관리자가 자기 자신을 지정하는 요청은 거부한다.
- [확정] 허용 목록의 강사 계정은 어느 사무실에서도 ROLE-01 · 02로 판정하지 않는다. 지정되지 않았거나 지정이 해제된 사무실에는 콜라보레이터여도 접근할 수 없고(`not_found`), 팀원(`Member`)에 들지 않는다. 해제해도 과거 기록은 남는다(2026-11-01 추가 결정 — 사용자 확인).
- [확정] 심사용 계정은 시연 사무실에만 접근하고 GitHub 권한이 없다. 테스트 계정이라고 검사를 건너뛰지 않는다(P15).
- [계약] 공용 컨벤션 라이브러리(서버 전체에 하나 — FR-LIB) 권한:

  | 계정 | 조회 | 등록 · 수정 |
  | --- | --- | --- |
  | 실제 GitHub 강사 계정 — 허용 목록에 있고 지금 지정된 사무실이 하나 이상 | 가능 | 가능 |
  | 심사용 ROLE-04 계정 | 가능 | **불가** — `403 forbidden_role` |
  | 학생(참여자 · 레포 관리자), 그 밖의 로그인 사용자 | 가능 | 불가 — `403 forbidden_role` |

  심사용 계정의 쓰기 거부는 일반 강사 권한을 줄이는 것이 아니라 **심사용 계정에 적용하는 데이터 격리 규칙**이다. 심사용 계정은 시연 사무실에만 접근해야 하고(P15), 라이브러리는 실제 조들이 함께 보는 서버 전역 데이터라 심사용 계정이 바꾸면 시연 사무실 밖에 영향이 간다. 계약 테스트 「9」에 거부 시나리오가 있다.

**식별자 원칙 [계약 — 2026-11-03 정리]**: 강사 허용 목록 · 강사 지정 · 작성자 판정 · 팀원 매칭은 **GitHub 사용자 ID**(바뀌지 않는 값)와 내부 ID로만 한다. GitHub 로그인 이름은 표시 속성이다. 그래서 강사 지정 API는 `/instructors/{githubUserId}`이고(이전 초안의 `/instructors/{login}`을 대신함), `InstructorAssignment`는 GitHub 사용자 ID를 저장한다. (ROLE-03의 `MASTER_ADMIN_GITHUB_LOGIN`은 로그인 이름이지만 v1에 ROLE-03 전용 권한이 없어 이번 범위에서 바꾸지 않았다 — 「10」 별도 이슈 후보.)

### 검사 순서 [계약]

1. 로그인(세션) — 없으면 `unauthorized`
2. 사무실 접근 — 그 사무실에 아래 중 하나가 있어야 한다. 없으면 `not_found`
   - `github` 사무실: 세션의 그 레포 역할(ROLE-01 · 02) — 단 허용 목록 계정은 해당 없음. 또는 허용 목록 계정이고 그 사무실의 현재 강사 지정(DB)
   - `demo` 사무실: 시연 사무실 접근 대상 등록(심사용 계정) 또는 현재 강사 지정
   - 결과로 그 사무실에서의 역할 하나(`repo_admin` · `participant` · `instructor`)와 팀원(`memberId` — 강사는 없음)이 정해진다
3. 대상 존재 — 경로의 대상이 그 사무실 것인지(`findByIdAndWorkspaceId`). 아니면 `not_found`
4. 동작 권한 — CONTRACTS_API.md의 역할 열. 맞지 않으면 `forbidden_role`
5. 대상 조건 · 상태 — 작성자 제외, 요청이 켜진 건인지, 본인인지(`forbidden_role`) / 회차 · 안건 · 회의 상태(`conflict`)

검사는 인가 서비스 한 곳에서 하고 각 Controller가 부른다. 화면에서 버튼을 숨긴 것은 검사가 아니다(FR-AUTH-04). 요청 본문 · 쿼리에 담긴 사용자 값(`X-Actor` 같은 헤더, 본문의 작성자 ID)을 믿지 않고 세션의 사용자만 쓴다. 개인 API의 "본인"은 세션 사용자의 그 사무실 `memberId`와 경로의 `memberId`가 같은지로만 판정한다 — 다른 학생의 ID를 넣으면 `forbidden_role`이다.

### 세션 · 쿠키 · CSRF · SSE [계약] (배포하지 않음 · 로컬 실행 — 2026-11-09 결정)

**반드시 지킬 것** — 배포 환경과 상관없이 계약이다.

- v1은 외부에 배포하지 않고 로컬에서 실행한다(SP11 · 2026-11-09 결정 — 2026-11-01 "외부 공개 배포"를 대신함). 나중에 외부에 공개하면 HTTPS로만 받는다.
- 세션은 서버 세션(HttpSession)이고 30분~1시간 뒤 만료된다 [확정]. 로그인 방식이 둘이어도(GitHub OAuth · 심사용 ID/PW) 세션 · CSRF · 인가는 하나의 Spring Security 설정을 쓴다. **로그인할 때 세션 ID를 새로 발급한다**(세션 고정 방지). 로그아웃은 `POST`만 받고 세션을 끝낸다.
- 세션 쿠키는 `HttpOnly`, HTTPS 환경에서 `Secure`, `SameSite`를 붙인다. 응답 본문 · 로그에 세션 ID · 토큰 · 비밀번호 · 이메일을 담지 않는다(NFR-04).
- CSRF: Spring Security 방어를 켠다. 모든 상태 변경 요청(`POST` · `PUT` · `PATCH` · `DELETE`, 로그인 · 로그아웃 포함)에 토큰을 요구한다. SPA는 쿠키로 받은 토큰을 헤더로 보낸다. 실패는 `invalid`(403).
- 허용 출처: 쓰기 요청의 `Origin`이 `APP_ORIGIN`이 아니면 거부한다(NFR-05). SPA를 같은 출처로 서빙하면 CORS를 열지 않는다.
- 인증 안 된 API 요청은 로그인 페이지로 리다이렉트하지 않고 `401 unauthorized` JSON으로 응답한다(SPA가 처리).
- SSE: 연결할 때 「검사 순서」 1 · 2를 한다. 이벤트에는 바뀐 자원의 종류만 담고 내용 · 개인 지표를 담지 않는다 — 화면은 권한 검사를 거친 REST로 다시 읽는다. 세션이 끝나거나 그 사무실 접근이 없어지면(강사 지정 해제 등) 그 연결로 더 보내지 않고 닫는다.
- 심사용 로그인은 설정으로 켠 환경에서만 경로가 있다(꺼지면 `not_found`). 반복 실패 제한은 구현 때 검토한다 `[제안]`.

**구현 기본값** — 「10」에 모았다(세션 만료 60분, `SameSite=Lax`, CSRF 쿠키 · 헤더 이름, OAuth 기본 경로, SSE keep-alive). 값을 바꾸면 보안에 닿으므로 「9」 계약 변경 절차를 따른다.

## 7. GitHub 어댑터 인터페이스 [계약]

GitHub API를 부르는 유일한 곳이다(코드 컨벤션 (BE) 「꼭 지킬 것」 1). **읽기 메서드만 둔다** — 원본을 바꾸는 메서드를 인터페이스에 만들지 않는다.

| 메서드 (이름은 구현 때) | 하는 일 | 메모 |
| --- | --- | --- |
| 사용자 · 레포 권한 조회 | 로그인한 사용자의 레포별 권한(admin · 콜라보레이터) | 어느 자격 증명으로 조회하나는 B1 구현 때 정한다. 실제 사무실 전용 |
| 설치 목록 · 레포 목록 | 앱이 설치된 계정(조직)과 레포 | FR-GH-01 |
| 이슈 변경분 | 기준 시각 이후 바뀐 이슈(담당자 전원 · 닫힘 사유 포함) | NFR-10 · FR-GH-02 |
| PR 변경분 | 기준 시각 이후 바뀐 PR(`headSha` · Draft · 머지 포함) | FR-GH-02 |
| 리뷰 · 리뷰 요청 | PR별 | FR-FLOW 계산 재료 |
| 커밋 시각 | PR · 이슈별 마지막 커밋 시각, 사용자별 커밋(스탠드업 미리 채우기) | 막힘 "커밋 없음" · FR-MTG-01 |
| 콜라보레이터 | 레포 콜라보레이터 목록(GitHub 사용자 ID · 로그인 이름 · 사진 · admin 여부) | FR-GH-04 |
| PR–이슈 연결 | GitHub가 공식으로 인식하는 연결 관계 | [확정] 본문 · 제목의 `#N` 언급은 읽지 않는다. 조회 API는 구현 때 — ARCHITECTURE.md 「GitHub 원본 상태와 앱 상태」 |
| 명세 문서 읽기 | 경로의 파일 내용 | FR-REQ-01 · 02 |

- 구현은 두 개다. ① GitHub 어댑터(실제 사무실) ② Seed 어댑터(시연 사무실, 같은 결과 모양). 서버는 사무실 종류로 고른다. 시연 사무실 · 심사용 계정은 GitHub를 부르지 않는다.
- 결과 타입은 어댑터 패키지의 GitHub 모양 DTO(`GithubIssue` · `GithubPullRequest` …)이고, GitHub 식별자는 자바 `long` · `int`로 담는다. sync가 이것을 앱 Entity로 바꾼다. 어댑터 밖으로 GitHub 응답 JSON을 그대로 내보내지 않는다.
- 이슈 · PR 만들기 · 닫기 · 병합, 라벨 · 담당자 변경 메서드는 만들지 않는다 — 화면이 GitHub 웹페이지로 이동시킨다(P3). 허용되는 `POST`는 OAuth 코드 교환과 설치 토큰 발급뿐이고, GraphQL은 query만 쓴다.
- 실패는 `github_unauthorized` · `github_rate_limited` · `unavailable`로 바꾸고, `SyncState`에 마지막 성공 시각과 사유를 남긴다(FR-GH-05). 화면은 마지막 데이터를 유지한다.

## 8. 프론트 계약 [계약]

### DataSource (`frontend/src/data/DataSource.ts`)

이름과 교체 구조는 유지한다(CON-05). 구현은 `mock`(화면 개발 · 테스트 — 브라우저 메모리 · localStorage)과 `api`(Spring) 두 개.

- **메서드는 API 엔드포인트와 1:1이다.** 메서드 이름과 대응 엔드포인트는 CONTRACTS_API.md 「0. 엔드포인트 한눈에」의 "DataSource" 열이 기준이다. 데모의 `createTask` · `updateTask` · `deleteTask` · `createMember` · `updateMember` · `deleteMember` · `setDemoMode` · `getDemoMode` · `reset`은 없앤다(CON-02 · 「4」).
- 인자 순서는 `(workspaceId, 경로의 다른 ID…, 요청 DTO)`이고, 반환은 응답 DTO 타입 그대로다(`Promise<T>`, `204`는 `Promise<void>`).
- 실패는 `DataError(message, code)`로 던진다. `code`는 「6」의 8개 값 전부다 — 데모의 `DataErrorCode`(4개)를 넓힌다. 화면은 `unauthorized`면 로그인 화면으로, `not_found`면 그 대상을 화면에서 지우고, `unavailable`이면 재연결을 시도한다(데모 `toError` 동작 유지).
- 읽기의 중심은 `load(workspaceId): Promise<WorkspaceSnapshot>`과 `subscribe(workspaceId, onChange): () => void`다.

```ts
// subscribe 가 넘기는 변경 — 서버 SSE 이벤트(CONTRACTS_API.md 「6」)를 옮긴 것
type Change =
  | { type: 'changed'; resources: SnapshotResource[] } // 화면은 load()로 Snapshot을 다시 읽는다
  | { type: 'sync'; status: SyncStatus }               // 동기화 시작 · 끝
  | { type: 'connection'; status: 'connecting' | 'online' | 'offline' }; // 데모와 같음
```

- `mock`은 같은 인터페이스 · 같은 DTO 타입을 쓰고, ID는 자기 문자열을 만들어도 된다(「2」 변환 경계). 권한 · 개인 지표 접근 같은 서버 규칙을 mock이 흉내 낼 필요는 없다 — 그것은 Spring 통합 테스트가 맡는다(「9」).

### WorkspaceSnapshot

- 서버 Entity `Workspace`(사무실)와 구분하려고 화면 묶음 타입은 `WorkspaceSnapshot`으로 부른다 [구현 기본값 — 2026-11-01 추가 결정]. 데모 `Workspace`(`projects` · `members` · `tasks` · `meetings` · `activity`)를 이어받는다 — `members` · `tasks` · `meetings`는 이름을 유지하고 v1 필드로 바꾸며, `projects`와 변경 로그 `activity`는 없앤다(06 「그 밖의 기존 모델」). 필드 표 · 예시는 CONTRACTS_API.md 「5」.
- 개인 학습 데이터는 Snapshot에 없다. 내 학습 타임라인 · 회고 리포트 화면은 열 때 개인 API를 부른다(「5」 경계).
- 스토어(`store.ts`)는 Snapshot 사본과 선택 · 드래그 · 낙관적 갱신을 갖는다. 낙관적 갱신은 앱 기록 쓰기(연결 · 안건 · 평가 · 마감)에만 하고 GitHub 원본 값에는 하지 않는다.

### SceneModel · ThemeLayout

```ts
type PlaceRole =
  | 'backlog' | `desk:${string}` | 'review' | 'done'      // desk:<memberId>
  | 'meeting' | 'board' | `requirement:${string}`;        // requirement:<requirementId> · 대기 칸은 requirement:waiting(내부 ID는 숫자라 겹치지 않음)

interface SceneEntity {
  key: string;               // 종류를 붙인 화면 키 — 'task:42' · 'submission:42' · 'agenda:7' · 'member:3' · 'requirement:5' · 'requirement-group:waiting' · 'board'
  kind: 'issue' | 'pr' | 'help' | 'learning' | 'other' | 'activity' | 'avatar' | 'requirement' | 'requirementGroup' | 'board';
  refId: string | null;      // 가리키는 도메인 내부 ID (대기 칸 · 게시판은 null)
  placeRole: PlaceRole;
  badges: string[];          // 막힘 · 추천·비추천 수 · 대기 칸 waiting:N · empty:k · 게시판 help:N · candidate:k · Draft · 미병합 종료 · 시연 데이터 등
  highlight?: 'blocked' | 'recent' | 'dim' | 'focus';
  groupKey?: string;         // 요구사항 종류(원본 ID 접두사), 없으면 "미분류" — 이름표 · 분류 · 정렬용, 묶음 기준 아님
}

interface ThemeLayout {
  anchor(role: PlaceRole, index: number): [x: number, y: number, z: number];
  dropZoneAt(point: [number, number, number]): PlaceRole | null;
  route?(from: PlaceRole, to: PlaceRole): [number, number, number][]; // 아바타 이동
}
```

- SceneModel은 `WorkspaceSnapshot`(과 요구사항 판 교환 결과) → `SceneEntity[]`의 순수 함수다. 테마를 모른다. 내부 ID는 테이블마다 따로 매기므로 화면 키(`key`)에는 종류를 붙인다(「2」).
- 회의 공간의 안건 표현은 `kind`가 안건 종류(이슈 안건 → `issue` 모양)이고 `key`는 `agenda:<agendaItemId>`다. 원본 이슈 · PR의 SceneEntity는 따로 제자리에 있다.
- 대표 담당자 = `task.assigneeMemberIds[0]`(「3」). 막힘 · 진행률 같은 도메인 값은 Snapshot의 서버 계산 값을 쓴다.
- ThemeLayout 구현은 기본 테마(우주정거장 — 확정 시안 `frontend/public/station/`, 2026-11-04) 하나다. 테마 엔진은 만들지 않는다 [확정].
- 드롭 결과: `requirement:*` → `linkRequirement`(상자는 제자리), `meeting` → `createAgendaItem`(원본은 제자리), 그 밖은 아무 일도 없음 [확정 — 위치 규칙]. 단, 대기 칸(`requirement:waiting`)에 놓으면 대기 목록에서 요구사항을 하나 고른 뒤 `linkRequirement`. 요구사항이 없는 빈 판은 드롭 구역이 아니다(`dropZoneAt` → `null`, 드롭 빛 없음) [2026-11-06 결정].
- 안건 철회 드롭 [2026-11-09 결정 — #291 · FR-LRN-14]: 회의실(브리지) 탁자 근처에 쓰레기통을 둔다(구역 역할이 아니라 화면 장치 — `dropZoneAt` · SceneModel은 그대로). 회의실 탁자의 안건 도형은 보는 사람이 거둘 수 있는 안건(올린 사람 본인 · `confirmed`)만 집어 들 수 있고, 쓰레기통에 놓으면 `withdrawAgendaItem`(안건은 `withdrawn` — 원본 이슈 · PR은 그대로, 도움 요청 안건이면 그 도움 요청이 안건으로 전환하기 직전 상태로 돌아가 라벨 · 버튼도 그때와 같아진다 — CONTRACTS_API.md 「10」 · 「11」 · 2026-11-10 #313), 그 밖에 놓으면 아무 일도 없다. 다른 사람의 안건 · 결정된 안건은 집어 들 수 없고, 놓는 순간 다시 확인하며 서버의 403 · 409가 최종이다. 회의 시작 대화상자의 거두기 버튼은 그대로 둔다.
- 요구사항 판 배치 [2026-11-06 결정]: 판 수 · 기본 순서 · 대기 칸 · 교환은 「10」과 ARCHITECTURE.md 「요구사항 묶음 표시」를 따른다. 대기 칸 교환 결과(판에 올린 요구사항 ID 목록, `string[] | null`)는 사무실별로 보는 사람의 브라우저에만 둔다 — 서버 저장 · API 없음. 스토어가 내주고 SceneModel이 입력으로 받는다. 보는 사람마다 배치가 다를 수 있다.
- 게시판 [2026-11-06 결정]: `board` 오브젝트 하나. 배지는 `help:N`(`open` · `discussing` 도움 요청 수) · `candidate:k`(그중 `isAgendaCandidate`, k > 0일 때만)이고 0이면 붙이지 않는다. 회의 결정 기록 · 강사 피드백 · 배운 점은 세지 않는다. 고르면 HUD의 도움 요청 목록을 연다 — 회의 결정 기록 · 강사 피드백을 보는 HUD가 생기면 그것도 연다(FR-LRN-22). 도움 요청마다 3D 도형을 두지 않는다(시안 선반의 도형은 장식). 팀원 · 강사 모두 같은 값이고 사람별 값은 없다.

## 9. 계약 변경 절차 [계약]

개발 저장소는 모노레포다(2026-11-03 결정 — Q6). 계약이 구현되는 파일과, 그 계약이 바뀔 때 알려야 하는 역할은 아래와 같다.

| 계약 묶음 | 파일 (개발 저장소 — 신규 예정) | 바뀌면 알릴 역할 (BACKEND · SCREEN_ASSIGNMENTS) |
| --- | --- | --- |
| 이 문서 · CONTRACTS_API.md | 기획 저장소 `docs/` — 개발 저장소 생성 뒤의 위치는 아래 메모 | B · C · D 전원 |
| 도메인 모델 · Entity · DB 스키마 | `backend/` 각 패키지 `domain/` · migration 파일 | B · C (D에도 공유) |
| 요청 · 응답 DTO · API 경로 | `backend/` 각 패키지 `dto/` · Controller | B · C · D |
| 계약 예시 JSON | `contract/examples/` (모노레포 루트 — 백엔드 · 프론트 테스트가 함께 읽는다) | B · C · D |
| 공통 에러 · 보안 설정 · 인가 서비스 · ID 변환 | `backend/` `common/` · `auth/` | B (C에도 공유) |
| GitHub 어댑터 인터페이스 | `backend/` `github/` | B (C에도 공유) |
| DataSource · 화면 타입 | `frontend/src/data/DataSource.ts` · `types.ts` | D, B · C |
| SceneModel · ThemeLayout | `frontend/src/scene/model/` · `frontend/src/theme/` | D |

**문서 관리 방식** (2026-11-03 결정 — 팀의 실제 운영 방식)

1. 기획 문서(이 문서 · CONTRACTS_API.md 포함)의 최종 수정 권한과 GitHub 반영은 **문서 담당자 1명**이 관리한다. Claude Code는 문서 담당자의 지시로 문서를 고친다. 담당자 이름은 팀이 정해 공지한다.
2. 다른 팀원은 GitHub의 최신 기획 문서를 읽고, 의견 · 수정 요청을 문서 담당자에게 전한다(이슈 · 댓글 · 메시지 등 편한 방법). 문서 담당자가 검토해 반영한다.
3. 문서 변경마다 PR을 만들거나 팀원 리뷰를 받는 것은 의무가 아니다. 변경 이력은 **GitHub 커밋**으로 추적한다 — 계약을 바꾼 커밋 메시지에는 바꾼 절(예: 「CONTRACTS_API.md 「9」 EvaluateRequest」)을 적는다.
4. **확정 계약 버전 = 기획 저장소의 커밋**이다. 기준 브랜치와 커밋 SHA는 문서 담당자가 공지한다. 모든 개발자와 Claude Code 세션은 같은 계약 커밋을 기준으로 병렬 개발하고, 작업(이슈 · PR 본문 · 세션 지시)에 기준 계약 커밋을 적는다.
5. 확정 계약을 바꾸면 문서 담당자가 위 표의 "바뀌면 알릴 역할"(API · DTO · Entity 담당자)과 진행 중인 Claude Code 세션에 **새 커밋 SHA와 바뀐 절**을 공유한다. 세션은 그 커밋을 다시 읽고 이어 간다.
6. **문서가 먼저, 코드가 나중**이다. 호환을 깨는 변경(필드 이름 · 타입 · 필수 여부 · enum 값 삭제 · 경로 · 상태 코드)은 계약 문서를 먼저 고쳐 공유한 뒤 코드를 바꾼다(Q5의 "계약 PR이 먼저"는 이 순서를 뜻한다). 개발자는 계약 문서에 없는 계약을 코드에서 먼저 만들지 않고, 필요하면 문서 담당자에게 요청한다.
7. 개발 저장소의 **코드 변경**(Java DTO · TypeScript 타입 · 예시 JSON 포함)은 기존 Git 전략(이슈 · PR · 승인 1명 · squash)을 그대로 따른다. 모노레포라 계약에 닿는 Java DTO · TypeScript 타입 · 예시 JSON은 한 PR에서 함께 바꾸고, PR 본문에 기준 계약 커밋을 적는다.

- 문서 위치: 개발 저장소를 만들 때 이 문서와 CONTRACTS_API.md를 개발 저장소 `docs/`로 옮길지는 저장소 생성 때 정한다. 옮기면 그 뒤로는 개발 저장소 쪽이 기준이고 기획 저장소에는 링크를 남긴다(같은 계약을 두 곳에 두지 않는다).

### 계약 테스트 (2026-11-03 결정 — Q5)

논리 계약의 기준은 이 문서와 CONTRACTS_API.md다. OpenAPI 기반 TypeScript 자동 생성 · Swagger UI는 필수가 아니다(필요하면 나중에 검토). 실제 테스트 코드는 개발 저장소를 만든 뒤 쓴다 — 아래는 범위와 통과 기준이다.

**Java DTO ↔ TypeScript 타입 ↔ 실제 JSON 응답 맞추기 — 기준 자료는 `contract/examples/`의 공통 JSON이다**

세 가지를 따로 검사해야 셋 사이의 불일치가 모두 잡힌다. 컴파일 통과만으로는 계약 검증이 아니다.

| 쪽 | 검사 | 잡는 것 |
| --- | --- | --- |
| 예시 (기준 자료) | `contract/examples/<묶음>/<이름>.json` — CONTRACTS_API.md의 대표 요청 · 응답 예시를 옮겨 시작한다. 엔드포인트마다 성공 응답 1개 이상, 요청 본문이 있으면 요청 1개 | — |
| 백엔드 ① 예시 ↔ Java DTO (JUnit + Jackson) | 응답 예시를 해당 Java 응답 DTO로 역직렬화하고(모르는 필드 = 실패), 다시 직렬화해 원래 JSON과 같은지(필드 이름 · 값 · `null` 포함) 비교한다. 요청 예시는 요청 DTO로 읽힌다 | Java DTO에 필드가 빠졌거나 · 남거나 · 이름 · 타입 · enum 값이 다름 |
| 백엔드 ② 실제 응답 ↔ 예시 (Spring 통합 테스트) | 아래 시나리오의 실제 HTTP 응답 JSON이 같은 예시와 **같은 키 집합 · 같은 값 종류**(문자열 · 숫자 · 불리언 · `null` 허용 · 배열 · 객체)를 갖는지 비교한다. 값 자체는 비교하지 않는다 | 직렬화 설정 · 변환 코드 때문에 실제 응답만 달라진 경우(예: ID가 숫자로 나감, 시각에 `Z`가 없음) |
| 프론트 ③ TypeScript 타입 (정적 검사) | 예시마다 **TS 사본 상수**를 `satisfies`로 둔다 — `export const taskExample = { … } satisfies TaskDto;`(위치 예: `frontend/tests/contract/examples.ts`). 이 파일이 `tsc -b`(`npm run build`)의 검사 범위에 들도록 tsconfig에 넣는다 | TS 타입에 필드가 빠졌거나 · 남거나(객체 리터럴의 초과 속성 검사) · 유니언 값이 아닌 문자열 |
| 프론트 ④ TS 사본 ↔ 공통 JSON (값 비교) | 테스트가 `contract/examples/`의 JSON을 읽어 ③의 TS 사본과 `assert.deepStrictEqual`로 비교한다(데모에 있는 `node:test` + `tsx` — 새 라이브러리 없음) | TS 사본과 공통 JSON이 서로 다른 값으로 바뀐 경우 |
| 공통 규칙 | ①② 응답 JSON 전체를 돌며 ⓐ `id` · `…Id` · `…Ids` 필드는 문자열(배열) ⓑ `…At`은 `Z`로 끝나는 시각 ⓒ `…Date`는 `YYYY-MM-DD` ⓓ 알려진 enum 값만 | 「2」 · 「5」 규칙 위반 |

- **왜 JSON을 바로 import하지 않나**: `.json`을 import하면 TypeScript가 `"open"` 같은 값을 `string`으로 넓혀 추론한다. 그러면 `state: 'open' | 'closed'` 같은 유니언 필드에 넣을 때 실패하고, 이를 피하려고 `as TaskDto`로 단언하면 아무것도 검사하지 않는다. 그래서 정적 검사는 TS 사본(③)으로, 사본과 공통 JSON이 같은지는 값 비교(④)로 나눈다.
- **`satisfies DTO` 또는 `as const satisfies DTO`**: 둘 다 리터럴을 대상 타입 기준으로 검사해 유니언 값이 통과하고, 객체 리터럴의 모르는 필드는 오류가 난다(TypeScript 5.6으로 확인 — JSON 직접 import는 `state: string`으로 넓어져 오류, 모르는 필드 `extra`는 TS2353 오류). 기본은 짧은 `satisfies DTO`로 쓰고, 사본 상수의 값을 바꾸지 못하게 하고 싶으면 `as const satisfies DTO`를 쓴다.
- **정적 검사와 데이터 검사의 차이**: ③은 "TS 타입과 이 예시 모양이 맞는가"만 컴파일 때 본다. 실제 서버가 내보내는 JSON이 계약대로인지는 ①(Java DTO 모양)과 ②(실제 응답)가 실행해서 본다. 브라우저에서 응답을 런타임 검증하는 코드는 v1에 두지 않는다.
- TS 사본은 공통 JSON을 손으로 옮긴 것이고 ④가 어긋남을 막는다. 코드 생성 도구는 쓰지 않는다. 예시를 바꿀 때는 JSON과 TS 사본을 같은 PR에서 함께 바꾼다.

**백엔드 계약 테스트 (Spring 통합 테스트 — 실제 HTTP 요청 · 세션 · CSRF)** — `[구현 기본값]` 테스트 DB는 골격 때 정한다.

| 묶음 | 꼭 있어야 하는 시나리오 |
| --- | --- |
| 인증 | 세션 없이 → `401`, CSRF 없이 쓰기 → `403 invalid`, 로그인 때 세션 ID 바뀜, 로그아웃 뒤 → `401`, 꺼진 환경의 심사용 로그인 → `404` |
| 사무실 접근 | 콜라보레이터 아님 · 지정 안 된 강사 · 해제된 강사 · 실제 사무실의 심사용 계정 · 미등록 사용자의 시연 사무실 → 모두 `404`. 허용 목록 계정이 콜라보레이터여도 지정 없으면 `404` |
| IDOR | 다른 사무실의 이슈 · PR · 요구사항 · 안건 · 도움 요청 · 카드 ID를 내 사무실 경로에 넣기 → `404`. 같은 사무실 다른 학생의 개인 API → `403` |
| 개인 데이터 | 본인 → `200`, 지정된 강사 → `200`, 해제 직후 같은 강사 → `404`. Snapshot 응답의 최상위 키가 계약 목록과 정확히 같다(개인 지표 키가 없다) |
| 익명성 | 회차 목록 · Snapshot · 안건 · 타임라인 · 리포트 · 카드 · 강사 요청함 응답 어디에도 평가자 · 동료 피드백 작성자 식별 값이 없다(JSON 전체에서 평가자 ID 값을 검색) |
| 역할 | 강사의 평가 · 안건 올리기 · 결정 기록 · 연결 · 팀 설정 · 마감 → `403`. 요청 안 된 건에 강사 답변 · 피드백 · 꼬리질문 → `403`, 요청된 건 → `201`. 참여자의 팀 설정 · 연결 · 강사 지정 → `403` |
| 공용 컨벤션 라이브러리 | 지정이 있는 GitHub 계정 강사 → 등록 `201` · 수정 `200`. **심사용 ROLE-04 계정의 등록 · 수정 → `403 forbidden_role`**(조회는 `200`). 학생 · 레포 관리자의 등록 · 수정 → `403`. 거부된 요청 뒤 라이브러리 내용이 그대로 |
| 평가 회차 | 이유 없음 → `400`, 자기 PR → `403`, 지난 회차 ID → `409`, 같은 `headSha`에 회의 재평가로 회차 2개, 이전 회차 평가 보존 · 현재 회차만 집계 |
| 동기화와 앱 기록 | 동기화 뒤에도 마감 · 요구사항 연결 · 안건 · 수집 동의 · 책상 자리가 그대로. 담당자 여럿 → `TaskAssignee` 전원 · 대표 순서 |
| 요구사항 재동기화 | 원본 ID 있는 제목 변경 → 같은 ID, 원본 ID 없는 제목 변경 → 옛것 `missing` + 새것, 연결 보존, 원본 ID 중복 → `needs_review` + 경고, 문서 읽기 실패 → 변화 없음 |
| GitHub 읽기 전용 | GitHub HTTP 클라이언트를 가짜로 바꾼 테스트에서 허용된 요청(GET · GraphQL query · 토큰 발급 · OAuth 코드 교환) 밖의 요청이 나가면 실패 |
| 마감 권한 | 레포 관리자 · 담당자 → `200`, 담당자 아닌 참여자 · 강사 → `403` |

**프론트**: 예시 TS 사본 타입 검사 · 공통 JSON과 값 비교(위 ③ · ④), mock DataSource로 화면 동작, SceneModel 단위 테스트(요구사항 연결 · 안건 뒤에도 원본 `placeRole` 그대로, 대표 담당자 = 첫 번째, 화면 키 충돌 없음), Spring 서버를 띄운 핵심 흐름 E2E(로그인 → 사무실 → 이슈 상자 · 평가 · 안건) — `[구현 기본값]` 2026-11-01 추가 결정 "Spring 통합 테스트 + 프론트 핵심 E2E".

## 10. 구현 기본값과 남은 결정

2026-11-01 추가 결정으로 이전 「미승인 세부 정책 모음」의 대부분을 닫았다 — 팀 재정의 4건 채택, PR–이슈 연결(GitHub 공식 연결만), 강사 계정 관리(서버 설정 허용 목록 · GitHub 사용자 ID), 요구사항 묶음 키(요구사항 종류), 작업 마감 권한(ROLE-02 + 담당자 전원), 시연 사무실 접근 대상(명시 등록), DB(MySQL 8.x) · JDK(21) · 빌드 도구(Gradle). 근거는 결정 기록 「추가 결정 (2026-11-01, v3 검토 뒤)」. 2026-11-03 결정으로 ID 형식(Q1)과 개발 저장소 구성(Q6 — 모노레포)을 닫았다.

### [구현 기본값] 목록

| 항목 | 기본값 | 기댄 곳 |
| --- | --- | --- |
| Draft PR | 검토 공간(`review`) + Draft 배지 | 「3」 |
| 머지되지 않고 닫힌 PR | 완료 공간(`done`) + 미병합 종료 표시 | 「3」 |
| 닫힌 이슈 | 완료 공간, GitHub 닫힘 사유로 완료 · 종료 구분 가능 | 「3」 |
| 대표 담당자 규칙 | 그 사무실 팀원인 담당자 중 GitHub 사용자 ID가 가장 작은 사람, 없으면 `backlog`. 대표 담당자에게 책상 자리가 없어도 `backlog`. 서버가 이 순서로 정렬해 보낸다 | 「3」 · SceneModel |
| 팀원이 아닌 GitHub 담당자 | `TaskAssignee`에 넣지 않는다 | 「2」 |
| 우선순위 라벨이 여러 개 | 가장 높은 값 | 「3」 |
| 요구사항 진행률 | 연결된 이슈 중 닫힌 이슈 수 / 연결된 이슈 수 | 「3」 |
| 막힘 신호 판정 | 열린 PR은 리뷰 전이면 리뷰 대기, 리뷰 뒤면 커밋 없음(승인 후 머지 대기 포함). 이슈는 연결된 열린 PR을 따른다 (2026-11-05) | 「3」 막힘 신호 |
| 평균 리뷰 대기 | 열린 PR(Draft 제외)의 리뷰 대기 시작 → 첫 리뷰(없으면 응답 시각) 평균, 소수 첫째 자리 (2026-11-05) | 「3」 막힘 신호 · CONTRACTS_API.md 「5」 |
| 권한 없는 사무실 | `not_found`(404) — 존재를 숨김. 사무실 안 역할 위반은 `forbidden_role` | 「6」 |
| 세션 저장 · 만료 | 단일 서버의 기본 세션, 마지막 요청 뒤 60분(정책 범위 30분~1시간 안 — 설정 한 곳) | 「6」 |
| 세션 쿠키 `SameSite` | `Lax` — `Strict`는 GitHub에서 돌아오는 OAuth 콜백에 세션 쿠키가 실리지 않아 로그인이 깨진다 | 「6」 |
| CSRF 토큰 전달 | Spring 기본 이름 — 쿠키 `XSRF-TOKEN`(화면이 읽도록 `HttpOnly` 아님), 헤더 `X-XSRF-TOKEN` | 「6」 · CONTRACTS_API.md 「2」 |
| GitHub 로그인 경로 | Spring Security 기본 — 시작 `/oauth2/authorization/github`, 콜백 `/login/oauth2/code/github` | CONTRACTS_API.md 「2」 |
| ID 생성 · 변환 | `IDENTITY`(AUTO_INCREMENT), 문자열 ↔ `Long` 변환은 공통 코드 한 곳 | 「2」 |
| 요청의 알 수 없는 필드 | `invalid`로 거부 | 「5」 |
| SSE | 30초마다 keep-alive 주석. 다시 연결하면 놓친 이벤트를 재생하지 않고 Snapshot을 다시 읽는다 | CONTRACTS_API.md 「6」 |
| 시연 사무실 수동 동기화 | GitHub를 부르지 않고 바로 성공 | 「4」 |
| 동기화 때 콜라보레이터의 `AppUser` | 아직 로그인하지 않은 사람도 행을 만든다 | 「2」 |
| 계약 테스트 | Spring 통합 테스트 + 프론트 핵심 E2E + 공통 예시 JSON | 「9」 |
| 화면 묶음 타입 | `WorkspaceSnapshot` — 서버 Entity와 구분 | 「8」 |
| 아바타 색 | 팀원 구분 용도로 자유롭게(사람 비교 표시가 아님 — P6은 도형 색 규칙) | ARCHITECTURE.md 「색」 |
| 아바타 이동 | 회의 시작 · 종료 등 앱 내부 이벤트 우선 | 05 「상태값」 |
| 아바타 이동 연출 (우주정거장) | 연결 통로(지름 2)가 아바타(키 약 3.1)보다 작아 걸어서 이동하지 않는다. 출발 자리에서 사라짐(0.4초) → 팀원 색 빛 점이 `ThemeLayout.route()`의 통로 중심선을 따라 이동(거리 비례, 최대 약 1.8초) → 도착 자리에서 나타남(0.4초). 여러 명은 0.15초 시차. `prefers-reduced-motion`이면 빛 점 없이 사라짐 · 나타남만 (2026-11-04) | 「8」 `route` · 위 「아바타 이동」 |
| 작업 포드 표시 (우주정거장) | 포드는 `deskIndex` 0~7의 8개다. 0~3(시안의 K · L · P · C 포드)은 앉은 팀원이 없어도 늘 그리고, 4~7은 그 자리를 쓰는 지금 팀원(`removedAt` 없음)이 있을 때만 그린다 — 팀원 수가 아니라 실제 자리 점유로 판단한다. 포드 위치는 자리 번호마다 고정이라 팀원이 들고 나도 다른 포드는 움직이지 않는다. 빈 포드에는 아바타 · 작업 상자 · 개인 상태 표시가 없다 (2026-11-04) | 「2」 `Member` · 「8」 |
| 책상 자리가 없는 팀원 | 8자리가 다 찼을 때 들어온 팀원은 `deskIndex`가 비어 있다. 팀원 권한(평가 · 안건 · 도움 요청 등)은 같고, 3D에는 포드 · 아바타가 없으며 HUD에만 보인다. 그 사람이 대표 담당자인 이슈는 `backlog` (2026-11-04) | 「2」 · 「3」 |
| 스탠드업 날짜 | 한국 시간 기준 날짜 | 「1」 · `Standup` |
| 스탠드업 "막힌 것" → 도움 요청 | 내용이 채워진 작성 화면이 열리고 요청자가 올려야 생성 | FR-MTG-02 |
| 강사 수동 동기화 | 허용하지 않음 | 「4」 |
| 전체 관리자(ROLE-03) | 전용 화면 · API 없음, 추가 데이터 접근 없음 — 최소 권한부터 | 「4」 |
| 요구사항 판 수 · 대기 칸 · 시각 효과 | 판 최소 5 · 최대 10, 11개 이상이면 표기용 9 + 대기 칸 1. 기본 순서 `position`. 교환 결과를 버리는 때(교환한 요구사항이 `missing` · `needs_review`, active 10개 이하, 저장소를 읽지 못함) — ARCHITECTURE.md 「요구사항 묶음 표시」(2026-11-06 결정). 숫자는 SceneModel 상수 한 곳 | SceneModel |
| 글자 수 한도 | CONTRACTS_API.md 각 요청 DTO에 적은 값 | CONTRACTS_API.md |

### 남은 결정

**개발 착수를 막는 미결 사항은 없다.** 아래는 정할 시점이 정해진 구현 세부다. 이 문서의 계약은 아래 선택과 상관없이 유지된다.

| 항목 | 언제 · 누가 |
| --- | --- |
| Spring Boot 버전 · DB migration 도구(`[제안]` Flyway) · 구체 DB 연결 설정 · 테스트 DB 운영 · 세션 저장소 세부 | Spring Boot 골격 만들 때(구현 단계) |
| 배포 플랫폼 · SPA 서빙 방식 · 배포 환경별 쿠키 · 허용 출처 값 | 정하지 않음 — v1은 배포하지 않는다(2026-11-09 결정). 로컬은 Vite가 `/api/**`를 Spring으로 넘기고 `APP_ORIGIN=http://localhost:5173`. 「6」의 반드시 지킬 것은 그대로 |
| GitHub API 호출 라이브러리 · 레포 권한을 조회할 자격 증명 | B1 · B2 구현 때 |
| GitHub에서 사라진(삭제 · 이전된) 이슈 · PR을 화면에서 어떻게 보일지 | B2 구현 때 — 행은 지우지 않는다(「2」) |
| 시연 사무실 접근 대상 · 심사용 계정을 넣는 방식 | 정함 — 심사용 계정은 서버 설정 `REVIEW_ACCOUNTS`(#63). 우리 조 실제 GitHub 계정은 넣지 않음(2026-11-09 결정 — #251) |
| 백엔드 담당(B12 · B13 · B14 미정 허용) | GitHub 이슈를 만들며 배분 — **병렬 기능 개발 전에 담당 · 작업 경계 지정**(2026-11-01 추가 결정) |
| 계약 문서를 개발 저장소로 옮길지 | 개발 저장소 생성 때(「9」 메모) |
| 로그인 성공 · 실패 뒤 도착 화면 · 마지막 사무실 저장 위치 | PRD 「열린 질문」 — 화면 착수 전 |
| 코멘트가 있는 도움 요청의 삭제를 허용할지, 허용하면 코멘트를 같이 지울지 숨길지 | 팀 결정 — 정하기 전에는 `409`(CONTRACTS_API.md 「11」 삭제 제한 5) · #315 |

**별도 이슈 후보 (이번 범위 밖 — 기록만)**

- ROLE-03 지정이 GitHub 로그인 이름(`MASTER_ADMIN_GITHUB_LOGIN`)이다. 「6」 식별자 원칙과 맞추려면 GitHub 사용자 ID로 바꾸는 편이 낫지만, v1에 ROLE-03 전용 권한이 없고 FR-AUTH-03 근거 문서(환경 변수 가이드)를 바꾸는 일이라 따로 다룬다.
