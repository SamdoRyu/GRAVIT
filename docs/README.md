# docs — 공통 계약 문서

| 파일 | 원본 | 이전일 |
| --- | --- | --- |
| [CONTRACTS.md](CONTRACTS.md) | `SamdoRyu/docs-for-PJ-review` @ `796fc25b459cd4a25af89e085c093f4e2c25f5b0` — `docs/CONTRACTS.md` | 2026-11-03 |
| [CONTRACTS_API.md](CONTRACTS_API.md) | 같은 커밋 — `docs/CONTRACTS_API.md` | 2026-11-03 |

- 두 파일의 **본문은 원본과 바이트 단위로 같다.** GRAVIT에서 추가한 것은 맨 위 7줄(이전 정보 주석과 안내 한 줄)뿐이다.
- 확인 방법 — Git Bash, GRAVIT 루트에서. `../docs-for-PJ-review`는 기획 저장소 clone 경로로 바꾼다. 아무것도 출력하지 않으면 같다:

  ```bash
  for f in CONTRACTS.md CONTRACTS_API.md; do
    tail -n +8 "docs/$f" | diff -q --strip-trailing-cr - <(git -C ../docs-for-PJ-review show "796fc25:docs/$f")
  done
  ```

## 계약 문서의 기준 위치

### 전환 (2026-11-03)

- **기준은 GRAVIT `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`이다.** 계약 변경은 GRAVIT에서 관리한다.
- **기준 계약 커밋: `e14fb85a6fe0ff8aea8be6a2a6c66a9b626fef03`** — 두 파일을 마지막으로 바꾼 GRAVIT 커밋(본문은 기획 저장소 `796fc25`와 같다). 두 파일이 다시 바뀌면 그 커밋 SHA가 새 기준이다.
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

## 역할 (2026-11-03 실제 4명 재배분)

| 역할 | 맡는 것 |
| --- | --- |
| **A** 총괄 · 기획 · 백엔드 일부 — `@wol20670` | 일정 · 계약 문서(문서 담당자) · Issue/PR 운영 · 통합 검증, 백엔드는 도움 요청(`help` 패키지) |
| **B** 백엔드 전담 — `@yang7493` | 공통 기반(`common` · Security · 인가) · 인증 · Workspace · GitHub 연동 · 동기화 · 그 밖의 서버 도메인 |
| **C** 프론트 3D — `@FG-Kaki` | `frontend/src/scene/**` · SceneModel · ThemeLayout · 드래그 · 3D 상호작용 |
| **D** 프론트 HUD · 데이터 — `@JHee0209` | `DataSource` · 화면 타입 · api/mock · `store` · HUD · 패널 · 인증 화면 |

- 프론트 두 사람은 프론트 작업이 끝나는 대로 백엔드에 합류한다. 그때 담당 Issue와 [`.github/CODEOWNERS`](../.github/CODEOWNERS)를 같이 고친다.
- 프론트 경로 CODEOWNERS는 두 사람 공동이다 — 한 사람 PR에 다른 사람이 자동으로 리뷰어로 붙게 하려는 것이다. 파일 소유(누가 고치는지)는 위 표와 Issue Assignee가 기준이다.

- 계약 본문(CONTRACTS.md 「9」 등)의 역할 문자는 **이전 배정**(B 연동 백엔드 · C 도메인 백엔드 · D 3D · 프론트) 기준이다. 본문은 계약 버전을 지키려고 고치지 않는다. 읽을 때는 이전 "B · C"(백엔드) → 지금 **B**(도움 요청은 **A**), 이전 "D"(프론트) → 지금 **C · D**로 바꿔 읽는다.
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
