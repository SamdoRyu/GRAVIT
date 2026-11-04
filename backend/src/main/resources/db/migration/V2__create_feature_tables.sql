-- #7 T4-c — 기능 테이블 (CONTRACTS.md 「2」 Entity 표 · 「3」 무결성 제약 · 지우지 않는 기록).
-- 도움 요청(help_*)은 #47(A)이 자기 마이그레이션에서 만든다 — agenda_item.source_help_request_id 외래키도 그쪽이 건다.
-- 시연 사무실 접근 대상은 이름 · 등록 방식이 「구현 때」라 #63에서 만든다.
-- 이 파일은 머지된 뒤 고치지 않는다. 바꿀 것은 새 마이그레이션으로.

-- ===== 요구사항 (#14 · FR-REQ) =====

-- 명세 문서 ## 제목 하나 = 요구사항 하나. 행을 지우지 않는다(사라지면 MISSING).
-- (사무실, 원본 ID) 유일 — 원본 ID가 없는 행끼리는 NULL이라 겹쳐도 된다.
-- heading: 문서의 ## 제목 원문, title: 원본 ID를 뺀 정규화 제목(매칭 · 응답에 쓴다).
CREATE TABLE requirement (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT       NOT NULL,
    source_key   VARCHAR(64)  NULL,
    heading      VARCHAR(512) NOT NULL,
    title        VARCHAR(512) NOT NULL,
    position     INT          NOT NULL,
    status       VARCHAR(16)  NOT NULL,
    last_seen_at DATETIME(6)  NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_requirement_source_key UNIQUE (workspace_id, source_key),
    CONSTRAINT fk_requirement_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT ck_requirement_position CHECK (position >= 0),
    INDEX ix_requirement_workspace_title (workspace_id, title)
);

-- 요구사항 ↔ 이슈 연결. 동기화 · 재동기화가 지우지 않는다 — 지우는 것은 레포 관리자의 DELETE뿐.
CREATE TABLE requirement_link (
    id                BIGINT      NOT NULL AUTO_INCREMENT,
    requirement_id    BIGINT      NOT NULL,
    task_id           BIGINT      NOT NULL,
    linked_by_user_id BIGINT      NOT NULL,
    linked_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_requirement_link UNIQUE (requirement_id, task_id),
    CONSTRAINT fk_requirement_link_requirement FOREIGN KEY (requirement_id) REFERENCES requirement (id),
    CONSTRAINT fk_requirement_link_task FOREIGN KEY (task_id) REFERENCES task (id),
    CONSTRAINT fk_requirement_link_user FOREIGN KEY (linked_by_user_id) REFERENCES app_user (id)
);

-- ===== PR 평가 (#19 · FR-LRN-01 · 02 · 06 · P7) =====

-- 평가 회차. 회차 ID와 head_sha는 별개 — 같은 head_sha에 회차가 여러 개일 수 있다. 지우지 않는다.
CREATE TABLE evaluation_round (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    submission_id BIGINT      NOT NULL,
    round_number  INT         NOT NULL,
    head_sha      CHAR(40)    NOT NULL,
    opened_reason VARCHAR(32) NOT NULL,
    opened_at     DATETIME(6) NOT NULL,
    closed_at     DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_evaluation_round_number UNIQUE (submission_id, round_number),
    CONSTRAINT fk_evaluation_round_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT ck_evaluation_round_number CHECK (round_number >= 1),
    CONSTRAINT ck_evaluation_round_period CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

-- 익명 평가. 평가자는 1인 1회 · 작성자 제외 검사에만 쓰고 어느 응답에도 담지 않는다. 지우지 않는다.
CREATE TABLE evaluation (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    round_id          BIGINT       NOT NULL,
    evaluator_user_id BIGINT       NOT NULL,
    verdict           VARCHAR(16)  NOT NULL,
    reason            VARCHAR(200) NOT NULL,
    updated_at        DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_evaluation_round_evaluator UNIQUE (round_id, evaluator_user_id),
    CONSTRAINT fk_evaluation_round FOREIGN KEY (round_id) REFERENCES evaluation_round (id),
    CONSTRAINT fk_evaluation_evaluator FOREIGN KEY (evaluator_user_id) REFERENCES app_user (id),
    CONSTRAINT ck_evaluation_reason CHECK (CHAR_LENGTH(TRIM(reason)) >= 1)
);

-- V1에서 외래키 없이 둔 PR 안건의 평가 회차(#7 T4-b 메모).
ALTER TABLE agenda_item
    ADD CONSTRAINT fk_agenda_item_evaluation_round FOREIGN KEY (evaluation_round_id) REFERENCES evaluation_round (id);

-- ===== 회의 결정의 강사 피드백 (FR-LRN-22) =====

-- 지우지 않는다. 안건 · 결정 상태를 바꾸지 않는다.
CREATE TABLE instructor_feedback (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    agenda_item_id     BIGINT      NOT NULL,
    instructor_user_id BIGINT      NOT NULL,
    body               TEXT        NOT NULL,
    created_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_instructor_feedback_agenda_item FOREIGN KEY (agenda_item_id) REFERENCES agenda_item (id),
    CONSTRAINT fk_instructor_feedback_instructor FOREIGN KEY (instructor_user_id) REFERENCES app_user (id)
);

-- ===== 작업 마감 (#39 · FR-PLAN-02 · 03 · P14) =====

-- 이슈 하나에 마감 하나. GitHub 이슈는 바뀌지 않고 동기화도 덮지 않는다. 마감 지우기는 행 삭제다.
CREATE TABLE task_due_date (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    task_id            BIGINT      NOT NULL,
    due_date           DATE        NOT NULL,
    updated_by_user_id BIGINT      NOT NULL,
    updated_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_task_due_date_task UNIQUE (task_id),
    CONSTRAINT fk_task_due_date_task FOREIGN KEY (task_id) REFERENCES task (id),
    CONSTRAINT fk_task_due_date_user FOREIGN KEY (updated_by_user_id) REFERENCES app_user (id)
);

-- ===== 개인 기록 — 기술 결정 카드 · 꼬리질문 · 회고 리포트 (FR-REP · P11) =====

-- 기술 결정 카드. (팀원, PR) 유일. 9칸은 각 0~2000자, 재료가 없으면 NULL.
CREATE TABLE decision_card (
    id                     BIGINT      NOT NULL AUTO_INCREMENT,
    member_id              BIGINT      NOT NULL,
    submission_id          BIGINT      NOT NULL,
    goal                   TEXT        NULL,
    initial_approach       TEXT        NULL,
    feedback_received      TEXT        NULL,
    meeting_decision       TEXT        NULL,
    final_change           TEXT        NULL,
    rationale              TEXT        NULL,
    blocked_moment         TEXT        NULL,
    learning               TEXT        NULL,
    source                 TEXT        NULL,
    confirmed_at           DATETIME(6) NULL,
    follow_up_requested_at DATETIME(6) NULL,
    created_at             DATETIME(6) NOT NULL,
    updated_at             DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_decision_card_member_submission UNIQUE (member_id, submission_id),
    CONSTRAINT fk_decision_card_member FOREIGN KEY (member_id) REFERENCES team_member (id),
    CONSTRAINT fk_decision_card_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT ck_decision_card_confirmed_learning CHECK (confirmed_at IS NULL OR learning IS NOT NULL)
);

-- 강사 꼬리질문 — 9칸과 따로 붙는다. 지우지 않는다.
CREATE TABLE follow_up_question (
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    decision_card_id   BIGINT      NOT NULL,
    instructor_user_id BIGINT      NOT NULL,
    body               TEXT        NOT NULL,
    created_at         DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_follow_up_question_card FOREIGN KEY (decision_card_id) REFERENCES decision_card (id),
    CONSTRAINT fk_follow_up_question_instructor FOREIGN KEY (instructor_user_id) REFERENCES app_user (id)
);

-- 회고 리포트. 배운 점만 저장하고 나머지 칸은 읽을 때 계산한다.
CREATE TABLE retro_report (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    member_id  BIGINT      NOT NULL,
    kind       VARCHAR(16) NOT NULL,
    learning   TEXT        NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_retro_report_member FOREIGN KEY (member_id) REFERENCES team_member (id)
);

-- ===== 활동 기록 · 동료 피드백 (FR-ACT — Should · Could) =====

-- 활동 기록. 상태(pending · confirmed)는 확인 행이 있는지로 계산한다 — 저장하지 않는다.
CREATE TABLE activity_record (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    author_member_id BIGINT       NOT NULL,
    kind             VARCHAR(32)  NOT NULL,
    content          VARCHAR(500) NOT NULL,
    duration_minutes INT          NOT NULL,
    created_at       DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_activity_record_author FOREIGN KEY (author_member_id) REFERENCES team_member (id),
    CONSTRAINT ck_activity_record_duration CHECK (duration_minutes BETWEEN 1 AND 1440)
);

-- 활동 확인 — 확인자마다 한 행. (활동, 확인자) 유일. 작성자 본인 확인 금지는 Service가 막는다.
CREATE TABLE activity_confirmation (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    activity_record_id  BIGINT      NOT NULL,
    confirmer_member_id BIGINT      NOT NULL,
    confirmed_at        DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_activity_confirmation UNIQUE (activity_record_id, confirmer_member_id),
    CONSTRAINT fk_activity_confirmation_record FOREIGN KEY (activity_record_id) REFERENCES activity_record (id),
    CONSTRAINT fk_activity_confirmation_member FOREIGN KEY (confirmer_member_id) REFERENCES team_member (id)
);

-- 동료 피드백. 작성자는 저장하지만 어느 응답에도 담지 않는다(익명).
-- (사무실, 작성자, 받는 사람, 주) 유일. 주는 한국 시간 ISO 주(예: 2026-W45).
CREATE TABLE peer_feedback (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id        BIGINT       NOT NULL,
    author_member_id    BIGINT       NOT NULL,
    recipient_member_id BIGINT       NOT NULL,
    week                CHAR(8)      NOT NULL,
    thanks              VARCHAR(200) NOT NULL,
    improve             VARCHAR(200) NOT NULL,
    created_at          DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_peer_feedback UNIQUE (workspace_id, author_member_id, recipient_member_id, week),
    CONSTRAINT fk_peer_feedback_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_peer_feedback_author FOREIGN KEY (author_member_id) REFERENCES team_member (id),
    CONSTRAINT fk_peer_feedback_recipient FOREIGN KEY (recipient_member_id) REFERENCES team_member (id),
    CONSTRAINT ck_peer_feedback_not_self CHECK (author_member_id <> recipient_member_id),
    CONSTRAINT ck_peer_feedback_week CHECK (week LIKE '____-W__')
);

-- ===== 컨벤션 라이브러리 (FR-LIB) =====

-- 서버 전체에 하나(사무실 단위 아님). 지우기 API는 없다. 본문은 1~20000자라 MEDIUMTEXT.
CREATE TABLE convention_library_item (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    target         VARCHAR(32)  NOT NULL,
    name           VARCHAR(100) NOT NULL,
    content        MEDIUMTEXT   NOT NULL,
    description    TEXT         NULL,
    author_user_id BIGINT       NOT NULL,
    updated_at     DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_convention_library_item_author FOREIGN KEY (author_user_id) REFERENCES app_user (id)
);
