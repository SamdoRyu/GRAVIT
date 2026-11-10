-- #313 — 도움 요청 안건을 거두면 도움 요청은 전환 직전 상태로 돌아가고, 다시 안건으로 올릴 수 있다.

-- 1. 전환 직전 상태(OPEN · DISCUSSING) — on_agenda인 동안만 값이 있다. 거두면 이 값으로 되돌리고 비운다.
ALTER TABLE help_request
    ADD COLUMN status_before_agenda VARCHAR(16) NULL AFTER status,
    ADD CONSTRAINT ck_help_request_status_before_agenda CHECK (status_before_agenda IS NULL
        OR (status = 'ON_AGENDA' AND status_before_agenda IN ('OPEN', 'DISCUSSING')));

-- 이미 on_agenda인 요청은 기록이 없어서 한 번만 채운다: 전환 시각(안건 raised_at) 전에 요청자가 아닌 팀원의 코멘트
-- (강사 답변 제외)가 있었으면 DISCUSSING, 아니면 OPEN — 코멘트 규칙(FR-LRN-16) 그대로. 지금까지는 다시 올릴 수 없었으므로
-- on_agenda 요청을 가리키는 안건은 하나뿐이다.
UPDATE help_request h
    JOIN agenda_item a ON a.source_help_request_id = h.id AND a.status = 'CONFIRMED'
SET h.status_before_agenda = CASE WHEN EXISTS (
        SELECT 1 FROM help_comment c
        WHERE c.help_request_id = h.id AND c.is_instructor_answer = FALSE
          AND c.author_member_id <> h.requester_member_id AND c.created_at < a.raised_at)
    THEN 'DISCUSSING' ELSE 'OPEN' END
WHERE h.status = 'ON_AGENDA';

-- 2. 유일 규칙: 도움 요청당 "거두지 않은" 안건 하나(V1 uk_agenda_item_help_request는 거둔 행까지 막았다). 거둔 행은 지우지 않는다.
-- 외래키 fk_agenda_item_help_request가 쓰던 유일 인덱스를 지우기 전에 보통 인덱스를 먼저 둔다.
ALTER TABLE agenda_item ADD INDEX idx_agenda_item_help_request (source_help_request_id);
ALTER TABLE agenda_item DROP INDEX uk_agenda_item_help_request;

-- 거두지 않은 안건만 값을 갖는 생성 열 — NULL은 유일 제약에 걸리지 않으므로 거둔 행은 몇 개든 남는다.
ALTER TABLE agenda_item
    ADD COLUMN active_help_request_id BIGINT
        GENERATED ALWAYS AS (CASE WHEN status <> 'WITHDRAWN' THEN source_help_request_id END) STORED,
    ADD CONSTRAINT uk_agenda_item_active_help_request UNIQUE (active_help_request_id);
