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
│   └── scripts/         check-bundle(빌드 후 검사) · data-smoke
├── backend/             Spring Boot (com.samdoryu.backend)
│   └── src/main/resources/
│       ├── application.yaml
│       └── db/migration/   Flyway 마이그레이션 (V1__xxx.sql 형식, 아직 없음)
├── contract/examples/   API 계약 예시 JSON (CONTRACTS_API.md에서 옮김)
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
- 지금은 보안 설정을 따로 두지 않아 Spring Security 기본값(모든 요청 인증 필요)이 적용됩니다. `/api/**`는 `401`이 정상입니다.

### 4. 프론트엔드 실행

```powershell
cd frontend
npm ci
npm run dev
```

- 브라우저: <http://localhost:5173> — 기본은 **브라우저 mock 데이터**라 백엔드 없이도 3D 화면 · 드래그가 동작합니다.
- 화면 메뉴의 「데이터 초기화」로 mock 데이터를 처음 상태로 되돌릴 수 있습니다.

## 프론트엔드 ↔ 백엔드 연결

```text
브라우저 ──▶ Vite :5173 ──(/api/** 프록시)──▶ Spring Boot :8080 ──▶ MySQL (compose)
```

- 화면은 항상 같은 출처의 상대 경로 `/api/**`를 부릅니다. 개발 중엔 Vite가 Spring으로 넘깁니다(`frontend/vite.config.ts`).
- 프록시는 `Host`를 바꾸지 않습니다(`changeOrigin: false`). 세션 쿠키 · CSRF 쿠키 · 리다이렉트가 화면 출처(`localhost:5173`) 기준으로 만들어지게 하려는 것입니다.
- Spring 포트를 바꿨다면 Vite를 띄우는 셸에서 지정합니다: `$env:API_PORT=8081; npm run dev`
- 데이터 소스 선택은 주소로 합니다: `/` = mock, `/?source=api` = 서버. **지금 `?source=api`는 동작하지 않습니다** — 데모 API(`/api/workspace` 등)는 Spring에 없고, v1 API는 아직 구현 전입니다.

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
| `npx tsx scripts/data-smoke.ts` | mock 데이터 소스 스모크 검사 |

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

- 기획 저장소: <https://github.com/SamdoRyu/docs-for-PJ-review> — 브랜치 `docs/plan-v3-stack-decisions-1101`
- **기준 계약 커밋: `796fc25b459cd4a25af89e085c093f4e2c25f5b0`**
  - [CONTRACTS.md](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/CONTRACTS.md) — 도메인 · ID · 에러 · 보안 · 계약 테스트
  - [CONTRACTS_API.md](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/CONTRACTS_API.md) — 엔드포인트 · DTO
  - [ARCHITECTURE.md](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/ARCHITECTURE.md) · [PROJECT_COMMANDS.md](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/PROJECT_COMMANDS.md) · [코드 컨벤션 (BE)](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/%EC%BD%94%EB%93%9C%20%EC%BB%A8%EB%B2%A4%EC%85%98%20(BE).md)
- `contract/examples/`의 JSON은 CONTRACTS_API.md의 예시를 **글자 그대로** 옮긴 것입니다. 계약을 바꾸려면 기획 문서를 먼저 고치고(CONTRACTS.md 「9」), JSON은 같은 PR에서 함께 바꿉니다.
- PR 본문에 기준 계약 커밋을 적습니다.

## 현재 상태

### 된 것

- 모노레포 구조(`frontend/` · `backend/` · `contract/examples/` · `compose.yaml` · `.env.example`)
- 기존 3D 데모 화면 · 카메라 · 드래그 · HUD · mock DataSource 이전 (Hono 서버 제거)
- Vite `/api` 프록시 → Spring `:8080`
- Spring Boot ↔ MySQL(compose) 연결, Flyway 기본 동작
- 계약 예시 JSON 6개(에러 · `/api/me` · Snapshot · 평가 요청 · 안건 생성 요청 · 타임라인)

### 아직 없는 것

- 보안 설정(세션 · CSRF `XSRF-TOKEN` · 401 JSON · Origin 검사), GitHub 로그인(OAuth2), `GET /api/health` · `/api/me` 등 v1 API 전체
- Entity · Flyway 마이그레이션 · 공통 에러 응답 · ID 문자열 변환
- 계약 테스트 코드(JUnit + Jackson, 프론트 `satisfies` 사본 · 값 비교)
- 프론트 `DataSource(api)`의 Spring v1 API 연결, SceneModel · ThemeLayout 분리
- 디자인 테마 확정(지금 사무실은 임시 기본 테마)
- CI, 배포 설정
