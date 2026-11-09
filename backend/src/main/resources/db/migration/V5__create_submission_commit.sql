-- #261 — PR에 올라간 커밋(CONTRACTS.md 「7」 커밋 시각 — 사용자별 커밋, 스탠드업 "어제 한 일" 미리 채우기 FR-MTG-01).
-- 동기화가 PR을 저장할 때 그 PR의 커밋을 읽어 넣는다. (사무실, SHA) 유일 — 같은 커밋이 PR 여러 개에 있으면 처음 본 PR에 둔다.
-- 행을 지우지 않는다(force-push로 PR에서 빠진 커밋도 그날 한 일로 남는다). 작성자가 팀원이 아니면 author_member_id는 NULL.
CREATE TABLE submission_commit (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id          BIGINT       NOT NULL,
    submission_id         BIGINT       NOT NULL,
    sha                   CHAR(40)     NOT NULL,
    title                 VARCHAR(512) NOT NULL,
    author_github_user_id BIGINT       NULL,
    author_github_login   VARCHAR(39)  NULL,
    author_member_id      BIGINT       NULL,
    authored_at           DATETIME(6)  NOT NULL,
    committed_at          DATETIME(6)  NOT NULL,
    synced_at             DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_submission_commit_workspace_sha UNIQUE (workspace_id, sha),
    CONSTRAINT fk_submission_commit_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_submission_commit_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_submission_commit_author_member FOREIGN KEY (author_member_id) REFERENCES team_member (id),
    INDEX ix_submission_commit_author_authored (workspace_id, author_member_id, authored_at)
);
