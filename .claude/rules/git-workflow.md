# Git Workflow

기준: [Git 전략](https://github.com/SamdoRyu/docs-for-PJ-review/blob/796fc25b459cd4a25af89e085c093f4e2c25f5b0/docs/plan/Git%20%EC%A0%84%EB%9E%B5.md) (기획 저장소 @796fc25). 이 파일과 충돌하면 Git 전략을 따른다.

## Claude Code가 지킬 것

- **사용자의 명시적 요청 없이 `git commit` · `git push` · PR 생성 · merge · rebase · force push · deploy를 하지 않는다.**
- 사용자의 미커밋 변경을 덮어쓰거나 지우지 않는다(`git reset --hard`, `git clean`, 강제 checkout 금지).
- 현재 브랜치를 임의로 바꾸지 않는다.
- 커밋 메시지와 PR 본문에 Claude · AI 작성자 표기(`Co-Authored-By` 등)를 넣지 않는다.

## 꼭 지킬 것

- `main`에 직접 push하지 않는다. PR로만 합친다.
- `main`과 남의 브랜치에 force push하지 않는다.
- 작업은 이슈에서 시작하고, PR 본문에 `Closes #N`을 적는다. `Refs #N`은 쓰지 않는다.
- PR 제목은 `<type>(<scope>)?: <설명>` 형식이다. squash merge 후 `main`의 커밋이 된다.
- 머지는 GitHub 리뷰 승인 1명 이상과 CI 통과 뒤 GitHub PR 화면에서 사람이 직접 한다. **앱의 PR 추천 · 비추천 평가는 GitHub 머지 승인과 별개다**(머지 조건이 아니라 팀원끼리 보는 평가 척도).

## Branch

- 브랜치는 `main`과 작업 브랜치뿐이다. `develop` · 승격 · hotfix 브랜치는 없다.
- 작업 브랜치는 최신 `main`에서 만들고, PR로 `main`에 squash merge한다.
- 이름은 `<type>/<이슈번호>-<짧은-설명>`. type은 `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. 이슈번호에 `#`을 붙이지 않는다. 예: `feat/12-github-login`, `fix/18-login-error`

```text
^(feat|fix|refactor|test|docs|chore)/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$
```

## Commit · PR 제목

- 브랜치 안의 커밋 메시지는 자유다. 형식은 PR 제목에만 요구한다.
- type: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, `ci`, `chore`. scope는 `.github/labels.yml`의 `area:` 뒤 값과 같게 쓴다(예: `feat(sync): …`).
- 설명은 50자 이내, 한국어 가능, 끝에 마침표 없음.

```text
^(feat|fix|refactor|perf|test|docs|style|build|ci|chore)(\([a-z0-9-]+\))?: .{1,50}$
```

## Issue · PR

- 이슈 템플릿은 Feature, Bug, Task(`.github/ISSUE_TEMPLATE/`). 요구사항 ID는 템플릿의 「요구사항 ID」 칸에 적는다(Feature는 필수).
- PR base는 `main`. 본문은 `.github/PULL_REQUEST_TEMPLATE.md` — `Closes #N`, 관련 요구사항, **기준 공통 계약 커밋**을 적는다.
- 「검증」에는 실제로 돌린 것만 적는다. CI 통과는 lint · 계약 테스트 · 빌드 · Spring 테스트만 뜻한다(E2E · 화면 동작 미포함).
- 권장: 400줄을 넘으면 나눈다.

## 계약 문서와 코드는 흐름이 다르다

- **계약 문서**(`docs/CONTRACTS.md` · `docs/CONTRACTS_API.md`)와 기획 문서의 수정 · GitHub 반영은 **문서 담당자 1명**이 직접 한다. 문서 변경에는 PR · 전원 리뷰가 필수가 아니다(CONTRACTS.md 「9」).
- **개발 코드**(Java DTO · TypeScript 타입 · `contract/examples/` 포함)는 위 이슈 · PR · 승인 1명 · squash 흐름을 따른다.
- Claude Code 세션은 계약 문서를 스스로 고치지 않는다. 필요하면 사용자(문서 담당자)에게 변경을 요청한다.

## 리뷰

- 리뷰 요청을 받으면 24시간 안에 첫 의견을 남긴다.
- GitHub 리뷰에서 변경 요청을 할 때는 이유를 한 줄 남긴다.
- 의견이 갈리면 회의실 안건으로 올린다.
