# docs — 공통 계약 문서

| 파일 | 원본 | 이전일 |
| --- | --- | --- |
| [CONTRACTS.md](CONTRACTS.md) | `SamdoRyu/docs-for-PJ-review` @ `796fc25b459cd4a25af89e085c093f4e2c25f5b0` — `docs/CONTRACTS.md` | 2026-11-03 |
| [CONTRACTS_API.md](CONTRACTS_API.md) | 같은 커밋 — `docs/CONTRACTS_API.md` | 2026-11-03 |

- 두 파일은 원본을 옮긴 뒤 **GRAVIT에서 고친 곳이 있다** — 아래 「GRAVIT에서 고친 곳」 표가 전부다. 맨 위 7줄(이전 정보 주석과 안내 한 줄)도 GRAVIT에서 추가했다.
- 확인 방법 — Git Bash, GRAVIT 루트에서. `../docs-for-PJ-review`는 기획 저장소 clone 경로로 바꾼다. 나오는 차이(`>` 줄이 GRAVIT)가 아래 표의 고친 곳뿐이어야 한다:

  ```bash
  for f in CONTRACTS.md CONTRACTS_API.md; do
    tail -n +8 "docs/$f" | diff --strip-trailing-cr <(git -C ../docs-for-PJ-review show "796fc25:docs/$f") -
  done
  ```

### GRAVIT에서 고친 곳

| 날짜 | 파일 · 위치 | 내용 | 근거 |
| --- | --- | --- | --- |
| 2026-11-04 | 두 파일 맨 위 주석 · 안내 한 줄 | "원본과 같다" → 이 표를 가리키게 | — |
| 2026-11-04 | CONTRACTS.md 「2」 `Member` · 소유와 변경 주체 | `deskIndex` 0~7(최대 8자리), 8자리가 다 차 있으면 비워 둠 | 2026-11-04 결정 — 작업 포드 8개 |
| 2026-11-04 | CONTRACTS.md 「3」 표시 상태 표 · 「10」 대표 담당자 규칙 | 대표 담당자에게 책상 자리가 없으면 `backlog` | 같음 |
| 2026-11-04 | CONTRACTS.md 「8」 | 기본 테마 이름: 사무실 → 우주정거장(확정 시안 `frontend/public/station/`) | #76 · #77 |
| 2026-11-04 | CONTRACTS.md 「10」 | 행 추가: 아바타 이동 연출 · 작업 포드 표시 · 책상 자리가 없는 팀원 | C 요청(빛 신호 이동) · 2026-11-04 결정 |
| 2026-11-04 | CONTRACTS_API.md 「5」 `MemberDto.deskIndex` · `members` 정렬 | 0~7, 자리가 없는 지금 팀원은 `null`이고 deskIndex 있는 팀원 뒤 | 2026-11-04 결정 — 작업 포드 8개 |
| 2026-11-05 | 두 파일 머리말 「마지막 갱신」 | 2026-11-05 | #146 |
| 2026-11-05 | CONTRACTS.md 「3」 요구사항 재동기화 충돌 표 | ①에서 짝을 못 찾은 같은 제목이 두 번 이상(원본 ID 유무 무관)이고 기존 후보가 있으면 `duplicate_title` | #146 — #14 · #122 |
| 2026-11-05 | CONTRACTS.md 「3」 평가 회차 · CONTRACTS_API.md 「10」 decision | 머지 · 닫힌 PR 안건에 `revise_and_reevaluate`면 `409`, 회차를 열지 않음 | #146 — #27 · #128 |
| 2026-11-05 | CONTRACTS.md 「3」 막힘 신호 · 평균 리뷰 대기(새 절) · 「10」 목록 · CONTRACTS_API.md 「5」 `averageReviewWaitHours` | 막힘 판정 규칙(승인 후 머지 대기 포함)과 평균 리뷰 대기 계산 규칙 [구현 기본값] | #146 — #22 · #129 · #24 |
| 2026-11-05 | CONTRACTS_API.md 「8」 `POST W/requirement-links` | 같은 연결이 이미 있으면 요구사항 상태와 상관없이 `200` | #146 — #18 · #130 |
| 2026-11-06 | CONTRACTS.md 머리말 「마지막 갱신」 · 「5」 | 2026-11-06. 길이 1자부터인 글 필드는 공백만인 값을 `invalid`로 거부(저장 값은 그대로, `null` 허용 필드의 `null`은 검사 안 함) | #175 — #156 리뷰 |
| 2026-11-06 | CONTRACTS.md 「2」 계산 값 · 「3」 요구사항 · 「8」 SceneModel · 「10」, CONTRACTS_API.md 머리말 「마지막 갱신」 · 「5」 `RequirementDto.sourceKey` 주석 | 요구사항 종류별 묶음 → 판 5\~10장 + 대기 칸(`requirement:waiting`, 배지 `waiting:N` · `empty:k`). 교환 결과는 보는 사람의 브라우저에만. `groupKey`는 이름표 · 분류 · 정렬용. "완료 요구사항 k/N" 묶음 배지 삭제. 빈 판은 드롭 구역 아님 | #14 — C 요청 · 2026-11-06 결정 |
| 2026-11-06 | CONTRACTS.md 「8」 SceneModel | 게시판 배지 `help:N` · `candidate:k`(0이면 없음), 결정 기록 · 강사 피드백 · 배운 점은 세지 않음, 고르면 도움 요청 목록(결정 기록 · 강사 피드백 HUD가 생기면 그것도) | #205 — C 요청 · 2026-11-06 결정 |
| 2026-11-06 | CONTRACTS_API.md 「16」 `InboxItem.title` | 종류별 `title` 규칙 [구현 기본값] — 도움 요청은 내용의 빈 줄을 건너뛴 첫 줄(앞뒤 공백 뺌, 최대 100자, 말줄임표 없음), 결정 피드백은 안건 제목, 꼬리질문은 카드의 PR 제목. 서버 `InstructorInboxService` 그대로 | #224 — B 질문 · 2026-11-06 결정 |
| 2026-11-09 | CONTRACTS.md 머리말 「마지막 갱신」 · 「2」 시연 사무실 접근 대상 · 「6」 검사 순서 `demo` · 「세션 · 쿠키 · CSRF · SSE」 · 「10」 구현 기본값 · 남은 결정 | v1은 외부에 배포하지 않고 로컬에서 실행(SP11 재결정). 우리 조 실제 GitHub 계정은 시연 사무실에 넣지 않음(「10」 "우리 조 계정의 시연 사무실 역할" 행 삭제), 심사용 계정은 서버 설정 `REVIEW_ACCOUNTS`. 「6」 반드시 지킬 것은 그대로. API · DTO · enum · 에러 코드 · Entity는 그대로 | #258 — 2026-11-09 결정 (#251 하지 않음) |
| 2026-11-09 | CONTRACTS_API.md 머리말 「마지막 갱신」 · 「11」 `instructor-request` · 「16」 강사 요청함, CONTRACTS.md 「6」 상태 충돌 목록 | 강사에게 요청은 `open` · `discussing` · `on_agenda`만 — `resolved` · `ended` `409`(이미 켜져 있어도), 새로 켤 때 지정된 강사가 없으면 `409`(시연 사무실은 심사용 강사가 강사), 이미 켜져 있으면 그대로(알림 없음). 요청함은 답 없이 닫힌 도움 요청을 빼고 답한 기록은 남긴다. API · DTO · enum · 에러 코드 · Entity · DB는 그대로 | #271 — 2026-11-09 결정 (코드 #272) |
| 2026-11-09 | CONTRACTS.md 「8」 드롭 결과 | 행 추가: 안건 철회 드롭 — 내가 올린 결정 전 안건을 회의실 쓰레기통에 놓으면 `withdrawAgendaItem`(API · 권한 규칙 그대로, 원본은 그대로) | #291 — FR-LRN-14 |
| 2026-11-10 | CONTRACTS.md 머리말 「마지막 갱신」 · 「2」 `HelpRequest` 관계 · `HelpRequestHidden` 행 · 「3」 무결성 제약(숨김 유일 · 안건 원본) · 지우지 않는 기록 · 「5」 Snapshot 받는 사람 · 「6」 대상 조건 위반 · 「8」 게시판 배지 / CONTRACTS_API.md 머리말 「마지막 갱신」 · 「0」 · 「5」 `helpRequests` · 「6」 숨김 이벤트 · 「10」 `AgendaItemDto.source` · 「11」 상세 · 숨김 · 숨김 해제 · 숨김 목록 · 영구 삭제 · 도움 요청 삭제 · 「16」 강사 요청함 | 도움 요청 삭제 두 방식(팀 확정). ① 나에게서만 삭제: `PUT` · `DELETE W/help-requests/{id}/hidden` · `GET W/help-requests/hidden` — 사용자별 숨김(`HelpRequestHidden`), 그 사람의 Snapshot · 강사 요청함 · 배지에서만 빠짐, 해제 가능, 팀원 · 강사 모두, 이벤트 없음. ② 모두에게서 영구 삭제: `DELETE W/help-requests/{id}` — 요청자만(`403`), 상태 무관, 도움 요청 · 코멘트(강사 답변 포함) · 숨김 행을 실제로 삭제(논리 삭제 아님), `confirmed` 안건은 `withdrawn`, `discussed` · `withdrawn` 안건 · 결정 · 강사 피드백 · 회의는 보존하고 원본 연결만 끊음, 남는 안건 제목은 "삭제된 도움 요청", 연쇄 삭제 설정 금지, 알림 `help_requests` · `agenda_items`. 원본이 지워진 `help_request` 안건은 `source: null`. 「지우지 않는 기록」에 도움 요청 · 코멘트 예외 추가, Snapshot은 숨김 목록만 사람별. 새 에러 code · enum 값 없음 | #312 후속 — 코드 #315 · #316 |

## 계약 문서의 기준 위치

### 전환 (2026-11-03)

- **기준은 GRAVIT `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`이다.** 계약 변경은 GRAVIT에서 관리한다.
- **기준 계약 커밋: `d6b3160788412d004173f0d46e49dd293972e37e`** — 두 파일을 마지막으로 바꾼 GRAVIT 커밋. 두 파일이 다시 바뀌면 그 커밋 SHA가 새 기준이다(2026-11-04 #82로 `e14fb85` → `2fbb17b`, 2026-11-05 #147로 `2fbb17b` → `49b9bf0`, 2026-11-06 #176으로 `49b9bf0` → `83866bc`, 2026-11-06 #194로 `83866bc` → `702a55f`, 2026-11-06 #210으로 `702a55f` → `6cc06de`, 2026-11-06 #229로 `6cc06de` → `4dc5c72`, 2026-11-09 #259로 `4dc5c72` → `4c44236`, 2026-11-09 #273으로 `4c44236` → `d6b3160`).
- 기획 저장소의 두 파일은 커밋 `796fc25`까지의 원본 이력으로만 남긴다(더 고치지 않는다). 같은 계약을 두 곳에서 따로 고치지 않는다.

| 전환 조건 | 상태 |
| --- | --- |
| 1. GRAVIT `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`가 `main`에 반영 | 완료 — GRAVIT `main` `932f074` (PR #2) |
| 2. 기획 저장소 두 파일 맨 위에 「기준 위치 안내문」 반영 | 완료 — 기획 저장소 브랜치 `docs/plan-v3-stack-decisions-1101` 커밋 `e312463f6708bc48fd18996cf3ffad36af7e60f3` (2026-11-03 원격 확인, 안내문 밖 본문은 `796fc25`와 같음) |

두 조건이 모두 반영됐다. 이 파일이 `main`에 반영되면 두 저장소의 안내가 같은 기준 위치를 가리킨다.

### 전환 확인 방법

```bash
# 1) 기획 저장소 두 파일에 안내문이 있다
gh api "repos/SamdoRyu/docs-for-PJ-review/contents/docs/CONTRACTS.md?ref=docs/plan-v3-stack-decisions-1101" -H "Accept: application/vnd.github.raw" | head -n 8
gh api "repos/SamdoRyu/docs-for-PJ-review/contents/docs/CONTRACTS_API.md?ref=docs/plan-v3-stack-decisions-1101" -H "Accept: application/vnd.github.raw" | head -n 8
# 2) 기획 저장소 안내문 밖의 계약 본문은 796fc25와 같다 (기획 저장소 clone에서)
git diff 796fc25 docs/plan-v3-stack-decisions-1101 -- docs/CONTRACTS.md docs/CONTRACTS_API.md
# 3) GRAVIT 계약 문서를 마지막으로 바꾼 커밋 = 기준 계약 커밋
git log -1 --format=%H origin/main -- docs/CONTRACTS.md docs/CONTRACTS_API.md
```

2)는 안내문 몇 줄만 더해진 diff가 나와야 한다.

### 기준 위치 안내문 (기획 저장소에 넣을 문구)

기획 저장소 `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`의 제목 바로 아래에 넣는다. GRAVIT 쪽이 `main`에 반영된 뒤에 넣는다(2026-11-03 반영 — 위 표).

```markdown
> **기준 위치가 바뀌었다 (YYYY-MM-DD).** 이 계약의 현재 기준은 개발 저장소
> [SamdoRyu/GRAVIT `docs/CONTRACTS.md`](https://github.com/SamdoRyu/GRAVIT/blob/main/docs/CONTRACTS.md) ·
> [`docs/CONTRACTS_API.md`](https://github.com/SamdoRyu/GRAVIT/blob/main/docs/CONTRACTS_API.md)이다.
> 이 파일은 커밋 `796fc25`까지의 원본 이력으로만 남기고 더 고치지 않는다.
```

## 계약 변경 권한

- 계약 문서의 최종 수정과 GitHub 반영은 **문서 담당자 1명**이 한다(CONTRACTS.md 「9」 문서 관리 방식).
- 개발자와 Claude Code 세션은 계약을 직접 바꾸지 않는다. 필드 이름 · 타입 · 필수 여부 · enum 값 · API 경로 · 상태 코드가 바뀌어야 하면 문서 담당자에게 요청한다.
- **문서가 먼저, 코드가 나중**이다. 계약에 닿는 Java DTO · TypeScript 타입 · `contract/examples/` JSON은 계약 문서가 바뀐 뒤 한 PR에서 함께 바꾼다.

## 역할 (2026-11-03 실제 4명 재배분, 백엔드 재배분 2026-11-05)

| 역할 | 맡는 것 |
| --- | --- |
| **A** 총괄 · 기획 · 백엔드 일부 — `@wol20670` | 일정 · 계약 문서(문서 담당자) · Issue/PR 운영 · 통합 검증, 백엔드는 도움 요청(`help`) · 회의 · 안건 · 스탠드업(`meeting`) · `report`의 회고 리포트 · Snapshot 조립(`GET W/snapshot`) |
| **B** 백엔드 전담 — `@yang7493` | 공통 기반(`common` · Security · 인가) · 인증 · Workspace · GitHub 연동 · 동기화 · 그 밖의 서버 도메인 |
| **C** 프론트 3D — `@FG-Kaki` | `frontend/src/scene/**` · SceneModel · ThemeLayout · 드래그 · 3D 상호작용 |
| **D** 프론트 HUD · 데이터 — `@JHee0209` | `DataSource` · 화면 타입 · api/mock · `store` · HUD · 패널 · 인증 화면 |

- 프론트 두 사람은 프론트 작업이 끝나는 대로 백엔드에 합류한다. 그때 담당 Issue와 [`.github/CODEOWNERS`](../.github/CODEOWNERS)를 같이 고친다.
- 프론트 경로 CODEOWNERS는 두 사람 공동이다 — 한 사람 PR에 다른 사람이 자동으로 리뷰어로 붙게 하려는 것이다. 파일 소유(누가 고치는지)는 위 표와 Issue Assignee가 기준이다.
- 백엔드 재배분(B 부하 분산, 두 번 모두 B 합의): 1차 2026-11-04 회의실 안건 #36 · #37 · #32 · #33(#36 코멘트), 2차 2026-11-05 스탠드업 #35 · #34 · 회의 결정 확장 #27 · #57 · 회고 리포트 #40 · #41 · #42 · #43(#35 코멘트), Snapshot #103. B가 만든 Entity(`AgendaItem` · `Meeting` · `Standup` 등)에는 A가 메서드를 더하고, 스키마 변경은 새 마이그레이션 + B 리뷰로 한다. 같은 `report` 패키지의 결정 카드(#62 · #44 · #59)는 B다.

- 계약 본문(CONTRACTS.md 「9」 등)의 역할 문자는 **이전 배정**(B 연동 백엔드 · C 도메인 백엔드 · D 3D · 프론트) 기준이다. 본문은 계약 버전을 지키려고 고치지 않는다. 읽을 때는 이전 "B · C"(백엔드) → 지금 **B**(도움 요청 · 회의 · 안건 · 스탠드업 · 회고 리포트는 **A**), 이전 "D"(프론트) → 지금 **C · D**로 바꿔 읽는다.
- Issue별 담당은 GitHub Issue 본문이 기준이다. 실제 GitHub 계정 지정은 사람 팀원 4명 중에서만 한다(AI 계정 금지 — 루트 `CLAUDE.md` 「Git」).

## 본문에서 이름만 나오는 기획 문서 (고정 링크)

계약 본문은 아래 문서를 이름이나 번호(03 · 05 · 06 등)로만 부른다. GRAVIT에는 없으므로 확정 커밋 `796fc25` 고정 링크로 연다.

| 본문 표기 | 문서 |
| --- | --- |
| 00 | [00-backlog.md][00] — 이슈 백로그 (Must) |
| 03 | [03-requirements.md][03] — 요구사항 정의서 |
| 04 | [04-features.md][04] — 기능 · 인수 조건 |
| 05 | [05-policy.md][05] — 정책 |
| 06 | [06-data.md][06] — 저장 항목 |
| 07 | [07-screens.md][07] — 화면 |
| PRD | [PRD.md][prd] |
| ARCHITECTURE.md | [ARCHITECTURE.md][arch] |
| BACKEND_ASSIGNMENTS · SCREEN_ASSIGNMENTS | [BACKEND_ASSIGNMENTS.md][ba] · [SCREEN_ASSIGNMENTS.md][sa] — 고정 링크는 이전 역할 기준. 2026-11-03 재배분 반영본은 기획 브랜치 최신: [BACKEND][ba-new] · [SCREEN][sa-new] |
| PROJECT_COMMANDS.md | [PROJECT_COMMANDS.md][pc] (GRAVIT 실제 명령은 루트 [README.md](../README.md)) |
| 결정 기록 | [reviews/decision-meeting-2026-10-28.md][dm] |
| 코드 컨벤션 (BE) | [plan/코드 컨벤션 (BE).md][be] |
| Git 전략 | [plan/Git 전략.md][git] |
| 환경 변수 가이드 | [plan/환경 변수 가이드.md][env] |
| 기획안 | [plan/GitVillage 기획안][plan] |

[00]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/00-backlog.md
[03]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/03-requirements.md
[04]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/04-features.md
[05]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/05-policy.md
[06]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/06-data.md
[07]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/07-screens.md
[prd]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/PRD.md
[arch]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/ARCHITECTURE.md
[ba]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/BACKEND_ASSIGNMENTS.md
[sa]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/SCREEN_ASSIGNMENTS.md
[ba-new]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/docs/plan-v3-stack-decisions-1101/docs/BACKEND_ASSIGNMENTS.md
[sa-new]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/docs/plan-v3-stack-decisions-1101/docs/SCREEN_ASSIGNMENTS.md
[pc]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/PROJECT_COMMANDS.md
[dm]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/reviews/decision-meeting-2026-10-28.md
[be]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/%EC%BD%94%EB%93%9C%20%EC%BB%A8%EB%B2%A4%EC%85%98%20%28BE%29.md
[git]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/Git%20%EC%A0%84%EB%9E%B5.md
[env]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/%ED%99%98%EA%B2%BD%20%EB%B3%80%EC%88%98%20%EA%B0%80%EC%9D%B4%EB%93%9C.md
[plan]: https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/GitVillage%20%EA%B8%B0%ED%9A%8D%EC%95%88%20%E2%80%93%203D%20%ED%83%80%EC%9D%B4%EC%BF%A4%ED%98%95%20%EB%B6%80%EC%BA%A0%20%EC%A0%80%EC%9E%A5%EC%86%8C%20%ED%95%99%EC%8A%B5%20%EC%84%9C%EB%B9%84%EC%8A%A4.md
