# Scope Control

Claude가 작업하면서 "같이 고치면 좋아 보이는 것"을 발견해도 자동으로 범위를 넓히지 않는다.

현재 Issue와 무관하면:
1. 문제를 짧게 기록한다.
2. 현재 작업에는 포함하지 않는다.
3. 필요하면 별도 Issue 후보로 제안한다.

다음 변경은 명시적 근거 없이 하지 않는다.

- folder 구조 전면 변경
- framework/library 교체
- package manager 변경
- dependency 대량 업데이트
- formatter 전체 적용
- naming convention 일괄 변경
- API contract 변경
- DB migration/schema 변경
- auth 정책 변경
- CI/CD 또는 deployment target 변경

## GRAVIT 범위

- **확정된 요구사항 범위를 줄이거나 늘리지 않는다.** 기준은 기획 저장소의 요구사항 정의서와 이슈 백로그(Must 61개 · 백로그 62건 + IB-69 — `docs/README.md` 고정 링크 표).
- **앱에서 기존 GitHub 이슈 · PR을 직접 바꾸지 않는다**(읽기 전용 — `security.md`).
- 이 서비스는 팀 프로젝트용 LMS지만, 기능 범위는 요구사항 정의서가 정한다. 정의서에 없는 새 LMS 기능을 추가하지 않는다(제외 · 보류된 항목은 기획 저장소 `requirements-changes.md`).
- 단일 Spring Boot 애플리케이션(모듈형 모놀리스)이다. 마이크로서비스 · CQRS · 이벤트 소싱 · 메시지 브로커 같은 구조를 들이지 않는다.
- **계약(API 경로 · DTO 필드 · enum · 에러 코드 · Entity)을 코드에서 먼저 바꾸지 않는다.** 필요하면 사용자(문서 담당자)에게 계약 문서 변경을 요청한다(CONTRACTS.md 「9」).
- **디자인 테마는 우주정거장으로 확정했다**(확정 시안 `frontend/public/station/` — 원본은 고치지 않는다). 시안과 GLB 아바타를 R3F에 반영하는 것은 범위 안이다. 시안 밖의 새 3D 에셋 · 시안과 무관한 재설계 · 다중 테마 엔진을 임의로 만들지 않는다. 시안에 있어도 계약에 없는 도메인 기능(앱이 찾은 이슈 안건 후보 · 별도 머지 준비 상태 등)은 만들지 않고, 시안에 없어도 Must인 기능(요구사항 구역 등)은 줄이지 않는다.
