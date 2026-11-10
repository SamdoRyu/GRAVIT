-- #315 — 도움 요청 ① 나에게서만 삭제(사용자별 숨김) · ② 모두에게서 영구 삭제(요청자만).
-- 이 파일은 머지된 뒤 고치지 않는다. 바꿀 것은 새 마이그레이션으로.

-- 1. 사용자별 숨김. 원본 · 코멘트는 그대로 두고 (도움 요청, 사용자)마다 한 행만 둔다. 해제하면 행을 지운다.
--    영구 삭제 때는 Service가 도움 요청보다 먼저 이 행들을 지운다(ON DELETE CASCADE를 걸지 않는다).
CREATE TABLE help_request_hidden (
    id              BIGINT      NOT NULL AUTO_INCREMENT,
    help_request_id BIGINT      NOT NULL,
    user_id         BIGINT      NOT NULL,
    hidden_at       DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_help_request_hidden UNIQUE (help_request_id, user_id),
    CONSTRAINT fk_help_request_hidden_help_request FOREIGN KEY (help_request_id) REFERENCES help_request (id),
    CONSTRAINT fk_help_request_hidden_user FOREIGN KEY (user_id) REFERENCES app_user (id),
    INDEX ix_help_request_hidden_user (user_id)
);

-- 2. 원본 도움 요청을 영구 삭제하면 그 요청의 안건은 남기고 원본 연결만 끊는다 — HELP_REQUEST 안건은 원본이 없어도 된다.
--    V6의 생성 열 active_help_request_id는 원본이 비면 값도 비므로 그대로 둔다.
ALTER TABLE agenda_item DROP CHECK ck_agenda_item_source;
ALTER TABLE agenda_item
    ADD CONSTRAINT ck_agenda_item_source CHECK (
        (kind = 'ISSUE' AND source_task_id IS NOT NULL AND source_submission_id IS NULL
            AND source_help_request_id IS NULL)
        OR (kind = 'PR' AND source_submission_id IS NOT NULL AND source_task_id IS NULL
            AND source_help_request_id IS NULL)
        OR (kind = 'HELP_REQUEST' AND source_task_id IS NULL AND source_submission_id IS NULL)
        OR (kind IN ('LEARNING', 'OTHER') AND source_task_id IS NULL AND source_submission_id IS NULL
            AND source_help_request_id IS NULL));
