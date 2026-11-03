---
name: implement-feature
description: GitHub Issue 단위의 새 기능을 기존 구조와 공통 계약을 지키며 최소 범위로 구현할 때 사용한다.
---

# Implement Feature

1. 현재 branch와 working tree를 확인한다. 미커밋 변경을 덮어쓰지 않는다.
2. Issue의 목적, 요구사항 ID, 완료 조건(acceptance criteria)을 정리한다.
3. 기준 계약 커밋을 확인하고 `docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`에서 관련 엔드포인트 · DTO · 역할 · 실패 코드를 읽는다. **계약에 없는 필드 · 경로 · enum이 필요하면 구현을 멈추고 사용자에게 계약 변경을 요청한다.**
4. 관련 코드를 탐색해 기존 구현 패턴과 데이터 흐름을 파악한다(백엔드: Controller → Service → Repository, 프론트: DataSource → store → 화면).
5. 변경 파일과 접근 방식을 짧게 계획한다.
6. scope 밖 변경 없이 최소 구현한다(`.claude/rules/scope-control.md`).
7. 권한 검사(로그인 · 사무실 접근 · 역할)와 실패 경로를 계약대로 구현한다. 화면은 loading / empty / error / success 상태를 필요한 만큼 처리한다.
8. 기존 테스트 패턴을 따라 검증을 추가한다. API 응답 모양이 계약에 닿으면 `contract/examples/`와 같은지 확인한다.
9. 루트 `README.md` 「빌드 · 테스트 명령」 중 가능한 검증을 수행한다(백엔드 테스트는 MySQL 필요).
10. diff를 다시 읽고 unrelated change, debug artifact, secret을 제거한다.
11. 결과를 다음 형식으로 보고한다. commit · push는 사용자가 요청할 때만 한다.

- 구현:
- 변경 파일:
- 기준 계약 커밋:
- 검증 (실제로 돌린 명령과 결과):
- 미검증/위험:
- 후속 Issue 후보:
