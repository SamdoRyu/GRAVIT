# GRAVIT

GitHub 저장소의 이슈 · PR · 회의 · 도움 요청을 3D 사무실 공간으로 보여 주는 부트캠프 팀 프로젝트 학습 서비스(기획명 GitVillage)의 개발 저장소입니다.
프론트엔드 · 백엔드 · 공통 계약 예시 · 로컬 DB 설정을 이 저장소 하나(모노레포)에서 관리합니다.

> 지금은 **실행 가능한 개발 뼈대** 단계입니다. 화면은 기존 3D 데모를 브라우저 mock 데이터로 띄우고, Spring Boot는 DB 연결까지만 되어 있습니다. 자세한 건 아래 「현재 상태」를 보세요.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 프론트엔드 | React 19 · TypeScript 6 · Vite 8 · Three.js · React Three Fiber · drei · Zustand |
| 프론트 도구 | oxlint · `node:test` + tsx(계약 테스트) · Playwright(E2E) |
| 백엔드 | Spring Boot 4.1.2 · Java 21 · Gradle(Groovy DSL) · Spring MVC · Spring Data JPA · Spring Security · OAuth2 Client · Validation · Actuator · Lombok |
| DB | MySQL 8.4 LTS(`mysql:8.4.13`) · Flyway |
| 로컬 개발 환경 | MySQL만 Docker Compose, Spring Boot · Vite는 로컬에서 직접 실행 |

## 디렉터리 구조

```text
GRAVIT/
├── frontend/            React 3D 화면 (기존 warehouseDemo_fork에서 이전)
│   ├── src/             app · scene(3D) · ui(HUD) · data(DataSource · mock · api) · store.ts
│   ├── tests/contract/  DataSource 계약 · 규칙 · API 클라이언트 테스트 (node:test)
│   ├── tests/e2e/       Playwright E2E (mock 데이터)
│   └── scripts/         check-bundle(빌드 후 검사)
├── backend/             Spring Boot (com.samdoryu.backend)
│   └── src/main/resources/
│       ├── application.yaml
│       └── db/migration/   Flyway 마이그레이션 (V1__xxx.sql 형식, 아직 없음)
├── contract/examples/   API 계약 예시 JSON (CONTRACTS_API.md에서 옮김)
├── docs/                공통 계약 문서 (CONTRACTS.md · CONTRACTS_API.md) + 기준 위치 안내(docs/README.md)
├── .github/             이슈 · PR 템플릿, CODEOWNERS, labels.yml, CI(workflows/ci.yml)
├── .claude/             Claude Code 규칙(rules/) · 스킬(skills/) · 권한 설정(settings.json)
├── CLAUDE.md            Claude Code 세션 진입점
├── compose.yaml         로컬 개발용 MySQL
├── .env.example         환경 변수 예시 (복사해서 .env 로 사용)
└── .nvmrc               Node 24
```

## 필요 프로그램

| 프로그램 | 버전 | 확인 명령 |
| --- | --- | --- |
| JDK | 21 (Temurin 권장) | `java -version` |
| Node.js | 24 LTS (`.nvmrc`) — 최소 22.12 | `node -v` |
| npm | Node에 포함된 것 | `npm -v` |
| Docker Desktop | Compose v2 포함 | `docker compose version` |
| Google Chrome | E2E 실행 시에만 필요 | — |

Gradle은 설치할 필요가 없습니다(`backend/gradlew` Wrapper 사용).

## 처음 실행하기 (Windows PowerShell)

### 1. 환경 변수 파일 만들기

```powershell
Copy-Item .env.example .env
notepad .env   # MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD 를 각자 바꾼다
```

- `.env`는 Git에 올라가지 않습니다. 실제 비밀번호 · 토큰 · 키는 `.env`(또는 서버 환경 변수)에만 둡니다.
- 값에 따옴표를 붙이지 않습니다. 빈 값(`KEY=`)은 미설정과 같습니다.
- `.env` 하나를 Docker Compose와 Spring Boot가 같이 읽습니다(Spring은 `backend/`에서 실행할 때 `../.env`를 읽음).

### 2. MySQL 실행 (저장소 루트)

```powershell
docker compose up -d --wait   # 처음엔 이미지 다운로드로 시간이 걸린다
docker compose ps             # STATUS 가 healthy 인지 확인
```

- 이미 PC에 MySQL이 설치되어 있어 **3306 포트가 사용 중이면** `.env`의 `MYSQL_PORT=3307`처럼 바꾸고 다시 실행합니다. Spring도 같은 값을 읽습니다.
- 끄기: `docker compose down` (데이터 유지) / 데이터까지 지우기: `docker compose down -v`
- `.env`의 DB 비밀번호를 **나중에 바꿨다면** 기존 볼륨에는 반영되지 않습니다. `docker compose down -v` 후 다시 `up` 하세요(로컬 데이터 삭제됨).

### 3. Spring Boot 실행

```powershell
cd backend
.\gradlew.bat bootRun
```

- 기본 포트 `8080`. MySQL이 떠 있어야 시작됩니다(Flyway가 시작할 때 DB에 접속).
- IntelliJ에서는 `backend/build.gradle`을 Gradle 프로젝트로 열고, 실행 설정의 Working directory를 `backend/`로 둡니다(그래야 `../.env`를 찾음).
- 로그인하지 않은 `/api/**` 요청은 `401 unauthorized`가 정상입니다. 실제 GitHub 사무실을 쓰려면 아래 「5. GitHub App 설정」을 먼저 합니다.

### 4. 프론트엔드 실행

```powershell
cd frontend
npm ci
npm run dev
```

- 브라우저: <http://localhost:5173> — 기본은 **브라우저 mock 데이터**라 백엔드 없이도 3D 화면 · 드래그가 동작합니다.
- 화면 메뉴의 「데이터 초기화」로 mock 데이터를 처음 상태로 되돌릴 수 있습니다.

### 5. GitHub App 설정 (실제 GitHub 사무실 — 선택)

mock만 쓸 때는 필요 없습니다. 팀에서 앱 하나를 만들어 같이 써도 됩니다(값은 만든 사람이 안전한 경로로 나눠 준다).

1. GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**
   - Callback URL: `http://localhost:5173/login/oauth2/code/github` (Vite가 `/oauth2` · `/login/oauth2`를 Spring으로 넘긴다)
   - **Expire user authorization tokens: 끔** — 서버가 사용자 토큰을 갱신하지 않는다
   - Webhook: **Active 끔**
   - 권한(전부 **Read-only**): Repository — Metadata · Contents · Issues · Pull requests, Organization — Members
   - **공개 앱(Any account)으로 만든다.** "Only on this account"면 그 계정(조직)의 멤버만 로그인할 수 있어, 외부 콜라보레이터 · 강사 계정은 승인 화면이 GitHub 404로 뜬다. 권한은 읽기 전용이고 앱을 설치한 계정이 고른 레포만 읽는다. 이미 만들었다면 앱 설정 → Advanced → Make public
2. 앱 화면에서 **Generate a new client secret**, **Generate a private key**(`.pem` 내려받기)
3. 키 파일을 **레포 루트의 `secrets/`**에 둔다(예: `secrets/github-app.pem`, Git에 안 올라감)
4. `.env`의 GitHub 값 다섯 개를 채운다 — `GITHUB_APP_CLIENT_ID` · `GITHUB_APP_CLIENT_SECRET` · `GITHUB_APP_SLUG`(앱 주소 `github.com/apps/<slug>`) · `GITHUB_APP_ID` · `GITHUB_APP_PRIVATE_KEY_PATH`
   - **키 경로는 절대 경로**로 적는다(예: `C:/work/GRAVIT/secrets/github-app.pem`). Spring은 `backend/`에서 실행되어 `./secrets/...`가 `backend/secrets/`로 풀리고, 첫 동기화가 `GitHub App 개인 키 파일을 읽지 못함`으로 실패한다
   - 강사로 볼 계정이 있으면 `INSTRUCTOR_GITHUB_USER_IDS`에 GitHub 사용자 **ID**(숫자 — `https://api.github.com/users/<login>`의 `id`)를 넣는다
5. 앱 화면 → **Install App** → 팀 레포가 있는 계정(조직)에 설치하고, 그 레포만 고른다
6. Spring을 다시 시작하고 브라우저는 **`http://localhost:5173/?source=api`**로 연다(`127.0.0.1`이면 쓰기 요청의 Origin이 `APP_ORIGIN`과 달라 `403`). GitHub로 로그인 → 사무실 열기 → 첫 동기화

## 프론트엔드 ↔ 백엔드 연결

```text
브라우저 ──▶ Vite :5173 ──(/api/** 프록시)──▶ Spring Boot :8080 ──▶ MySQL (compose)
```

- 화면은 항상 같은 출처의 상대 경로 `/api/**`를 부릅니다. 개발 중엔 Vite가 Spring으로 넘깁니다(`frontend/vite.config.ts`).
- 프록시는 `Host`를 바꾸지 않습니다(`changeOrigin: false`). 세션 쿠키 · CSRF 쿠키 · 리다이렉트가 화면 출처(`localhost:5173`) 기준으로 만들어지게 하려는 것입니다.
- Spring 포트를 바꿨다면 Vite를 띄우는 셸에서 지정합니다: `$env:API_PORT=8081; npm run dev`
- 데이터 소스 선택은 주소로 합니다: `/` = mock, `/?source=api` = 서버(Spring v1 API — GitHub 로그인은 위 「5. GitHub App 설정」이 필요).

## 빌드 · 테스트 명령

### 프론트엔드 (`frontend/`)

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 `:5173` |
| `npm run build` | `tsc -b` 타입 검사 + Vite 빌드 + `check-bundle`(첫 화면에 3D 청크가 섞이면 실패) |
| `npm run lint` | oxlint (경고는 있음, 오류 0) |
| `npm run test:contract` | mock DataSource 계약 · 규칙 · API 클라이언트 테스트 |
| `npm run test:e2e` | Playwright E2E (mock). Chrome 필요, 포트 5180 사용 |
| `npm run preview` | 빌드 결과 미리 보기 |

### 백엔드 (`backend/`)

| 명령 | 내용 |
| --- | --- |
| `.\gradlew.bat bootRun` | 로컬 실행 (MySQL 필요) |
| `.\gradlew.bat compileJava compileTestJava` | 컴파일만 (DB 불필요) |
| `.\gradlew.bat test` | 테스트 — `contextLoads`가 DB에 붙으므로 **MySQL 필요** |
| `.\gradlew.bat bootJar` | 실행 jar → `backend/build/libs/` |
| `.\gradlew.bat build` | 컴파일 + 테스트 + jar (MySQL 필요) |

macOS · Linux에서는 `.\gradlew.bat` 대신 `./gradlew`를 씁니다.

### DB 마이그레이션 (Flyway)

- 위치: `backend/src/main/resources/db/migration/`, 이름: `V1__create_xxx.sql`, `V2__...` 순서.
- Spring Boot가 시작할 때 자동 적용합니다. 이미 적용된 파일은 고치지 말고 새 버전 파일을 추가합니다.
- 스키마는 Flyway로만 바꿉니다. Hibernate `ddl-auto`로 테이블을 만들지 않습니다(Spring 기본값 `none` 유지).

## 공통 계약

- **기준 계약 커밋: `4dc5c726f7732fff491bff77d21f470186594d44`** — GRAVIT `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`를 마지막으로 바꾼 커밋. 두 파일이 바뀌면 그 커밋 SHA가 새 기준입니다.
- 개발 중에 읽는 곳: [`docs/CONTRACTS.md`](docs/CONTRACTS.md)(도메인 · ID · 에러 · 보안 · 계약 테스트) · [`docs/CONTRACTS_API.md`](docs/CONTRACTS_API.md)(엔드포인트 · DTO)
  - 기획 저장소 커밋 `796fc25`의 두 파일을 **2026-11-03에 그대로 옮겼습니다**(본문 변경 없음, 맨 위에 출처 안내만 추가).
  - 본문에 이름만 나오는 기획 문서(03 · 05 · 06 · ARCHITECTURE.md · 코드 컨벤션 (BE) 등)의 고정 링크는 [`docs/README.md`](docs/README.md)에 있습니다.
- `contract/examples/`의 JSON은 CONTRACTS_API.md의 예시를 옮겨 시작했고, 문서에 예시가 없는 DTO는 계약 타입대로 새로 만들었습니다. 기준은 계약 문서의 타입이고, 예시 JSON · Java DTO · TS 사본은 계약 테스트(CONTRACTS.md 「9」)가 서로 맞춥니다.
- PR 본문에 기준 계약 커밋을 적습니다.

### 기준 위치 — GRAVIT (2026-11-03 전환)

| 저장소 | 계약 문서의 지위 |
| --- | --- |
| **GRAVIT** `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md` | **기준.** 계약 변경은 여기서 관리 |
| 기획 저장소 같은 이름의 두 파일 | 커밋 `796fc25`까지의 원본 이력. 맨 위에 기준 위치 안내문이 있고 더 고치지 않음 |

전환 조건 · 상태 · 확인 명령은 [`docs/README.md`](docs/README.md)에 있습니다. 같은 계약을 두 저장소에서 따로 고치지 않습니다.

### 계약 변경 요청 절차

1. 계약(API 경로 · DTO 필드 · enum · 에러 코드 · Entity)이 달라야 할 것 같으면 **코드를 먼저 바꾸지 말고** 문서 담당자에게 요청합니다(이슈 · 댓글 · 메시지).
2. 문서 담당자가 계약 문서를 고쳐 반영하고, **새 커밋 SHA와 바뀐 절**을 관련 담당자 · 진행 중인 Claude Code 세션에 공유합니다.
3. 개발자는 새 SHA를 기준으로 Java DTO · TS 타입 · `contract/examples/`를 **한 PR에서** 바꾸고, PR 본문 「기준 공통 계약 커밋」에 그 SHA를 적습니다.

Claude Code 세션은 계약 문서를 스스로 고치지 않습니다.

## 저장소 역할

| 저장소 | 담는 것 | 바꾸는 사람 · 방식 |
| --- | --- | --- |
| [docs-for-PJ-review](https://github.com/SamdoRyu/docs-for-PJ-review) (기획) | 요구사항 · 정책 · 화면 · 결정 기록 · 백로그 · 담당 배분, 계약 원본 이력(`796fc25`까지) | 문서 담당자 1명이 직접 커밋 · 푸시 (PR 필수 아님) |
| **GRAVIT** (개발) | 코드 · 계약 문서(기준) · 계약 예시 JSON · CI · 협업 템플릿 | 팀원 전원 — 이슈 → 브랜치 → PR → 승인 1명 → squash |

### 역할 (2026-11-03 실제 4명, 백엔드 재배분 2026-11-05)

| 역할 | 맡는 것 |
| --- | --- |
| **A** 총괄 · 기획 · 백엔드 일부 | 일정 · 계약 문서 · Issue/PR 운영 · 통합 검증, 백엔드 도움 요청(`help`) · 회의 · 안건 · 스탠드업(`meeting`) · 회고 리포트 · Snapshot 조립 |
| **B** 백엔드 전담 | 공통 기반 · 인증 · 인가 · Workspace · GitHub 연동 · 동기화 · 그 밖의 서버 도메인 |
| **C** 프론트 3D | 3D 장면 · SceneModel · ThemeLayout · 드래그 · 상호작용 |
| **D** 프론트 HUD · 데이터 | DataSource · 타입 · api/mock · store · HUD · 패널 · 인증 화면 |

계약 본문의 옛 역할 문자를 읽는 법은 [`docs/README.md`](docs/README.md) 「역할」. Issue별 담당은 Issue 본문이 기준입니다.

## 협업 (GitHub)

규칙의 기준은 기획 저장소 [Git 전략](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/Git%20%EC%A0%84%EB%9E%B5.md)입니다. 요약:

### 이슈

New issue에서 템플릿을 고릅니다(빈 이슈는 막혀 있음).

| 템플릿 | 언제 | 꼭 쓰는 칸 | 자동 라벨 |
| --- | --- | --- | --- |
| Feature | 새 기능 | 요구사항 ID, 문제 / 목적, 완료 조건 | `feature` |
| Bug | 잘못된 동작 | 현상(실제 · 기대), 재현 절차 | `bug` |
| Task / Chore | 설정 · 문서 · 리팩터링 · 테스트 | 목표 | `chore` |

영역 라벨(`area:*`)은 선택으로 직접 붙입니다. 작업을 시작할 때 담당자를 지정합니다. Assignee · Reviewer · CODEOWNERS에는 **사람 팀원 4명의 계정만** 씁니다(Claude Code · AI 계정 금지).

### 브랜치 · PR

- `main` 직접 push 금지. `main`과 남의 브랜치에 force push 금지.
- 브랜치: 최신 `main`에서 `<type>/<이슈번호>-<짧은-설명>` — 예 `feat/12-github-login`, `fix/18-login-error` (type: `feat` `fix` `refactor` `test` `docs` `chore`)
- PR 제목: `<type>(<scope>)?: <설명 50자 이내>` — squash 후 `main` 커밋이 됩니다. scope는 `area:` 뒤 값(예 `feat(sync): 레포 변경분 폴링 추가`).
- PR 본문은 템플릿을 채웁니다: `Closes #N`, 관련 요구사항 ID, **기준 공통 계약 커밋**, 고민한 점, 실제 검증, 영향 범위(API · DB · 보안).
- 머지: GitHub 리뷰 승인 1명 이상 + CI 통과 → PR 화면에서 **squash merge**. 앱의 PR 추천 · 비추천 평가는 머지 조건이 아닙니다.
- 리뷰 요청을 받으면 24시간 안에 첫 의견. 400줄이 넘으면 나누는 것을 권장합니다.

### CODEOWNERS

[`.github/CODEOWNERS`](.github/CODEOWNERS)는 **지금 전부 주석(비활성)**입니다. 역할(A 총괄 · 기획 · 백엔드 일부 · B 백엔드 전담 · C 프론트 3D · D 프론트 HUD · 데이터)별 GitHub 아이디가 확인되면:

1. 파일의 `# ` 를 지우고 `<A>` 등을 실제 `@아이디`로 바꿉니다(모두 저장소 쓰기 권한이 있어야 유효).
2. push 뒤 GitHub에서 CODEOWNERS 파일을 열어 오류 표시가 없는지 확인합니다.
3. 원하면 `main` 보호 규칙에서 "Require review from Code Owners"를 켭니다.

### GitHub 라벨 등록

[`.github/labels.yml`](.github/labels.yml)은 정의 파일일 뿐 **GitHub에 자동 반영되지 않습니다.** 한 번 등록합니다 — 저장소 Labels 화면에서 같은 이름 · 색으로 만들거나, [GitHub CLI](https://cli.github.com/)(`gh auth login` 뒤)로:

```powershell
$r = "SamdoRyu/GRAVIT"
gh label create feature           --repo $r --color 1d76db --description "Feature 템플릿. 브랜치·커밋 type: feat" --force
gh label create bug               --repo $r --color d73a4a --description "Bug 템플릿. 브랜치·커밋 type: fix" --force
gh label create chore             --repo $r --color cfd3d7 --description "Task 템플릿. 브랜치·커밋 type: chore, refactor, test, docs 중 맞는 것" --force
gh label create "area:auth"       --repo $r --color c5def5 --description "계정·권한 (FR-AUTH)" --force
gh label create "area:sync"       --repo $r --color c5def5 --description "GitHub 연동 (FR-GH)" --force
gh label create "area:req"        --repo $r --color c5def5 --description "요구사항 추적 (FR-REQ)" --force
gh label create "area:office"     --repo $r --color c5def5 --description "3D 사무실 (FR-OFF)" --force
gh label create "area:flow"       --repo $r --color c5def5 --description "진행·막힘 (FR-FLOW)" --force
gh label create "area:vote"       --repo $r --color c5def5 --description "PR 평가와 회의실 학습 (FR-LRN)" --force
gh label create "area:instructor" --repo $r --color c5def5 --description "강사 대응·컨벤션 라이브러리 (FR-LRN-21~23, FR-REP-11, FR-LIB)" --force
gh label create "area:meeting"    --repo $r --color c5def5 --description "회의·스탠드업 (FR-MTG)" --force
gh label create "area:plan"       --repo $r --color c5def5 --description "일정판 (FR-PLAN)" --force
gh label create "area:report"     --repo $r --color c5def5 --description "회고 리포트 (FR-REP)" --force
```

Git 전략에 따라 GitHub 기본 라벨은 `bug`만 남기고 지웁니다(`enhancement`, `documentation` 등 — 종류 라벨과 헷갈림). `labels.yml`을 바꾸면 GitHub 라벨도 같이 고칩니다.

### main 보호 설정 (저장소 관리자가 한 번)

Settings에서: `main` 보호 — PR 필수 · 필수 승인 1명 · force push · 삭제 금지 · 필수 status check에 CI의 `frontend (lint · contract · build)` · `backend (test · bootJar)`(CI가 한 번 돈 뒤 목록에 나타남), 머지 방식 squash만, 머지 후 브랜치 자동 삭제.

## CI (GitHub Actions)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) — PR과 `main` push마다 실행합니다. secret을 쓰지 않습니다.

| Job | 하는 일 |
| --- | --- |
| `frontend (lint · contract · build)` | Node(`.nvmrc` = 24) · npm 캐시 → `npm ci` → `npm run lint` → `npm run test:contract` → `npm run build`(타입 검사 · 빌드 · `check-bundle`) |
| `backend (test · bootJar)` | Temurin 21 · Gradle 캐시 · **MySQL 8.4.13 서비스 컨테이너**(CI 전용 DB `gravit_test` · 일회용 계정) → `./gradlew test bootJar` · 실패하면 테스트 리포트를 artifact로 올림 |

- CI의 DB 접속 값은 워크플로 안의 일회용 값이고 개발 `.env` · 운영 DB와 무관합니다.
- **Playwright E2E는 CI에서 돌지 않습니다**(Chrome 설치 · 실행 비용). 화면 · 3D를 바꾼 PR은 로컬에서 `npm run test:e2e`를 돌려 결과를 PR에 적습니다. 참고: `07-weekly-plan`은 원본 데모에서도 가끔 실패하는 flaky 테스트입니다(원인 미조사).

## Claude Code

- 세션은 [`CLAUDE.md`](CLAUDE.md)를 먼저 읽습니다(스택 · 계약 위치 · 절대 원칙 · 작업 경계).
- 규칙: [`.claude/rules/`](.claude/rules/) — `git-workflow` · `code-quality` · `security` · `testing` · `scope-control`.
- 스킬: [`.claude/skills/`](.claude/skills/) — `implement-feature` · `fix-bug` · `review-pr` · `prepare-pr`(직접 `/prepare-pr`로만 실행).
- [`.claude/settings.json`](.claude/settings.json)이 `.env` · `secrets/` · `*.pem` 읽기를 막고, commit · push · PR 생성 · merge 전에 확인을 묻습니다. 개인 설정은 `.claude/settings.local.json`(커밋 안 됨).
- 공통 규칙: 사용자 요청 없이 commit · push · merge하지 않는다, 계약 문서를 스스로 고치지 않는다, 한 세션은 한 이슈 · 한 브랜치만 다룬다.
- **Claude Code는 팀원이 아니다.** Claude Code · AI 계정을 Collaborator · Assignee · Reviewer · CODEOWNERS · 커밋 Author/Committer · `Co-authored-by`로 올리지 않고, Git 작성자 설정을 바꾸지 않는다. 리뷰 · 승인 · 머지는 사람 팀원이 한다(`.claude/rules/git-workflow.md`).

## 디자인 테마

**우주정거장으로 확정했습니다**(2026-11-04, #76 · #77). v1 테마는 이것 하나입니다.

- 확정 시안은 `frontend/public/station/`의 정적 데모(three r150 · GLB 아바타)입니다. `npm run dev` 뒤 `http://localhost:5173/station/index.html`에서 4개 화면(`#/` · `#/blocked` · `#/meeting` · `#/pr/21`)을 볼 수 있습니다. 시안은 디자인 참조용이라 원본 파일은 고치지 않습니다.
- 실제 서비스 화면은 이 시안을 기준으로 기존 React · R3F 구조에 다시 구현합니다(C: SceneModel · ThemeLayout · R3F, D: HUD · DataSource). 구조는 `도메인 데이터 → SceneModel → ThemeLayout → R3F 렌더링` 그대로입니다. 정거장 좌표 · 드롭 구역은 `frontend/src/theme/station/`에 있습니다.
- 보이는 모양은 시안을, 데이터 · 상태값 · API · 권한은 공통 계약을 따릅니다. 시안의 `data.js` 목업과 클린/스멜 표시, 앱이 찾은 이슈 안건 후보는 계약이 아닙니다.
- 작업 포드는 최대 8개입니다 — 기본 4개는 늘 보이고, 확장 4개는 그 자리를 쓰는 팀원이 있을 때만 보입니다(`docs/CONTRACTS.md` 「10」).

## 현재 상태

2026-11-06 기준. 실제 GitHub 레포(`SamdoRyu/gravit-rehearsal-1`)로 로그인 → 사무실 열기 → 동기화 → 화면까지 리허설을 마쳤습니다.

### 된 것

- 모노레포 구조(`frontend/` · `backend/` · `contract/examples/` · `compose.yaml` · `.env.example`), Vite `/api` 프록시 → Spring `:8080`
- 백엔드 공통 기반(#74): Spring Security 기본 거부 · 서버 세션 · CSRF(`XSRF-TOKEN` → `X-XSRF-TOKEN`) · 401 JSON · 쓰기 Origin 검사, 공통 에러 응답 · 전역 예외 처리, 내부 ID 문자열 ↔ `Long` 변환, 인가 서비스(로그인 → 사무실 접근 → 역할)
- 스키마: Flyway `V1` ~ `V4`(기본 · 기능 · 도움 요청 테이블, 작업 포드 8개), 패키지별 Entity · Repository
- 백엔드 v1 API(`docs/CONTRACTS_API.md`):
  - 로그인: GitHub 로그인(GitHub App OAuth), 보안 심사용 ID/PW 로그인(기본 꺼짐)
  - 사무실: 레포 고르기 · 사무실 열기, Snapshot, SSE 알림, 팀 설정
  - GitHub 동기화: 읽기 전용, 5분 폴링 + 수동 동기화. 자동 폴링은 명세 문서를 읽지 않는다
  - 기능: PR 익명 평가, 회의 · 안건 · 스탠드업, 도움 요청, 작업 마감, 요구사항 연결, 회고 리포트 · 학습 타임라인 · 기술 결정 카드, 활동 기록 · 수집 동의
  - 강사: 지정, 요청함, 컨벤션 라이브러리
- 프론트(`frontend/`):
  - 진입 화면: 로그인 · 사무실 고르기 · 사무실 열기
  - 우주정거장 3D(R3F · SceneModel · ThemeLayout), 상단 바 · 관리 패널 · 대화상자 HUD
  - v1 DataSource 두 구현: 브라우저 mock이 기본, `?source=api`는 Spring
- 계약 예시 JSON(`contract/examples/`)과 계약 테스트 ① · ②(Java) · ③ · ④(TS), Playwright E2E(로컬)
- 공통 계약 문서(`docs/` — 기준 위치 `docs/README.md`), 이슈 · PR 템플릿, CI(프론트 · 백엔드), 라벨 · CODEOWNERS · `main` 보호 규칙(승인 1명 · CI 2개 필수), Claude Code 규칙 · `CLAUDE.md`
- 확정 디자인 시안(#77): `frontend/public/station/`

### 아직 없는 것

- 사무실 3D 활동 메모지(#173 — C): 확인된 활동이 Snapshot `activityNotes`로 오지만 3D에는 아직 안 보인다. 동료 피드백(FR-ACT-04)은 v1 보류
- 기본 데이터 소스 전환: 지금은 주소에 `?source=api`가 있어야 서버를 쓴다
- 배포 설정, CI의 E2E
