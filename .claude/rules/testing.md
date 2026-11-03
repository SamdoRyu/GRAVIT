# Testing

- 버그 수정은 가능하면 재현 테스트를 먼저 추가하거나 최소한 재현 절차를 문서화한다.
- 새 기능은 핵심 성공 경로와 주요 실패 경로를 검증한다.
- test를 통과시키기 위해 제품 코드를 임의로 약화하지 않는다(Security · JPA 설정을 전역으로 끄지 않는다).
- flaky test를 단순 재실행으로 숨기지 않는다. 테스트를 지우거나 CI에서 빼서 통과처럼 보이게 하지 않는다.
- 테스트하지 못한 부분은 최종 보고와 PR에 명시한다. 로컬에서 돌린 것과 GitHub Actions에서 돈 것을 구분해 적는다.
- 실제 명령은 루트 `README.md` 「빌드 · 테스트 명령」을 따른다. CI(`.github/workflows/ci.yml`)가 도는 것: 프론트 `npm ci` · `lint` · `test:contract` · `build`, 백엔드 `./gradlew test bootJar`(MySQL 서비스 컨테이너).
- 백엔드 테스트는 MySQL이 필요하다. 로컬은 `docker compose up -d --wait` 뒤 `backend/`에서 실행한다.
- 테스트에서 실제 GitHub를 부르지 않는다. GitHub 응답 예시 데이터로 대신한다.
- 계약 테스트는 `contract/examples/`의 JSON을 기준으로 한다(CONTRACTS.md 「9」 계약 테스트). 예시 JSON · Java DTO · TS 타입은 한 PR에서 함께 바꾼다.
- 화면 E2E(`npm run test:e2e`, Chrome 필요)는 CI에서 돌지 않는다. 화면 · 3D를 바꿨으면 로컬에서 돌리고 결과를 PR에 적는다.
