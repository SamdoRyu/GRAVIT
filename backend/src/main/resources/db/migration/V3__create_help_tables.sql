-- #47 도움 요청 (CONTRACTS.md 「2」 HelpRequest · HelpComment · 「3」 무결성 제약 · 지우지 않는 기록, FR-LRN-15~21).
-- 이 파일은 머지된 뒤 고치지 않는다. 바꿀 것은 새 마이그레이션으로.

-- 도움 요청. 지우지 않는다. 전환된 안건은 agenda_item.source_help_request_id(유일)가 가리킨다 — 여기에 두지 않는다.
-- 안건 후보 여부(48시간)는 저장하지 않고 계산한다.
CREATE TABLE help_request (
    id                      BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id            BIGINT       NOT NULL,
    requester_member_id     BIGINT       NOT NULL,
    content                 TEXT         NOT NULL,
    status                  VARCHAR(16)  NOT NULL,
    from_standup_id         BIGINT       NULL,
    instructor_requested_at DATETIME(6)  NULL,
    helpful_comment_id      BIGINT       NULL,
    learning                VARCHAR(200) NULL,
    created_at              DATETIME(6)  NOT NULL,
    closed_at               DATETIME(6)  NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_help_request_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_help_request_requester FOREIGN KEY (requester_member_id) REFERENCES team_member (id),
    CONSTRAINT fk_help_request_standup FOREIGN KEY (from_standup_id) REFERENCES standup (id),
    CONSTRAINT ck_help_request_closed CHECK (closed_at IS NULL OR closed_at >= created_at),
    INDEX ix_help_request_workspace_created (workspace_id, created_at)
);

-- 도움 요청 코멘트. 지우지 않는다. 작성자는 AppUser(강사 포함), 팀원 칸은 강사 답변이면 없다.
CREATE TABLE help_comment (
    id                   BIGINT      NOT NULL AUTO_INCREMENT,
    help_request_id      BIGINT      NOT NULL,
    author_user_id       BIGINT      NOT NULL,
    author_member_id     BIGINT      NULL,
    is_instructor_answer BOOLEAN     NOT NULL,
    content              TEXT        NOT NULL,
    created_at           DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_help_comment_help_request FOREIGN KEY (help_request_id) REFERENCES help_request (id),
    CONSTRAINT fk_help_comment_author FOREIGN KEY (author_user_id) REFERENCES app_user (id),
    CONSTRAINT fk_help_comment_member FOREIGN KEY (author_member_id) REFERENCES team_member (id),
    CONSTRAINT ck_help_comment_instructor_answer CHECK (is_instructor_answer = (author_member_id IS NULL)),
    INDEX ix_help_comment_request_created (help_request_id, created_at)
);

-- 도움이 된 코멘트는 코멘트 테이블이 생긴 뒤에 건다.
ALTER TABLE help_request
    ADD CONSTRAINT fk_help_request_helpful_comment FOREIGN KEY (helpful_comment_id) REFERENCES help_comment (id);

-- V1에서 외래키 없이 둔 도움 요청 안건의 원본(#7 T4-b 메모 — 도움 요청 ↔ 안건 순환 외래키).
ALTER TABLE agenda_item
    ADD CONSTRAINT fk_agenda_item_help_request FOREIGN KEY (source_help_request_id) REFERENCES help_request (id);
