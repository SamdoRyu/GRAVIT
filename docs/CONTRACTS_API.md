<!-- GRAVIT 이전 정보 (이 블록은 GRAVIT에서 추가했다. 본문은 원본을 옮긴 뒤 GRAVIT에서 고친 곳이 있다 — docs/README.md 「GRAVIT에서 고친 곳」)
  원본: SamdoRyu/docs-for-PJ-review @ 796fc25b459cd4a25af89e085c093f4e2c25f5b0 — docs/CONTRACTS_API.md
  이전일: 2026-11-03
  기준 위치 전환 절차: docs/README.md
-->
> **[GRAVIT 이전본]** 원본 [docs-for-PJ-review@796fc25 `docs/CONTRACTS_API.md`](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/CONTRACTS_API.md) 를 옮겼다(2026-11-03). 그 뒤 GRAVIT에서 고친 곳은 [docs/README.md](README.md) 「GRAVIT에서 고친 곳」에 적는다. 본문에서 이름만 나오는 기획 문서(03 · 05 · 06 · ARCHITECTURE.md 등)는 [docs/README.md](README.md)의 고정 링크 표에서 연다. 계약 변경 권한과 기준 위치는 [docs/README.md](README.md)를 따른다.

# API 계약 — 오피스 v1

> 문서: CONTRACTS_API.md · 상태: **v1 확정 (2026-11-03)** · 마지막 갱신: 2026-11-10
> [CONTRACTS.md](CONTRACTS.md)의 상세편이다. 공통 규칙(ID · 시각 · 상태 코드 · 페이지 · 에러 · 검사 순서 · 익명성 · Snapshot 경계)은 CONTRACTS.md에 있고 여기서 다시 적지 않는다. 엔드포인트 · DTO는 **이 문서 한 곳**이 기준이다. 바꿀 때는 CONTRACTS.md 「9. 계약 변경 절차」(문서 담당자가 고치고 커밋을 공유).
> 근거: 2026-11-03 결정(Q1~Q6), 03 · 05 · 06 · 07. 이 문서는 새 기능 · 새 정책을 만들지 않는다 — 정책에서 바로 나오지 않는 인터페이스 선택에는 `[구현 기본값]`을 붙였다.

## 읽는 법

**역할 열의 약어** — 모두 CONTRACTS.md 「6」 검사 순서 2(사무실 접근)를 통과한 뒤의 이야기다.

| 약어 | 뜻 |
| --- | --- |
| 접근 | 그 사무실에 접근할 수 있는 사람 전부 — 참여자 · 레포 관리자 · 그 사무실에 지정된 강사 |
| 팀원 | 참여자(ROLE-01) · 레포 관리자(ROLE-02) — 그 사무실의 `memberId`가 있다. 강사는 아니다 |
| R2 | 그 사무실의 레포 관리자(ROLE-02) |
| R4 | 그 사무실에 지금 지정된 강사(ROLE-04) |
| 본인 | 경로의 `memberId`가 세션 사용자의 그 사무실 `memberId`와 같음 |

- 심사용 계정은 시연 사무실 안에서 등록된 역할로 같은 표를 따른다.
- **모든 사무실 경로(`W` = `/api/workspaces/{workspaceId}`)의 공통 실패**는 표에 다시 적지 않는다: 세션 없음 `401 unauthorized`, 사무실 접근 없음 · 경로 대상이 없거나 다른 사무실 것 `404 not_found`, CSRF 없음(쓰기) `403 invalid`, 서버 오류 `503 unavailable`. 표의 "실패" 열은 그 밖의 것이다.
- DTO는 TypeScript 표기로 적는다. 모든 필드는 늘 있다(값이 없으면 `null`). Java `record`도 같은 이름 · 같은 타입이다 — `Id` · `GithubId`는 `String`, `Instant`는 `java.time.Instant`, `LocalDate`는 `java.time.LocalDate`, `number`는 `int` · `long` · `double` 중 뜻에 맞는 것.

## 0. 엔드포인트 한눈에

| # | 메서드 · 경로 | 역할 | DataSource 메서드 | 요구사항 |
| --- | --- | --- | --- | --- |
| 2 | `GET /api/health` | 누구나 | — | — |
| 2 | `GET /api/login-options` | 누구나 | `getLoginOptions` | FR-AUTH-01 · P15 |
| 2 | `GET /oauth2/authorization/github` · `GET /login/oauth2/code/github` | 누구나 (Spring Security) | — (화면이 주소로 이동) | FR-AUTH-01 |
| 2 | `POST /api/review-login` | 누구나 — 켜진 환경에서만 | `reviewLogin` | FR-AUTH-01 · P15 |
| 2 | `POST /api/logout` | 로그인 | `logout` | FR-AUTH-01 |
| 2 | `GET /api/me` | 로그인 | `getMe` | FR-AUTH-01 · 02 |
| 3 | `GET /api/repositories` | 로그인 (GitHub 계정) | `listRepositories` | FR-GH-01 |
| 3 | `GET /api/workspaces` | 로그인 | `listWorkspaces` | FR-GH-01 · FR-AUTH-07 |
| 3 | `POST /api/workspaces` | 그 레포의 R2 | `openWorkspace` | FR-GH-01 · FR-REQ-01 · FR-PLAN-01 |
| 4 | `POST W/sync` | 팀원 | `requestSync` | FR-GH-03 · 05 |
| 4 | `GET W/sync-status` | 접근 | `getSyncStatus` | FR-GH-05 |
| 5 | `GET W/snapshot` | 접근 | `load` | FR-OFF · FR-REQ · FR-FLOW · FR-LRN · FR-MTG · FR-PLAN |
| 6 | `GET W/events` (SSE) | 접근 | `subscribe` | — |
| 7 | `GET W/settings` · `PUT W/settings` | 접근 · R2 | `getSettings` · `updateSettings` | FR-PLAN-01 · FR-REQ-01 · FR-FLOW-01 |
| 7 | `GET W/instructors` | 접근 | `listInstructors` | FR-AUTH-06 |
| 7 | `GET W/instructor-candidates` | R2 | `listInstructorCandidates` | FR-AUTH-06 |
| 7 | `PUT` · `DELETE W/instructors/{githubUserId}` | R2 | `assignInstructor` · `revokeInstructor` | FR-AUTH-06 |
| 8 | `POST W/requirement-links` | R2 | `linkRequirement` | FR-REQ-04 · 07 |
| 8 | `DELETE W/requirement-links/{linkId}` | R2 | `unlinkRequirement` | FR-REQ-04 |
| 9 | `GET W/submissions/{submissionId}/rounds` | 접근 | `listRounds` | FR-LRN-03 · 06 |
| 9 | `PUT W/submissions/{submissionId}/evaluations/mine` | 팀원 — 작성자 제외 | `evaluate` | FR-LRN-01 · 02 |
| 10 | `POST W/agenda-items` | 팀원 | `createAgendaItem` | FR-LRN-04 · 10 · 11 · 14 · FR-MTG-03 |
| 10 | `POST W/agenda-items/{agendaItemId}/withdraw` | 팀원 — 올린 사람 | `withdrawAgendaItem` | FR-LRN-14 |
| 10 | `POST W/agenda-items/{agendaItemId}/decision` | 팀원 | `recordDecision` | FR-MTG-04 · FR-LRN-05 · 06 · 12 · 20 |
| 10 | `POST W/agenda-items/{agendaItemId}/feedback-request` | 팀원 | `requestDecisionFeedback` | FR-LRN-22 |
| 10 | `POST W/agenda-items/{agendaItemId}/instructor-feedback` | R4 — 요청된 건 | `addInstructorFeedback` | FR-LRN-22 |
| 10 | `POST W/meetings` · `POST W/meetings/{meetingId}/end` | 팀원 | `startMeeting` · `endMeeting` | FR-MTG-03 · 04 · 05 |
| 11 | `GET W/help-requests/{helpRequestId}` | 접근 | `getHelpRequest` | FR-LRN-15~21 |
| 11 | `POST W/help-requests` | 팀원 | `createHelpRequest` | FR-LRN-15 |
| 11 | `POST W/help-requests/{helpRequestId}/comments` | 팀원 · R4 — 요청된 건 | `addHelpComment` | FR-LRN-16 · 21 |
| 11 | `POST W/help-requests/{helpRequestId}/close` | 팀원 — 요청자 | `closeHelpRequest` | FR-LRN-17 |
| 11 | `POST W/help-requests/{helpRequestId}/to-agenda` | 팀원 — 요청자 | `convertHelpRequestToAgenda` | FR-LRN-18 · 19 |
| 11 | `POST W/help-requests/{helpRequestId}/instructor-request` | 팀원 — 요청자 | `requestInstructorHelp` | FR-LRN-21 |
| 11 | `PUT W/help-requests/{helpRequestId}/hidden` | 팀원 · R4 — 그 요청을 볼 수 있는 사람 | `hideHelpRequest` | FR-LRN-15 |
| 11 | `DELETE W/help-requests/{helpRequestId}` | 팀원 — 요청자 | `deleteHelpRequest` | FR-LRN-15 |
| 12 | `GET W/standups?date=` | 접근 | `listStandups` | FR-MTG-02 |
| 12 | `GET W/standups/{date}/mine/prefill` | 팀원 | `getStandupPrefill` | FR-MTG-01 |
| 12 | `PUT W/standups/{date}/mine` | 팀원 | `saveMyStandup` | FR-MTG-02 |
| 13 | `PUT` · `DELETE W/tasks/{taskId}/due-date` | R2 · 그 이슈의 담당자 | `setDueDate` · `clearDueDate` | FR-PLAN-03 · P14 |
| 14 | `PUT W/activity-consent` | 팀원 | `setActivityConsent` | FR-ACT · P12 |
| 14 | `GET W/activities` · `POST W/activities` | 접근 · 팀원 | `listActivities` · `createActivity` | FR-ACT-01 · 02 |
| 14 | `POST W/activities/{activityId}/confirm` | 팀원 — 작성자 제외 | `confirmActivity` | FR-ACT-02 |
| 14 | `POST W/peer-feedback` · `GET W/peer-feedback/received` | 팀원 · 팀원(받은 사람 본인) | `sendPeerFeedback` · `listReceivedPeerFeedback` | FR-ACT-04 |
| 15 | `GET W/members/{memberId}/timeline` | 본인 · R4 | `getTimeline` | FR-LRN-08 |
| 15 | `GET` · `POST W/members/{memberId}/reports` | 본인 · R4 / 본인 | `listReports` · `createReport` | FR-REP-01 · 05 · 06 |
| 15 | `GET W/members/{memberId}/reports/{reportId}` | 본인 · R4 | `getReport` | FR-REP-01 · 06 |
| 15 | `PUT W/members/{memberId}/reports/{reportId}/learning` | 본인 | `updateReportLearning` | FR-REP-02 |
| 15 | `GET W/members/{memberId}/reports/{reportId}/markdown` | 본인 · R4 | `exportReportMarkdown` | FR-REP-03 |
| 15 | `GET` · `POST W/members/{memberId}/decision-cards` | 본인 · R4 / 본인 | `listDecisionCards` · `createDecisionCard` | FR-REP-07 · 10 |
| 15 | `PUT W/members/{memberId}/decision-cards/{cardId}` | 본인 | `updateDecisionCard` | FR-REP-07 · P11 |
| 15 | `POST W/members/{memberId}/decision-cards/{cardId}/follow-up-request` | 본인 | `requestFollowUp` | FR-REP-11 |
| 15 | `POST W/members/{memberId}/decision-cards/{cardId}/follow-up-questions` | R4 — 요청된 카드 | `addFollowUpQuestion` | FR-REP-11 |
| 16 | `GET /api/instructor/inbox` | 지정된 사무실이 있는 강사 | `getInstructorInbox` | FR-LRN-23 |
| 17 | `GET /api/convention-library` | 로그인 | `listConventionLibrary` | FR-LIB-02 |
| 17 | `POST /api/convention-library` · `PUT /api/convention-library/{itemId}` | GitHub 계정 강사 | `createConventionLibraryItem` · `updateConventionLibraryItem` | FR-LIB-01 |

- 표에 없는 Should · Could 동작(연결 후보 승인 FR-REQ-03 등)은 착수할 때 계약 변경(CONTRACTS.md 「9」)으로 더한다. 응답 필드가 미리 있는 것(추천 리뷰어 FR-FLOW-04, 편중 FR-FLOW-03 · 07, 최근 변화 FR-FLOW-08)은 구현 전까지 빈 값이다.

## 1. 공통 타입

```ts
type Id = string;        // 내부 ID — Long의 10진 문자열. 예: "42"
type GithubId = string;  // GitHub 사용자 · 레포 · 계정 ID — 10진 문자열
type Instant = string;   // UTC ISO 8601, 'Z'로 끝남. 예: "2026-11-03T05:12:00Z"
type LocalDate = string; // "YYYY-MM-DD" — 한국 시간 기준 달력 날짜

type ErrorCode = 'invalid' | 'not_found' | 'conflict' | 'unavailable'
  | 'unauthorized' | 'forbidden_role' | 'github_unauthorized' | 'github_rate_limited';
interface ErrorResponse { error: { code: ErrorCode; message: string } }

type WorkspaceKind = 'github' | 'demo';
type WorkspaceRole = 'repo_admin' | 'participant' | 'instructor';
type Priority = 'high' | 'medium' | 'low';
type Verdict = 'recommend' | 'not_recommend';

interface UserRef {        // 이름을 보여도 되는 사람(익명 대상이 아닌 기록의 작성자)
  userId: Id;
  githubLogin: string | null;   // 심사용 계정은 null
  displayName: string;
  avatarUrl: string | null;
}

interface PageResponse<T> {
  items: T[];
  page: number;          // 0부터
  size: number;
  totalItems: number;
  totalPages: number;
}
```

```json
{ "error": { "code": "forbidden_role", "message": "이 작업을 할 권한이 없어요" } }
```

## 2. 로그인 · 세션

| 메서드 · 경로 | 요청 | 성공 | 실패 |
| --- | --- | --- | --- |
| `GET /api/health` | — | `200 { "ok": true }` | — |
| `GET /api/login-options` | — | `200 LoginOptions`. CSRF 쿠키도 여기서 받는다 | — |
| `GET /oauth2/authorization/github` | 화면이 이 주소로 이동 | GitHub 로그인으로 `302` | — |
| `GET /login/oauth2/code/github` | GitHub가 돌려보냄 | 세션을 만들고(세션 ID 새로 발급) 화면 주소로 `302` | 실패도 화면 주소로 `302` — 도착 화면은 PRD 「열린 질문」 |
| `POST /api/review-login` | `application/x-www-form-urlencoded` — `username`, `password` + CSRF 헤더 | `204` + 세션(세션 ID 새로 발급) | 값이 틀림 · 사용 불가 계정 `401 unauthorized`(어느 값이 틀렸는지 말하지 않음). 심사용 로그인이 꺼진 환경 `404 not_found` |
| `POST /api/logout` | CSRF 헤더 | `204`, 세션 종료 · 쿠키 삭제. 세션이 없어도 `204` | — |
| `GET /api/me` | — | `200 MeResponse`. CSRF 쿠키도 여기서 받는다 | `401` |

```ts
interface LoginOptions {
  githubLoginUrl: string;        // "/oauth2/authorization/github"
  reviewLoginEnabled: boolean;   // false면 화면이 심사용 로그인 폼을 숨긴다(숨김은 보안이 아니다 — 경로 자체가 없다)
}
interface MeResponse {
  user: UserRef;
  accountType: 'github' | 'review';
  githubUserId: GithubId | null; // 심사용 계정은 null
  isInstructor: boolean;         // 강사 요청함을 쓸 수 있는가 — 허용 목록(또는 심사용 강사)이고 지금 지정된 사무실이 하나 이상
}
```

- CSRF [구현 기본값]: 쿠키 `XSRF-TOKEN`(화면이 읽음) → 쓰기 요청 헤더 `X-XSRF-TOKEN`. 세션이 바뀌면(로그인 · 로그아웃) 토큰도 바뀌므로 화면은 그 뒤 `GET /api/me`로 새 쿠키를 받는다.
- 역할(레포 관리자 · 참여자)은 GitHub 로그인 때 레포마다 정해 세션에 둔다. `MeResponse`에는 사무실별 역할을 넣지 않는다 — `GET /api/workspaces`의 `myRole`, Snapshot의 `viewer.role`을 쓴다.

```json
{
  "user": { "userId": "7", "githubLogin": "octo-kim", "displayName": "김옥토", "avatarUrl": "https://avatars.githubusercontent.com/u/1001?v=4" },
  "accountType": "github",
  "githubUserId": "1001",
  "isInstructor": false
}
```

## 3. 사무실 · 레포 선택

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `GET /api/repositories` | — | `200 RepositoryChoiceResponse` | 로그인. 강사 · 심사용 계정은 `organizations: []`(그들은 `GET /api/workspaces`만 쓴다) | GitHub 오류 `503 github_*` |
| `GET /api/workspaces` | — | `200 WorkspaceListItem[]` — 내가 들어갈 수 있는 열린 사무실. 정렬: `displayName` 오름차순 | 로그인. 학생은 자기 레포의 사무실, 강사는 지정된 사무실 전부, 심사용 계정은 시연 사무실만 | — |
| `POST /api/workspaces` | `OpenWorkspaceRequest` | `201 WorkspaceSummary`. 이어서 첫 동기화를 시작한다 | 세션에서 그 레포의 R2 | 그 레포가 안 보임 `404`, R2 아님 `403 forbidden_role`, 이미 열림 `409 conflict`, 끝 날짜 < 시작 날짜 `400 invalid` |

```ts
interface RepositoryChoiceResponse { organizations: OwnerChoice[] }
interface OwnerChoice {
  githubOwnerId: GithubId;
  login: string;                 // 조직(또는 개인 계정) 이름
  appInstalled: boolean;         // false면 자물쇠 + "승인 요청하기"
  installUrl: string | null;     // GitHub 앱 설치 · 승인 요청 페이지 (P2)
  repositories: RepositoryChoice[];
}
interface RepositoryChoice {
  githubRepoId: GithubId;
  owner: string;
  name: string;
  myRole: 'repo_admin' | 'participant';
  workspaceId: Id | null;        // null = 아직 열리지 않음
  adminLogins: string[];         // "아직 사무실이 열리지 않았어요" 안내의 팀장 이름 (P2)
}
interface WorkspaceSummary {
  id: Id;
  kind: WorkspaceKind;
  displayName: string;           // "owner/repo" 또는 시연 사무실 이름
  githubOwner: string | null;    // 시연은 null
  githubRepo: string | null;
  githubRepoId: GithubId | null;
  htmlUrl: string | null;        // 레포 주소 — "이슈로 만들기" 링크의 바탕. 시연은 null
  openedAt: Instant;
}
interface WorkspaceListItem extends WorkspaceSummary { myRole: WorkspaceRole }
interface OpenWorkspaceRequest {
  githubRepoId: GithubId;
  projectStartDate: LocalDate;
  projectEndDate: LocalDate;
  specDocumentPath: string | null;   // 건너뛰면 null (FR-REQ-01). 1~300자
  activityConsent: boolean;          // 팀장의 활동 기록 수집 동의 (FR-ACT · P12)
}
```

## 4. 동기화

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `POST W/sync` | — | `202 SyncStatus`(`state: 'running'`). 끝나면 SSE `sync` 이벤트. GitHub 이슈 · PR · 리뷰 · 커밋 · 라벨 · 콜라보레이터 · PR–이슈 연결과 명세 문서를 읽는다 | 팀원. 강사 `403 forbidden_role` [구현 기본값]. 시연 사무실은 GitHub를 부르지 않고 바로 성공 | 이미 진행 중 `409 conflict` |
| `GET W/sync-status` | — | `200 SyncStatus` | 접근 | — |

```ts
interface SyncStatus {
  state: 'idle' | 'running';
  lastSucceededAt: Instant | null;
  lastFailedAt: Instant | null;
  lastFailureCode: 'github_unauthorized' | 'github_rate_limited' | 'unavailable' | null;
  lastFailureMessage: string | null;
  isFailing: boolean;              // lastFailedAt이 lastSucceededAt보다 나중 — 상단 바 실패 표시 (FR-GH-05)
  specWarnings: SpecWarning[];     // 마지막 명세 문서 읽기의 경고 (CONTRACTS.md 「3」 요구사항 재동기화)
}
interface SpecWarning {
  code: 'duplicate_source_key' | 'duplicate_title' | 'spec_not_found';
  heading: string | null;          // 문제의 ## 제목 (spec_not_found는 null)
}
```

- 자동 폴링(5분 — 상수)도 같은 동기화를 하고 같은 `SyncState`를 쓴다. 단 명세 문서는 수동 동기화 · 사무실 열기 때만 다시 읽는다(2026-10-28 결정).
- 동기화가 실패해도 이전 데이터는 그대로이고(NFR-09), 실패를 삼키지 않고 `lastFailed*`에 남긴다.

## 5. WorkspaceSnapshot

`GET W/snapshot` → `200 WorkspaceSnapshot`. 역할: 접근. 3D 사무실과 공통 HUD를 그리는 데 필요한 사무실 공통 데이터다. 개인 학습 데이터는 넣지 않는다(CONTRACTS.md 「5」 경계). 정렬은 각 목록 설명대로 고정이다.

```ts
interface WorkspaceSnapshot {
  workspace: WorkspaceSummary;
  viewer: Viewer;
  settings: TeamSettings;
  sync: SyncStatus;
  members: MemberDto[];               // 빠진 팀원 포함 전부(과거 기록이 가리키므로). 지금 팀원 먼저 deskIndex 순(자리가 없는 지금 팀원은 그 뒤 id 순), 그 뒤 빠진 팀원
  tasks: TaskDto[];                   // 이슈 전부. githubIssueNumber 오름차순
  submissions: SubmissionDto[];       // PR 전부. githubPrNumber 오름차순
  requirements: RequirementDto[];     // 상태 무관 전부. position 오름차순
  requirementLinks: RequirementLinkDto[];
  agendaItems: AgendaItemDto[];       // 거둔 것 포함 전부. raisedAt 오름차순
  meetings: MeetingDto[];             // 진행 중 + 최근 끝난 것 20개. startedAt 오름차순
  helpRequests: HelpRequestSummary[]; // 전부 — 보는 사람이 숨긴 요청(「11」 나에게서만 삭제)만 뺀다. createdAt 오름차순
  activityNotes: ActivityNote[];      // 확인된 활동 기록 (FR-ACT-03 — Should)
  flow: FlowSummary;
  generatedAt: Instant;
}

interface Viewer {
  userId: Id;
  role: WorkspaceRole;
  memberId: Id | null;                // 강사는 null
  activityConsented: boolean;         // 팀원이 수집 동의를 했는가 — 처음 입장 화면 분기 (P12). 강사는 false
}

interface TeamSettings {
  projectStartDate: LocalDate;
  projectEndDate: LocalDate;
  specDocumentPath: string | null;
  reviewWaitHours: number;            // 정수 1~720, 기본 48 (P9)
  noCommitHours: number;              // 정수 1~720, 기본 48 (P9)
}

interface MemberDto {
  id: Id;
  userId: Id | null;                  // 시연 Seed 팀원은 null
  githubUserId: GithubId | null;      // 시연 Seed · 심사용 팀원은 null
  githubLogin: string | null;
  displayName: string;
  avatarUrl: string | null;           // FR-OFF-06
  deskIndex: number | null;           // 0~7 — 테마의 책상 자리 번호(좌표 아님). 빠진 팀원과 자리가 없는 팀원(8자리가 다 참)은 null — 책상 · 아바타 없음
  isRepoAdmin: boolean;
  removedAt: Instant | null;          // 콜라보레이터에서 빠진 시각
  syncedAt: Instant | null;
}

interface TaskDto {                   // GitHub 이슈의 앱 모델
  id: Id;
  githubIssueNumber: number;
  title: string;
  state: 'open' | 'closed';
  closedReason: 'completed' | 'not_planned' | null;
  assigneeMemberIds: Id[];            // 팀원인 담당자 전원 — 첫 번째가 대표 담당자 (CONTRACTS.md 「3」)
  labels: string[];
  priority: Priority | null;          // priority:* 라벨에서 서버가 계산 (P6)
  dueDate: LocalDate | null;          // 앱 저장 작업 마감 (P14)
  linkedSubmissionIds: Id[];          // GitHub 공식 연결만 (FR-GH-04)
  isBlocked: boolean;                 // 서버 계산 (FR-FLOW-01)
  htmlUrl: string | null;             // GitHub 이슈 주소. 시연은 null
  githubCreatedAt: Instant;
  githubUpdatedAt: Instant;
  closedAt: Instant | null;
  stateChangedAt: Instant;            // 열림 · 닫힘 · 담당자가 마지막으로 바뀐 시각 (FR-FLOW-08)
  syncedAt: Instant;
}

interface SubmissionDto {             // GitHub PR의 앱 모델
  id: Id;
  githubPrNumber: number;
  title: string;
  authorMemberId: Id | null;          // 작성자가 팀원이 아니면 null
  authorGithubLogin: string | null;
  state: 'open' | 'draft' | 'merged' | 'closed';   // closed = 머지 안 되고 닫힘
  headSha: string;
  reviewRequestedMemberIds: Id[];
  reviews: GithubReviewDto[];         // GitHub 리뷰 — GitHub에 공개된 값이라 익명 대상이 아니다
  suggestedReviewerMemberIds: Id[];   // 추천 리뷰어 (FR-FLOW-04 — Should)
  labels: string[];
  priority: Priority | null;
  linkedTaskIds: Id[];                // GitHub 공식 연결만
  isBlocked: boolean;
  htmlUrl: string | null;             // GitHub PR 화면 (FR-LRN-07). 시연은 null
  githubCreatedAt: Instant;
  githubUpdatedAt: Instant;
  mergedAt: Instant | null;
  closedAt: Instant | null;
  lastCommitAt: Instant | null;
  stateChangedAt: Instant;
  syncedAt: Instant;
  currentRound: EvaluationRoundDto | null;   // 가장 최근 회차 (「9」). PR이 닫혀도 마지막 회차를 보인다
}
interface GithubReviewDto {
  reviewerMemberId: Id | null;
  reviewerGithubLogin: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed';
  submittedAt: Instant;
}

interface RequirementDto {
  id: Id;
  sourceKey: string | null;           // ## 제목의 요구사항 ID (예: "FR-AUTH-01"). 요구사항 종류(groupKey)는 화면이 여기서 계산
  title: string;                      // 원본 ID를 뺀 정규화 제목
  position: number;                   // 문서 안 순서 (0부터)
  status: 'active' | 'missing' | 'needs_review';
  linkedTaskCount: number;
  doneTaskCount: number;              // 연결된 이슈 중 닫힌 이슈 수 (FR-REQ-05)
  lastSeenAt: Instant | null;         // 마지막으로 문서에서 본 시각
}
interface RequirementLinkDto { id: Id; requirementId: Id; taskId: Id; linkedAt: Instant }

interface FlowSummary {               // 팀 단위 계산 값 — 사람별 합계 · 순위 없음 (P6)
  blockedMemberIds: Id[];             // 막힌 도형이 있는 팀원 — 아바타 강조 (FR-FLOW-02)
  reviewConcentratedMemberIds: Id[];  // 리뷰 편중 — 몰렸다는 표시만 (FR-FLOW-03 — Should)
  assignmentConcentratedMemberIds: Id[]; // 담당 편중 (FR-FLOW-07 — Should)
  openSubmissionCount: number;        // 열린 PR 수 (FR-FLOW-05)
  averageReviewWaitHours: number | null; // 평균 리뷰 대기, 소수 첫째 자리 (FR-FLOW-05) — 계산 규칙은 CONTRACTS.md 「3」 막힘 신호 · 평균 리뷰 대기. 열린 PR이 없으면 null
  latestStandupDate: LocalDate | null;   // 최근 변화 뷰의 기준 (FR-FLOW-08 — Should)
}

interface ActivityNote {              // 3D 메모지 — 시간 · 내용 없음
  id: Id;
  authorMemberId: Id;
  kind: 'planning' | 'research' | 'design' | 'presentation' | 'mentor_question';
  confirmedAt: Instant;
}
```

`AgendaItemDto` · `MeetingDto`는 「10」, `HelpRequestSummary`는 「11」, `EvaluationRoundDto`는 「9」.

**예시** (목록을 하나씩만 남기고 줄였다)

```json
{
  "workspace": { "id": "3", "kind": "github", "displayName": "team-samdo/gitvillage", "githubOwner": "team-samdo", "githubRepo": "gitvillage", "githubRepoId": "880001234", "htmlUrl": "https://github.com/team-samdo/gitvillage", "openedAt": "2026-11-04T00:10:00Z" },
  "viewer": { "userId": "7", "role": "participant", "memberId": "12", "activityConsented": true },
  "settings": { "projectStartDate": "2026-11-04", "projectEndDate": "2026-11-17", "specDocumentPath": "docs/requirements.md", "reviewWaitHours": 48, "noCommitHours": 48 },
  "sync": { "state": "idle", "lastSucceededAt": "2026-11-05T03:00:00Z", "lastFailedAt": null, "lastFailureCode": null, "lastFailureMessage": null, "isFailing": false, "specWarnings": [] },
  "members": [
    { "id": "12", "userId": "7", "githubUserId": "1001", "githubLogin": "octo-kim", "displayName": "김옥토", "avatarUrl": "https://avatars.githubusercontent.com/u/1001?v=4", "deskIndex": 0, "isRepoAdmin": false, "removedAt": null, "syncedAt": "2026-11-05T03:00:00Z" }
  ],
  "tasks": [
    { "id": "41", "githubIssueNumber": 12, "title": "GitHub 로그인", "state": "open", "closedReason": null, "assigneeMemberIds": ["12"], "labels": ["area:auth", "priority:high"], "priority": "high", "dueDate": "2026-11-07", "linkedSubmissionIds": ["9"], "isBlocked": false, "htmlUrl": "https://github.com/team-samdo/gitvillage/issues/12", "githubCreatedAt": "2026-11-04T01:00:00Z", "githubUpdatedAt": "2026-11-05T02:10:00Z", "closedAt": null, "stateChangedAt": "2026-11-04T05:00:00Z", "syncedAt": "2026-11-05T03:00:00Z" }
  ],
  "submissions": [
    { "id": "9", "githubPrNumber": 15, "title": "feat(auth): GitHub 로그인", "authorMemberId": "12", "authorGithubLogin": "octo-kim", "state": "open", "headSha": "3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e", "reviewRequestedMemberIds": ["13"], "reviews": [], "suggestedReviewerMemberIds": [], "labels": ["area:auth"], "priority": null, "linkedTaskIds": ["41"], "isBlocked": false, "htmlUrl": "https://github.com/team-samdo/gitvillage/pull/15", "githubCreatedAt": "2026-11-05T01:00:00Z", "githubUpdatedAt": "2026-11-05T02:00:00Z", "mergedAt": null, "closedAt": null, "lastCommitAt": "2026-11-05T01:55:00Z", "stateChangedAt": "2026-11-05T01:00:00Z", "syncedAt": "2026-11-05T03:00:00Z",
      "currentRound": { "id": "21", "roundNumber": 1, "headSha": "3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e", "openedReason": "new_pr", "openedAt": "2026-11-05T03:00:00Z", "closedAt": null, "recommendCount": 1, "notRecommendCount": 1, "reasons": [ { "verdict": "recommend", "reason": "세션 만료 처리가 명확해요" }, { "verdict": "not_recommend", "reason": "실패 응답 모양이 계약과 달라요" } ], "myEvaluation": null, "canEvaluate": false } }
  ],
  "requirements": [
    { "id": "5", "sourceKey": "FR-AUTH-01", "title": "GitHub 로그인", "position": 0, "status": "active", "linkedTaskCount": 1, "doneTaskCount": 0, "lastSeenAt": "2026-11-05T03:00:00Z" }
  ],
  "requirementLinks": [ { "id": "30", "requirementId": "5", "taskId": "41", "linkedAt": "2026-11-05T02:30:00Z" } ],
  "agendaItems": [],
  "meetings": [],
  "helpRequests": [],
  "activityNotes": [],
  "flow": { "blockedMemberIds": [], "reviewConcentratedMemberIds": [], "assignmentConcentratedMemberIds": [], "openSubmissionCount": 1, "averageReviewWaitHours": 2.0, "latestStandupDate": "2026-11-05" },
  "generatedAt": "2026-11-05T03:01:12Z"
}
```

위 예시에서 `viewer.memberId`가 `"12"`이고 PR 작성자도 `"12"`라서 `canEvaluate`가 `false`다.

## 6. 변경 알림 (SSE)

`GET W/events` → `200 text/event-stream`. 역할: 접근. 연결할 때 세션 · 사무실 접근을 검사하고, 세션이 끝나거나 접근이 없어지면 닫는다(CONTRACTS.md 「6」).

```text
event: change
data: {"resources":["tasks","submissions"],"at":"2026-11-05T03:00:05Z"}

event: sync
data: {"state":"idle","lastSucceededAt":"2026-11-05T03:00:05Z", …SyncStatus}
```

```ts
type SnapshotResource = 'workspace' | 'settings' | 'members' | 'tasks' | 'submissions'
  | 'requirements' | 'agenda_items' | 'meetings' | 'help_requests' | 'activities'
  | 'standups' | 'instructors';
```

- 이벤트에는 자원 종류만 담는다 — ID · 내용 · 개인 지표 없음. 화면은 `change`를 받으면 Snapshot을 다시 읽는다(짧게 모아서). 개인 API 데이터는 이벤트가 없다 — 화면을 열 때 읽는다.
- 도움 요청 「나에게서만 삭제」(「11」)는 그 사람에게만 해당하므로 이벤트를 보내지 않는다 — 요청한 화면이 응답 뒤 자기 Snapshot에서 뺀다 (2026-11-10 — #315 · #333).
- 커밋이 끝난 뒤에만 보낸다. 30초마다 keep-alive 주석(`: ping`) [구현 기본값]. 다시 연결하면 Snapshot을 다시 읽는다(놓친 이벤트 재생 없음) [구현 기본값].

## 7. 팀 설정 · 강사 지정

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `GET W/settings` | — | `200 TeamSettings` | 접근 | — |
| `PUT W/settings` | `TeamSettings`(전체 교체) | `200 TeamSettings` | R2 | 범위 · 날짜 순서 `400 invalid`, R2 아님 `403` |
| `GET W/instructors` | — | `200 InstructorAssignmentDto[]` — 현재 지정만, `assignedAt` 오름차순 | 접근 | — |
| `GET W/instructor-candidates` | — | `200 InstructorCandidateDto[]` — 허용 목록 전원 | R2 | R2 아님 `403` |
| `PUT W/instructors/{githubUserId}` | — | `200 InstructorAssignmentDto` — 이미 지정돼 있으면 그 지정 | R2 | 허용 목록에 없는 ID `400 invalid`, 요청한 사람 자신 `409 conflict`, 경로 형식 오류 `404` |
| `DELETE W/instructors/{githubUserId}` | — | `204` — 해제 시각을 남기고 행은 지우지 않는다. 그 강사의 그 사무실 권한은 다음 요청부터 없다 | R2 | 현재 지정 없음 `404` |

```ts
interface InstructorAssignmentDto {
  githubUserId: GithubId;         // 지정의 키 — 로그인 이름이 아님 (CONTRACTS.md 「6」 식별자 원칙)
  githubLogin: string | null;     // 표시용 — 아직 모르면 null
  displayName: string | null;
  avatarUrl: string | null;
  assignedAt: Instant;
  assignedBy: UserRef;
}
interface InstructorCandidateDto {
  githubUserId: GithubId;
  githubLogin: string | null;     // 표시용 — 그 강사가 로그인한 적이 없어 모르면 null [구현 기본값]
  avatarUrl: string | null;
  isAssigned: boolean;
}
```

- 명세 문서 경로를 바꿔도 바로 읽지 않는다. 다음 수동 동기화 때 읽는다.

## 8. 요구사항 · RequirementLink

요구사항 목록은 Snapshot의 `requirements` · `requirementLinks`로 읽는다(따로 GET 없음). 재동기화 규칙은 CONTRACTS.md 「3」.

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `POST W/requirement-links` | `{ requirementId: Id; taskId: Id }` | `201 RequirementLinkDto`. 같은 연결이 이미 있으면 요구사항 상태와 상관없이 `200`과 기존 연결(새 연결이 아니므로 아래 `409`에 해당하지 않음 — 2026-11-05) | R2. 요구사항 · 이슈 모두 이 사무실 것 | 없거나 다른 사무실 것 `404`, 요구사항이 `active`가 아님 `409 conflict`, R2 아님 `403` |
| `DELETE W/requirement-links/{linkId}` | — | `204` | R2 | R2 아님 `403` |

- 연결은 GitHub 이슈를 바꾸지 않고, 이슈의 위치도 바꾸지 않는다(FR-REQ-07 · 2026-11-01 결정).

## 9. PR 평가 · 평가 회차

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `GET W/submissions/{submissionId}/rounds` | — | `200 EvaluationRoundDto[]` — 회차 번호 내림차순(현재 회차가 처음) | 접근 | — |
| `PUT W/submissions/{submissionId}/evaluations/mine` | `EvaluateRequest` | `200 EvaluationRoundDto`(그 회차, `myEvaluation` 포함). 처음이면 만들고, 있으면 바꾼다 | 팀원. 작성자가 아님. PR이 `open` · `draft` | 이유 없음 · 200자 초과 `400 invalid`, 강사 `403 forbidden_role`, 작성자 `403 forbidden_role`, `roundId`가 현재 회차가 아님 · PR이 머지 · 닫힘 `409 conflict` |

```ts
interface EvaluateRequest {
  roundId: Id;                // 평가하려는 회차 — 그 사이 새 회차가 열렸으면 409
  verdict: Verdict;
  reason: string;             // 앞뒤 공백을 뺀 뒤 1~200자 (FR-LRN-02)
}
interface EvaluationRoundDto {
  id: Id;
  roundNumber: number;
  headSha: string;            // 회차를 시작한 커밋 — 회차 ID와 별개
  openedReason: 'new_pr' | 'new_commit' | 'meeting_reevaluate';
  openedAt: Instant;
  closedAt: Instant | null;   // 새 회차가 열리면 채워짐
  recommendCount: number;
  notRecommendCount: number;
  reasons: EvaluationReason[];      // 평가자 · 평가 ID · 시각 없음. 추천 먼저, 그 안에서 저장 순서
  myEvaluation: MyEvaluation | null; // 요청한 사람 자신의 평가만
  canEvaluate: boolean;             // 화면 표시용 — 서버는 평가 요청 때 다시 검사한다
}
interface EvaluationReason { verdict: Verdict; reason: string }
interface MyEvaluation { verdict: Verdict; reason: string; updatedAt: Instant }
```

```json
{ "roundId": "21", "verdict": "not_recommend", "reason": "실패 응답 모양이 계약과 달라요" }
```

- 새 회차는 동기화(새 PR · `headSha` 변경)와 회의 결정 `revise_and_reevaluate`(「10」)에서만 열린다. 이 API는 회차를 열지 않는다.

## 10. 회의 · 안건 · 강사 피드백

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `POST W/agenda-items` | `AgendaItemCreateRequest` | `201 AgendaItemDto`(`confirmed`). PR 안건은 그때의 현재 회차를 `evaluationRoundId`로 기억한다 | 팀원. 개수 제한 없음 (FR-LRN-14) | 종류와 원본이 맞지 않음 · `help_request` 종류 `400 invalid`(도움 요청은 「11」 전환으로만), 원본이 없거나 다른 사무실 것 `404`, 강사 `403` |
| `POST W/agenda-items/{agendaItemId}/withdraw` | — | `200 AgendaItemDto`(`withdrawn`). 안건 행은 지우지 않는다. `help_request` 안건이면 같은 트랜잭션에서 그 도움 요청을 안건으로 전환하기 직전 상태(`open` · `discussing` — 코멘트로 다시 계산하지 않음, 「11」 상태 전이)로 되돌린다. 본문 · 코멘트(강사 답변 포함) · "강사에게 요청"은 그대로다. 결정을 기록한 안건(`discussed`)은 `409`라 되돌리지 않는다. 응답 DTO는 그대로 — 되돌아온 도움 요청은 Snapshot `helpRequests`에서 읽는다. 변경 알림은 `agenda_items`, `help_request` 안건이면 `agenda_items` · `help_requests` (2026-11-10 — #313) | 팀원 — 올린 사람 | 올린 사람이 아님 · 강사 `403`, `confirmed`가 아님 `409`. 검사 순서는 대상(없거나 다른 사무실 것 `404`) → 올린 사람 → 상태 — 그대로 |
| `POST W/agenda-items/{agendaItemId}/decision` | `DecisionRequest` | `200 AgendaItemDto`(`discussed`). 같은 트랜잭션에서: `revise_and_reevaluate`면 새 평가 회차(`meeting_reevaluate`), `help_request` 안건이면 그 도움 요청을 `ended`로 | 팀원 (올린 사람이 아니어도 됨) | `prDecision`이 PR 안건에 없거나 다른 종류에 있음 · 후속 담당자가 팀원이 아님 `400`, 강사 `403`, `confirmed`가 아님 · 머지 · 닫힌 PR 안건에 `revise_and_reevaluate`(CONTRACTS.md 「3」 평가 회차 — 2026-11-05) `409` |
| `POST W/agenda-items/{agendaItemId}/feedback-request` | — | `200 AgendaItemDto`(`feedbackRequested: true`). 이미 켜져 있으면 그대로 | 팀원 | 결정 기록 전(`discussed`가 아님) `409`, 강사 `403` |
| `POST W/agenda-items/{agendaItemId}/instructor-feedback` | `{ body: string }` (1~2000자) | `201 InstructorFeedbackDto`. 안건 · 결정 상태는 바뀌지 않는다 | R4. 피드백 요청이 켜진 결정 기록 | 요청 안 됨 · 학생 `403 forbidden_role` |
| `POST W/meetings` | `{ attendeeMemberIds: Id[] }` (FR-MTG-05 — 비어도 됨) | `201 MeetingDto`(`ongoing`) | 팀원 | 진행 중 회의가 이미 있음 `409`, 참석자가 팀원이 아님 `400`, 강사 `403` |
| `POST W/meetings/{meetingId}/end` | `{ notes: string \| null }` (0~5000자) | `200 MeetingDto`(`ended`) | 팀원 | 이미 끝남 `409`, 강사 `403` |

```ts
type AgendaKind = 'issue' | 'pr' | 'help_request' | 'learning' | 'other';

interface AgendaItemCreateRequest {
  kind: 'issue' | 'pr' | 'learning' | 'other';
  sourceId: Id | null;         // issue → taskId, pr → submissionId, learning · other → null
  title: string;               // 1~100자 — 무엇을 토론할지
  background: string | null;   // 0~2000자
  tried: string | null;        // 해 본 것, 0~2000자
  unresolvedReason: string | null; // 혼자 결론 못 낸 이유, 0~2000자
}
interface DecisionRequest {
  conclusion: string;          // 1~2000자
  learning: string | null;     // 배운 점, 0~2000자
  prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null; // PR 안건이면 필수, 아니면 null
  followUpAssigneeMemberId: Id | null;  // 더 알아볼 사람 (FR-LRN-12)
  followUpDueDate: LocalDate | null;
  meetingId: Id | null;        // 다룬 회의
}

interface AgendaItemDto {
  id: Id;
  kind: AgendaKind;
  status: 'confirmed' | 'discussed' | 'withdrawn';
  title: string;
  background: string | null;
  tried: string | null;
  unresolvedReason: string | null;
  source: { type: 'task' | 'submission' | 'help_request'; id: Id } | null; // learning · other는 null. help_request 종류인데 null이면 원본 도움 요청이 영구 삭제됨(「11」) — title은 "삭제된 도움 요청"
  evaluationRoundId: Id | null;   // PR 안건 — 붙는 추천·비추천 이유는 이 회차의 것 (「9」 rounds로 읽음)
  raisedByMemberId: Id;
  raisedAt: Instant;              // 24시간 미처리 강조는 화면 계산 (FR-LRN-13 — Should)
  decision: AgendaDecisionDto | null;
  feedbackRequested: boolean;
  feedbackRequestedAt: Instant | null;
  instructorFeedbacks: InstructorFeedbackDto[];  // 결정 기록 아래 팀 전체에게 보임 (FR-LRN-22)
}
interface AgendaDecisionDto {
  conclusion: string;
  learning: string | null;
  prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null;
  followUpAssigneeMemberId: Id | null;
  followUpDueDate: LocalDate | null;
  meetingId: Id | null;
  decidedByMemberId: Id;
  decidedAt: Instant;
}
interface InstructorFeedbackDto { id: Id; instructor: UserRef; body: string; createdAt: Instant }
interface MeetingDto {
  id: Id;
  status: 'ongoing' | 'ended';
  startedAt: Instant;
  endedAt: Instant | null;
  attendeeMemberIds: Id[];
  notes: string | null;
  discussedAgendaItemIds: Id[];
}
```

```json
{ "kind": "pr", "sourceId": "9", "title": "실패 응답 모양을 계약대로 바꿀까?", "background": null, "tried": "로컬에서 401 응답 확인", "unresolvedReason": "추천·비추천 의견이 갈림" }
```

- "그대로 머지" · "PR 닫기" 결정은 기록일 뿐이다. 머지 · 닫기는 화면이 PR의 `htmlUrl`로 이동시켜 GitHub에서 한다(P3). "이슈로 만들기"도 화면이 `workspace.htmlUrl + "/issues/new?title=…&body=…"`로 이동시킨다.

## 11. 도움 요청

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `GET W/help-requests/{helpRequestId}` | — | `200 HelpRequestDetail`. 내가 「나에게서만 삭제」한 요청도 읽힌다 — 목록 · 배지 · 요청함에서만 빠지고, 회의실 안건 등에서 직접 열면 보인다 (#333) | 접근 | 없거나 다른 사무실 것 · 영구 삭제된 요청 `404` |
| `POST W/help-requests` | `{ content: string; fromStandupId: Id \| null }` (1~2000자) | `201 HelpRequestSummary`(`open`) | 팀원. `fromStandupId`는 본인의 스탠드업 | 스탠드업이 본인 것이 아님 `403`, 강사 `403` |
| `POST W/help-requests/{helpRequestId}/comments` | `{ content: string }` (1~2000자) | `201 HelpCommentDto`. 요청자가 아닌 팀원의 첫 코멘트면 `open` → `discussing`. 강사 답변(`isInstructorAnswer: true`)은 상태를 바꾸지 않는다 | 팀원, 또는 R4 — "강사에게 요청"이 켜진 글 | 요청 안 된 글에 강사 `403`, `resolved` · `ended` `409` |
| `POST W/help-requests/{helpRequestId}/close` | `{ helpfulCommentId: Id \| null; learning: string }` (배운 점 1~200자) | `200 HelpRequestDetail`(`resolved`) | 팀원 — 요청자. 상태 `open` · `discussing` | 요청자가 아님 `403`, 도움이 된 코멘트가 이 글의 것이 아님 · 강사 답변 · 요청자 본인 코멘트 `400`, 그 밖의 상태 `409` |
| `POST W/help-requests/{helpRequestId}/to-agenda` | `{ title: string }` (1~100자) | `201 AgendaItemDto`(`help_request` 종류, `confirmed`). 도움 요청은 `on_agenda`. 직접 전환과 48시간 후보 확정이 같은 API다. 안건 철회로 되돌아온 요청도 다시 전환할 수 있다 — 새 `confirmed` 안건이 생기고, 거둔 안건 행은 `withdrawn`으로 남는다 (2026-11-10 — #313) | 팀원 — 요청자. 상태 `open` · `discussing` | 요청자가 아님 `403`, 그 밖의 상태 `409`, 거두지 않은 안건이 이미 있음(동시에 두 번 전환 등 — 하나만 `201`) `409` |
| `POST W/help-requests/{helpRequestId}/instructor-request` | — | `200 HelpRequestSummary`(`instructorRequested: true`). 이미 켜져 있으면 그대로(처음 시각 유지, 변경 알림 없음) | 팀원 — 요청자. 상태 `open` · `discussing` · `on_agenda` | 요청자가 아님 `403`, `resolved` · `ended` `409`(이미 켜져 있어도), 새로 켤 때 사무실에 지정된 강사가 없음 `409` — 시연 사무실은 심사용 강사 계정이 강사라 이 검사를 하지 않는다. 검사 순서는 대상 → 요청자 → 상태 → (이미 켜져 있으면 그대로) → 지정된 강사 (2026-11-09 결정) |
| `PUT W/help-requests/{helpRequestId}/hidden` | — | `204`. **나에게서만 삭제** — 이 사용자의 조회 결과에서만 뺀다. 원문 · 코멘트는 그대로. 이미 뺐으면 그대로 `204`. 되돌리는 API는 없다 (2026-11-10 — #315, 숨김 목록 · 해제 삭제 #333) | 팀원 · R4 — 그 요청을 볼 수 있는 사람. 요청자 본인도 된다. 상태와 상관없음 | 없거나 다른 사무실 것 · 영구 삭제된 요청 `404` |
| `DELETE W/help-requests/{helpRequestId}` | — | `204`. **모두에게서 영구 삭제** — 아래 「도움 요청 삭제」 ②. 변경 알림 `help_requests`, 안건이 바뀌었으면 `agenda_items`도 | 팀원 — 요청자. 상태와 상관없음 | 없거나 다른 사무실 것 · 이미 지운 요청 `404`, 요청자가 아님(다른 팀원 · 강사) `403 forbidden_role`. 검사 순서는 대상 → 요청자 |

```ts
type HelpRequestStatus = 'open' | 'discussing' | 'resolved' | 'on_agenda' | 'ended';
interface HelpRequestSummary {
  id: Id;
  requesterMemberId: Id;
  content: string;
  status: HelpRequestStatus;
  isAgendaCandidate: boolean;     // 계산 — open · discussing이고 만든 지 48시간 지남 (FR-LRN-18). 화면은 반투명 후보로
  instructorRequested: boolean;
  instructorRequestedAt: Instant | null;
  agendaItemId: Id | null;        // 전환된 안건 중 거두지 않은 것(confirmed · discussed). 철회로 되돌아오면 null (2026-11-10 — #313)
  fromStandupId: Id | null;
  commentCount: number;
  createdAt: Instant;
  closedAt: Instant | null;
}
interface HelpRequestDetail extends HelpRequestSummary {
  comments: HelpCommentDto[];     // createdAt 오름차순. 안건으로 전환해도 그대로 붙어 보인다
  helpfulCommentId: Id | null;    // 코멘트 작성자의 "내가 도운 기록"
  learning: string | null;
}
interface HelpCommentDto {
  id: Id;
  author: UserRef;                // 익명 아님
  authorMemberId: Id | null;      // 강사는 null
  isInstructorAnswer: boolean;
  content: string;
  createdAt: Instant;
}
```

- 회의에서 결정을 기록하면(「10」) `on_agenda` → `ended`. 이슈로 만들기로 한 경우도 같다 — 이슈는 GitHub에서 만든다(FR-LRN-20).
- **안건 철회** (2026-11-10 — #313): `on_agenda` → (안건 철회, 「10」 `withdraw`) → `open` · `discussing`. 안건만 거두고, 도움 요청은 **안건으로 전환하기 직전 상태 그대로** 되돌린다. `open`에서 전환했으면 `open`, `discussing`에서 전환했으면 `discussing`이다. 코멘트 유무로 다시 계산하지 않는다. `on_agenda` 동안 요청자가 아닌 팀원의 코멘트가 달렸어도, 직전 상태가 `open`이었으면 `open`이다.
  - 본문 · 코멘트(강사 답변 포함) · `createdAt` · "강사에게 요청"(`instructorRequested` · `instructorRequestedAt`)은 바꾸지 않는다. `on_agenda` 동안 켠 강사 요청도 끄지 않는다.
  - `agendaItemId`는 `null`이 되고, `isAgendaCandidate`는 되돌린 상태로 다시 계산한다(만든 지 48시간이 지났으면 `true`).
  - 그 뒤 다시 전환할 수 있고, 철회와 전환을 되풀이해도 된다. 철회할 때마다 그 전환의 직전 상태로 돌아온다. 거두지 않은 안건(`confirmed` · `discussed`)은 도움 요청 하나당 하나뿐이다(CONTRACTS.md 「3」 무결성 제약).
  - 예: `discussing`이고 만든 지 48시간이 지난 요청(강사 요청 안 함)을 전환했다가 거두면 `status: "discussing"`, `isAgendaCandidate: true`, `instructorRequested: false`, `agendaItemId: null`이 된다.
- **도움 요청 삭제 — 두 방식** (2026-11-10 팀 확정 — #315 · #316): 삭제할 때마다 사용자가 범위를 고른다. 요청자는 ① · ② 둘 다, 그 밖의 사람(다른 팀원 · 강사)은 ①만 고를 수 있다. 서버는 고른 범위(엔드포인트)대로 권한을 검사한다. 두 방식은 함께 있다.
  - **① 나에게서만 삭제** — 본인의 조회 결과에서만 뺀다. 공용 DB의 도움 요청 원문과 코멘트는 보존한다.
    - 사용자(AppUser)별 제외 상태를 서버에 저장한다(CONTRACTS.md 「2」 `HelpRequestHidden`).
    - 뺀 사람의 응답에서만 뺀다: Snapshot `helpRequests`(「5」), 강사 요청함(「16」). 게시판 배지는 Snapshot에서 세므로 따라 줄어든다(CONTRACTS.md 「8」). 서버가 조회 · 응답 단계에서 빼므로 새로고침 · 다시 접속해도 같다.
    - 되돌리는 API(숨긴 목록 조회 · 숨김 해제)는 없다 — 2026-11-10 #333에서 지웠다. 이미 뺀 요청은 계속 그 사람에게 보이지 않는다.
    - 다른 사람의 응답 · 변경 알림은 바뀌지 않는다(「6」 — 이벤트 없음). 다른 사람은 원문과 코멘트를 계속 본다.
    - 빼도 그 요청의 상태 변화(코멘트 · 전환 · 닫기)는 그대로 일어난다. 그 요청에서 만든 안건은 별도 기록이라 회의실에 그대로 보인다.
    - 강사도 뺄 수 있다 — 자기 조회 설정이라 FR-AUTH-08의 쓰기 제한 대상이 아니며, 「0」 역할 열에 R4가 있어 강사 쓰기 허용 목록에 더한다.
    - 화면: 범위 「나에게서만 삭제」를 고르면 실행 버튼은 「확인」이다(#333).
  - **② 모두에게서 영구 삭제**
    - 요청자만, 상태와 상관없이(`open` · `discussing` · `on_agenda` · `resolved` · `ended`) 지울 수 있다.
    - 같은 트랜잭션에서 아래를 처리한다(한 단계라도 실패하면 전부 롤백).
      1. **실제로 지운다**: 도움 요청(본문 · 닫을 때 배운 점 · 도움이 된 코멘트 연결), 그 요청의 코멘트 전부(다른 사람 코멘트 · 강사 답변 포함), 모든 사용자의 「나에게서만 삭제」 행. `deleted` 같은 논리 삭제 칸으로 대신하지 않는다.
      2. 이 요청에서 만든 **미논의 안건**(`confirmed`)은 `withdrawn`으로 바꾸고 원본 연결을 끊는다. 회의실 탁자에서 빠진다.
      3. **결정을 기록한 안건**(`discussed` — 결정 · 강사 피드백 포함), **거둔 안건**(`withdrawn`), **회의**는 지우지 않는다. 원본 연결만 끊는다.
      4. 남기는 안건의 `title`은 고정 문구 `"삭제된 도움 요청"`으로 바꾼다 — 화면이 전환할 때 본문 첫 줄로 제목을 미리 채우므로 원문이 복사돼 있을 수 있다. 도움 요청 안건의 나머지 글 칸(`background` · `tried` · `unresolvedReason`)은 비어 있다.
    - 원본이 지워진 안건은 `kind: 'help_request'`, `source: null`이다(「10」).
    - DB 외래키의 `ON DELETE CASCADE`나 JPA `cascade` · `orphanRemoval`로 처리하지 않는다. 서비스가 위 순서대로 지워 의도하지 않은 연쇄 삭제를 막는다.
    - 지운 뒤 그 요청을 가리키는 모든 요청(상세 · 다시 지우기 · 나에게서만 삭제 · 코멘트 등)은 `404`다. 복원하는 API는 없다.
    - 화면은 지우기 전에 경고(다른 사람 코멘트 · 강사 답변 개수, 복원 불가, 연결 안건 처리)를 보이고 한 번 더 확인받는다(#316). 서버는 확인 여부를 따로 받지 않는다 — 요청 자체가 확인이다.
  - **삭제 범위의 한계**
    - 사람이 결정 결론 · 배운 점 · 회의록 등에 직접 옮겨 적은 내용은 찾아 지우지 않는다. 독립 기록으로 보존한다.
    - DB 밖의 데이터는 삭제 범위가 아니다: 이미 내보낸 회고 마크다운, DB 백업 · binlog, 서버 로그, 브라우저에 남은 화면 · localStorage.
  - 회의실 쓰레기통의 안건 철회(「10」 `withdraw`)는 삭제가 아니다. 철회하면 도움 요청은 지워지지 않고 전환 직전 상태로 돌아간다(위 「안건 철회」).

## 12. 스탠드업

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `GET W/standups?date=YYYY-MM-DD` | `date` 필수 | `200 StandupDto[]` — 그날 쓴 팀원 것, `memberId` 순 | 접근 | `date` 없음 · 형식 오류 `400` |
| `GET W/standups/{date}/mine/prefill` | — | `200 StandupPrefill` — `{date}`의 전날(한국 시간) 내 GitHub 활동 | 팀원 | 강사 `403` |
| `PUT W/standups/{date}/mine` | `{ yesterday: string; blockers: string \| null }` (각 0~2000자) | `200 StandupDto` — 있으면 고치고 없으면 만든다 | 팀원. `{date}` ≤ 오늘(한국 시간) | 미래 날짜 `400`, 강사 `403` |

```ts
interface StandupDto { id: Id; memberId: Id; date: LocalDate; yesterday: string; blockers: string | null; updatedAt: Instant }
interface StandupPrefill {
  date: LocalDate;
  items: {
    kind: 'commit' | 'pr_opened' | 'pr_merged' | 'issue_closed' | 'review_submitted';
    title: string;
    githubNumber: number | null;  // 이슈 · PR 번호 (커밋은 null)
    occurredAt: Instant;
  }[];
}
```

- "막힌 것" → 도움 요청: 화면이 내용을 채운 도움 요청 작성 화면을 열고, 요청자가 올리면 `POST W/help-requests`(`fromStandupId` 포함) [구현 기본값 — FR-MTG-02].

## 13. 작업 마감

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `PUT W/tasks/{taskId}/due-date` | `{ dueDate: LocalDate }` | `200 TaskDueDateDto` | R2, 또는 그 이슈의 담당자(`assigneeMemberIds`에 있는 팀원) — P14 | 그 밖의 참여자 · 강사 `403`, 날짜 형식 `400` |
| `DELETE W/tasks/{taskId}/due-date` | — | `204` | 같음 | 같음. 마감이 없으면 그대로 `204` |

```ts
interface TaskDueDateDto { taskId: Id; dueDate: LocalDate; updatedAt: Instant; updatedBy: UserRef }
```

- GitHub 이슈는 바뀌지 않는다. 동기화도 마감을 덮지 않는다(CONTRACTS.md 「2」 소유와 변경 주체).

## 14. 활동 기록 · 동료 피드백 (FR-ACT — Should · Could)

| 메서드 · 경로 | 요청 | 성공 | 역할 · 조건 | 실패 |
| --- | --- | --- | --- | --- |
| `PUT W/activity-consent` | `{ consented: boolean }` | `200 { "activityConsented": boolean }` | 팀원(본인 동의) | 강사 `403` |
| `GET W/activities?status=pending\|confirmed&page=&size=` | `status` 선택 | `200 PageResponse<ActivityRecordDto>` — `createdAt` 내림차순 | 접근 | — |
| `POST W/activities` | `{ kind; content: string; durationMinutes: number }` (내용 1~500자, 1~1440분) | `201 ActivityRecordDto`(`pending`) | 팀원 — 수집 동의함 | 동의 안 함 `409`, 강사 `403` |
| `POST W/activities/{activityId}/confirm` | — | `200 ActivityRecordDto` — 1명 이상 확인하면 `confirmed`. 이미 확인했으면 그대로 | 팀원 — 작성자가 아님 (FR-ACT-02) | 작성자 · 강사 `403` |
| `POST W/peer-feedback` | `{ recipientMemberId: Id; week: string; thanks: string; improve: string }` (주 `2026-W45` 꼴 — 한국 시간 ISO 주, 각 1~200자) | `201 { "id": Id, "week": string }` — 작성자는 돌려주지 않는다 | 팀원 | 자기 자신 `400`, 같은 주 같은 사람에게 이미 씀 `409`, 강사 `403` |
| `GET W/peer-feedback/received` | — | `200 ReceivedPeerFeedback[]` — 내가 받은 것만, `createdAt` 내림차순 | 팀원 본인 | 강사 `403` (FR-ACT-04 "받는 사람만 본다") |

```ts
interface ActivityRecordDto {
  id: Id;
  authorMemberId: Id;
  kind: 'planning' | 'research' | 'design' | 'presentation' | 'mentor_question';
  content: string;
  durationMinutes: number;        // 본인 분포에만 쓰고 팀 화면에 합산하지 않는다 (P6)
  status: 'pending' | 'confirmed';
  confirmedByMemberIds: Id[];
  createdAt: Instant;
}
interface ReceivedPeerFeedback { id: Id; week: string; thanks: string; improve: string; createdAt: Instant } // 작성자 없음 (TBD-12)
```

## 15. 개인 API — 학습 타임라인 · 회고 리포트 · 기술 결정 카드

**공통 접근 규칙** (NFR-06 · P5 · P11 · P13 — 모든 행에 적용)

1. 사무실 접근 검사(강사는 그 사무실의 **현재** 지정을 요청마다 DB에서 확인).
2. 경로의 `memberId`가 그 사무실의 팀원(빠진 팀원 포함)이 아니면 `404`.
3. 읽기: 본인 또는 R4만. 다른 학생은 `403 forbidden_role`.
4. 쓰기: 본인만(강사는 꼬리질문만). 그 밖은 `403`.
5. 이 응답들은 Snapshot · SSE에 실리지 않는다.

| 메서드 · 경로 | 요청 | 성공 | 쓰기 조건 · 실패 |
| --- | --- | --- | --- |
| `GET W/members/{memberId}/timeline?page=&size=` | — | `200 PageResponse<TimelineEntry>` — `occurredAt` 내림차순 | — |
| `GET W/members/{memberId}/reports` | — | `200 RetroReportSummary[]` — `createdAt` 내림차순 | — |
| `POST W/members/{memberId}/reports` | `{ kind: 'final' \| 'midterm' }` | `201 RetroReportDto` | 본인 |
| `GET W/members/{memberId}/reports/{reportId}` | — | `200 RetroReportDto` — 계산 칸은 읽을 때 계산 | — |
| `PUT W/members/{memberId}/reports/{reportId}/learning` | `{ learning: string }` (0~5000자) | `200 RetroReportDto` | 본인 |
| `GET W/members/{memberId}/reports/{reportId}/markdown` | — | `200 text/markdown` — 팀원 이름은 "팀원 A"처럼 바뀐다 (FR-REP-03) | — |
| `GET W/members/{memberId}/decision-cards` | — | `200 DecisionCardDto[]` — `createdAt` 내림차순 | — |
| `POST W/members/{memberId}/decision-cards` | `{ submissionId: Id }` | `201 DecisionCardDto` — 9칸을 재료에서 규칙대로 채운다(AI 없음, 재료 없는 칸은 `null`) | 본인. 본인이 작성한 PR이 아님 `403`, PR이 아직 열림 `409`, 같은 PR 카드가 있음 `409` |
| `PUT W/members/{memberId}/decision-cards/{cardId}` | `{ cells: DecisionCardCells; confirmed: boolean }` | `200 DecisionCardDto` | 본인. `confirmed: true`인데 `learning` 칸이 비었음 `400` |
| `POST W/members/{memberId}/decision-cards/{cardId}/follow-up-request` | — | `200 DecisionCardDto`(`followUpRequested: true`) | 본인 |
| `POST W/members/{memberId}/decision-cards/{cardId}/follow-up-questions` | `{ body: string }` (1~1000자) | `201 FollowUpQuestionDto` — 9칸과 따로 붙는다 | R4. 요청 안 된 카드 `403` |

```ts
type TimelineKind =
  | 'evaluation_received'   // 내 PR이 받은 추천·비추천 이유 — 평가자 없음
  | 'evaluation_given'      // 내가 남긴 평가 이유
  | 'agenda_raised'         // 내가 올린 안건
  | 'agenda_decided'        // 내가 올린 안건의 결론 · 회의 결정
  | 'instructor_feedback'   // 내가 올린 안건에 달린 강사 피드백
  | 'commit_after_meeting'; // 회의 결정 뒤 고친 것(커밋)
interface TimelineEntry {
  kind: TimelineKind;
  occurredAt: Instant;
  title: string;
  detail: string | null;
  verdict: Verdict | null;  // evaluation_* 만
  ref: { type: 'submission' | 'agenda_item' | 'task'; id: Id } | null;
}

interface RetroReportSummary { id: Id; kind: 'final' | 'midterm'; createdAt: Instant }
interface RetroReportDto extends RetroReportSummary {
  memberId: Id;
  summary: string | null;          // 자동 요약 — 규칙으로 조립, AI 없음
  areaLabels: string[];            // 담당 기능 영역 (area:* — FR-REP-01)
  learning: string | null;         // 내가 배운 점 (FR-REP-02)
  agendaResults: {                 // 내가 올린 안건과 결론 · PR 결정 (FR-LRN-05 · 12)
    agendaItemId: Id; title: string; conclusion: string; learning: string | null;
    prDecision: 'revise_and_reevaluate' | 'merge_as_is' | 'close_pr' | null; decidedAt: Instant;
  }[];
  instructorFeedbacks: { agendaItemId: Id; instructor: UserRef; body: string; createdAt: Instant }[]; // FR-LRN-22
  activityDistribution: { kind: ActivityRecordDto['kind']; totalMinutes: number }[]; // 본인 것만 (FR-ACT-03)
  decisionCards: DecisionCardDto[]; // 본인이 확인한 카드만 (P11)
}

interface DecisionCardCells {      // 9칸 — 각 0~2000자, 재료가 없으면 null
  goal: string | null;             // 무엇을 하려 했나
  initialApproach: string | null;  // 처음 택한 방법
  feedbackReceived: string | null; // 받은 평가 — 추천·비추천 이유, 평가자 없음
  meetingDecision: string | null;  // 회의에서 정한 것
  finalChange: string | null;      // 최종적으로 바꾼 것
  rationale: string | null;        // 왜 그렇게 결정했나
  blockedMoment: string | null;    // 막혔던 순간
  learning: string | null;         // 내가 배운 점
  source: string | null;           // 원본 (PR · 이슈 · 회의 링크)
}
interface DecisionCardDto {
  id: Id;
  memberId: Id;
  submissionId: Id;
  cells: DecisionCardCells;
  confirmed: boolean;
  confirmedAt: Instant | null;
  followUpRequested: boolean;
  followUpRequestedAt: Instant | null;
  followUpQuestions: FollowUpQuestionDto[];
  createdAt: Instant;
  updatedAt: Instant;
}
interface FollowUpQuestionDto { id: Id; instructor: UserRef; body: string; createdAt: Instant }
```

```json
{
  "items": [
    { "kind": "evaluation_received", "occurredAt": "2026-11-05T02:40:00Z", "title": "#15 feat(auth): GitHub 로그인", "detail": "실패 응답 모양이 계약과 달라요", "verdict": "not_recommend", "ref": { "type": "submission", "id": "9" } }
  ],
  "page": 0, "size": 20, "totalItems": 1, "totalPages": 1
}
```

## 16. 강사 요청함

`GET /api/instructor/inbox?answered=true|false` → `200 InboxItem[]` — `requestedAt` 내림차순. `answered`를 빼면 전부.

- 역할: `MeResponse.isInstructor`가 `true`인 사람. 아니면 `403 forbidden_role`.
- 범위: 요청한 순간 **지금 지정된 사무실**의 요청만(요청마다 DB 확인). 해제된 사무실 것은 나오지 않는다. 심사용 강사 계정은 시연 사무실 것만.
- 답 없이 `resolved` · `ended`가 된 도움 요청은 나오지 않는다 — 강사가 더 답할 수 없다(「11」 코멘트 `409`). 답이 하나라도 있었으면 `answered=true` · 전부에 그대로 남는다(전부 = `true` ∪ `false`). 원본의 "강사에게 요청" 기록은 지우지 않는다 (2026-11-09 결정)
- 그 강사가 「나에게서만 삭제」한 도움 요청(「11」)은 그 강사의 요청함에서만 빠진다. 요청자가 영구 삭제한 도움 요청은 모든 강사의 요청함에서 사라진다 — 강사 답변도 함께 지워진다 (2026-11-10 — #315)

```ts
interface InboxItem {
  kind: 'help_request' | 'decision_feedback' | 'follow_up_question';
  workspaceId: Id;
  workspaceDisplayName: string;
  targetId: Id;            // helpRequestId · agendaItemId · cardId
  ownerMemberId: Id;       // 요청자 · 안건을 올린 사람 · 카드 주인
  title: string;           // 도움 요청 내용의 첫 줄 · 안건 제목 · 카드의 PR 제목 (아래)
  requestedAt: Instant;
  answeredAt: Instant | null; // 강사 답변 · 피드백 · 꼬리질문이 하나라도 있으면 그 첫 시각
}
```

- `title`은 읽을 때 원본에서 만든다 [구현 기본값]. `help_request` — 도움 요청에는 제목이 없어 `content`에서 빈 줄을 건너뛴 첫 줄의 앞뒤 공백을 뺀 값, 최대 100자(유니코드 문자 단위라 이모지를 반으로 자르지 않는다. 말줄임표는 붙이지 않는다). `decision_feedback` — 안건 `title`. `follow_up_question` — 카드가 가리키는 PR의 `SubmissionDto.title`.
- 답은 각 원래 API로 쓴다 — 도움 요청 코멘트(「11」), 강사 피드백(「10」), 꼬리질문(「15」). 요청함은 계산 값이라 저장하지 않는다(FR-LRN-23).

## 17. 컨벤션 라이브러리

| 메서드 · 경로 | 요청 | 성공 | 역할 | 실패 |
| --- | --- | --- | --- | --- |
| `GET /api/convention-library` | — | `200 ConventionLibraryItemDto[]` — `target`, `name` 순 | 로그인 사용자 전부(심사용 포함) | — |
| `POST /api/convention-library` | `ConventionLibraryItemRequest` | `201 ConventionLibraryItemDto` | GitHub 계정 강사(`isInstructor`이고 `accountType: 'github'`) | 심사용 ROLE-04 계정 · 학생 · 그 밖 `403 forbidden_role`, 길이 · 대상 `400` |
| `PUT /api/convention-library/{itemId}` | `ConventionLibraryItemRequest` | `200 ConventionLibraryItemDto` | 같음 (다른 강사가 만든 항목도 고칠 수 있다 — FR-LIB-01) | 같음 |

```ts
type ConventionTarget = 'branch_name' | 'commit_message' | 'pr_title' | 'pr_body' | 'issue_body' | 'issue_template' | 'pr_template';
interface ConventionLibraryItemRequest {
  target: ConventionTarget;
  name: string;               // 1~100자
  content: string;            // 패턴 · 예시 · 템플릿 본문, 1~20000자
  description: string | null; // 0~2000자
}
interface ConventionLibraryItemDto {
  id: Id;
  target: ConventionTarget;
  name: string;
  content: string;
  description: string | null;
  author: UserRef;            // 만든 강사
  updatedAt: Instant;
}
```

- 심사용 ROLE-04 계정은 조회만 한다 — 일반 강사 권한 축소가 아니라 심사용 계정의 데이터 격리 규칙이다(CONTRACTS.md 「6」 · P15).
- 서버 전체에 하나이고 사무실 경로 밖이다. 지우기 API는 없다(FR-LIB-01은 등록 · 편집). 팀 규칙 검사와 연결하지 않는다(FR-LIB-02).
