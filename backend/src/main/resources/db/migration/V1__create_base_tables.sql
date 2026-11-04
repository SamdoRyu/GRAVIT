-- #7 T4-a · T4-b — 공통 Entity와 기능들이 외래키로 기대는 테이블 (CONTRACTS.md 「2」 Entity 표 · 「3」 무결성 제약).
-- 기본키는 BIGINT AUTO_INCREMENT, 시각은 UTC DATETIME(6), 열거 값은 자바 열거형 이름(UPPER_SNAKE) 그대로 저장한다.
-- 이 파일은 머지된 뒤 고치지 않는다. 바꿀 것은 새 마이그레이션으로.

-- 서버 단위 사용자. 이메일 칸은 두지 않는다(NFR-04).
-- 동기화가 아직 로그인하지 않은 콜라보레이터의 행도 만든다(「10」 구현 기본값).
CREATE TABLE app_user (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    account_type   VARCHAR(16)  NOT NULL,
    github_user_id BIGINT       NULL,
    github_login   VARCHAR(39)  NULL,
    display_name   VARCHAR(255) NOT NULL,
    avatar_url     VARCHAR(512) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_app_user_github_user_id UNIQUE (github_user_id),
    CONSTRAINT ck_app_user_account_type CHECK (
        (account_type = 'GITHUB' AND github_user_id IS NOT NULL)
        OR (account_type = 'REVIEW' AND github_user_id IS NULL AND github_login IS NULL))
);

-- 심사용 계정(P15). 비밀번호는 PasswordEncoder 해시만 저장한다.
CREATE TABLE review_account (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    enabled       BOOLEAN      NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_review_account_user UNIQUE (user_id),
    CONSTRAINT uk_review_account_username UNIQUE (username),
    CONSTRAINT fk_review_account_user FOREIGN KEY (user_id) REFERENCES app_user (id)
);

-- 사무실. GITHUB 종류만 레포 칸이 있고, githubRepoId 하나에 사무실 하나(NULL은 MySQL 유일 제약에서 겹쳐도 된다).
-- 시연(DEMO) 사무실은 Seed로 채우므로 연 사람이 없을 수 있다.
CREATE TABLE workspace (
    id                     BIGINT       NOT NULL AUTO_INCREMENT,
    kind                   VARCHAR(16)  NOT NULL,
    github_repo_id         BIGINT       NULL,
    github_owner           VARCHAR(100) NULL,
    github_repo            VARCHAR(100) NULL,
    github_installation_id BIGINT       NULL,
    display_name           VARCHAR(255) NOT NULL,
    opened_by_user_id      BIGINT       NULL,
    opened_at              DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_workspace_github_repo_id UNIQUE (github_repo_id),
    CONSTRAINT fk_workspace_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES app_user (id),
    CONSTRAINT ck_workspace_kind CHECK (
        (kind = 'GITHUB' AND github_repo_id IS NOT NULL AND github_owner IS NOT NULL AND github_repo IS NOT NULL)
        OR (kind = 'DEMO' AND github_repo_id IS NULL AND github_owner IS NULL AND github_repo IS NULL
            AND github_installation_id IS NULL))
);

-- 팀 설정(Workspace 1–1). reviewWaitHours · noCommitHours는 정수 1~720, 기본 48(CONTRACTS_API.md TeamSettings).
CREATE TABLE team_settings (
    id                 BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id       BIGINT       NOT NULL,
    project_start_date DATE         NOT NULL,
    project_end_date   DATE         NOT NULL,
    spec_document_path VARCHAR(300) NULL,
    review_wait_hours  INT          NOT NULL DEFAULT 48,
    no_commit_hours    INT          NOT NULL DEFAULT 48,
    PRIMARY KEY (id),
    CONSTRAINT uk_team_settings_workspace UNIQUE (workspace_id),
    CONSTRAINT fk_team_settings_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT ck_team_settings_dates CHECK (project_end_date >= project_start_date),
    CONSTRAINT ck_team_settings_review_wait CHECK (review_wait_hours BETWEEN 1 AND 720),
    CONSTRAINT ck_team_settings_no_commit CHECK (no_commit_hours BETWEEN 1 AND 720)
);

-- 동기화 상태(Workspace 1–1, FR-GH-05). 실패를 삼키지 않고 마지막 실패 시각 · code · 사유를 남긴다.
-- spec_warnings: 마지막 명세 문서 읽기 경고 — SpecWarning 배열 JSON(CONTRACTS_API.md 「4」). 없으면 NULL.
CREATE TABLE sync_state (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id         BIGINT       NOT NULL,
    running              BOOLEAN      NOT NULL DEFAULT FALSE,
    last_succeeded_at    DATETIME(6)  NULL,
    last_failed_at       DATETIME(6)  NULL,
    last_failure_code    VARCHAR(32)  NULL,
    last_failure_message VARCHAR(500) NULL,
    spec_warnings        JSON         NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_sync_state_workspace UNIQUE (workspace_id),
    CONSTRAINT fk_sync_state_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id)
);

-- 팀원(Entity Member). 테이블 이름은 MEMBER가 MySQL 8 예약어라 team_member다. 행을 지우지 않는다 — 콜라보레이터에서 빠지면 removed_at을 남기고 책상 자리를 비운다.
-- (사무실, 사용자) · (사무실, 책상 자리) 유일 — 빠진 팀원은 desk_index가 NULL이라 겹치지 않는다.
-- 시연 Seed 팀원은 사용자가 없어(user_id NULL) 표시 칸을 팀원 행에 둔다. 표시 칸은 동기화가 맞춘다.
CREATE TABLE team_member (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id          BIGINT       NOT NULL,
    user_id               BIGINT       NULL,
    github_login          VARCHAR(39)  NULL,
    display_name          VARCHAR(255) NOT NULL,
    avatar_url            VARCHAR(512) NULL,
    desk_index            TINYINT      NULL,
    is_repo_admin         BOOLEAN      NOT NULL DEFAULT FALSE,
    activity_consented_at DATETIME(6)  NULL,
    removed_at            DATETIME(6)  NULL,
    synced_at             DATETIME(6)  NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_team_member_workspace_user UNIQUE (workspace_id, user_id),
    CONSTRAINT uk_team_member_workspace_desk UNIQUE (workspace_id, desk_index),
    CONSTRAINT fk_team_member_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_team_member_user FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT ck_team_member_desk_index CHECK (desk_index BETWEEN 0 AND 9),
    CONSTRAINT ck_team_member_removed_has_no_desk CHECK (removed_at IS NULL OR desk_index IS NULL)
);

-- 강사 지정(FR-AUTH-06 · P1). 강사는 AppUser 외래키가 아니라 GitHub 사용자 ID로 가리킨다.
-- 해제해도 행을 지우지 않고 unassigned_at을 남긴다.
-- 현재 지정(해제 시각 없음)은 (사무실, GitHub 사용자 ID)당 하나 — 현재 행에만 1이 들어가는 생성 열에 유일 제약.
CREATE TABLE instructor_assignment (
    id                        BIGINT      NOT NULL AUTO_INCREMENT,
    workspace_id              BIGINT      NOT NULL,
    instructor_github_user_id BIGINT      NOT NULL,
    assigned_by_user_id       BIGINT      NOT NULL,
    assigned_at               DATETIME(6) NOT NULL,
    unassigned_at             DATETIME(6) NULL,
    current_flag              TINYINT AS (CASE WHEN unassigned_at IS NULL THEN 1 ELSE NULL END) STORED,
    PRIMARY KEY (id),
    CONSTRAINT uk_instructor_assignment_current UNIQUE (workspace_id, instructor_github_user_id, current_flag),
    CONSTRAINT fk_instructor_assignment_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_instructor_assignment_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES app_user (id),
    CONSTRAINT ck_instructor_assignment_period CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- ===== T4-b — GitHub 원본의 앱 모델(동기화만 쓴다) · 회의 · 안건 · 스탠드업 =====
-- labels · reviews · review_requests JSON 열의 원소 모양은 동기화 Issue(#69)가 정한다.

-- 이슈의 앱 모델. (사무실, 이슈 번호) 유일. 행을 지우지 않는다. htmlUrl은 사무실 레포 + 번호로 계산한다.
CREATE TABLE task (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id        BIGINT       NOT NULL,
    github_issue_number INT          NOT NULL,
    title               VARCHAR(512) NOT NULL,
    state               VARCHAR(16)  NOT NULL,
    closed_reason       VARCHAR(16)  NULL,
    labels              JSON         NOT NULL,
    github_created_at   DATETIME(6)  NOT NULL,
    github_updated_at   DATETIME(6)  NOT NULL,
    closed_at           DATETIME(6)  NULL,
    state_changed_at    DATETIME(6)  NOT NULL,
    synced_at           DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_task_workspace_number UNIQUE (workspace_id, github_issue_number),
    CONSTRAINT fk_task_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT ck_task_closed_reason CHECK (state = 'CLOSED' OR closed_reason IS NULL)
);

-- 이슈 담당자 — Task와 Member의 다대다. 팀원이 아닌 GitHub 담당자는 넣지 않는다.
CREATE TABLE task_assignee (
    id        BIGINT      NOT NULL AUTO_INCREMENT,
    task_id   BIGINT      NOT NULL,
    member_id BIGINT      NOT NULL,
    synced_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_task_assignee UNIQUE (task_id, member_id),
    CONSTRAINT fk_task_assignee_task FOREIGN KEY (task_id) REFERENCES task (id),
    CONSTRAINT fk_task_assignee_member FOREIGN KEY (member_id) REFERENCES team_member (id)
);

-- PR의 앱 모델. (사무실, PR 번호) 유일. 작성자가 팀원이 아니면 author_member_id는 NULL.
CREATE TABLE submission (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id          BIGINT       NOT NULL,
    github_pr_number      INT          NOT NULL,
    title                 VARCHAR(512) NOT NULL,
    author_github_user_id BIGINT       NULL,
    author_github_login   VARCHAR(39)  NULL,
    author_member_id      BIGINT       NULL,
    state                 VARCHAR(16)  NOT NULL,
    head_sha              CHAR(40)     NOT NULL,
    review_requests       JSON         NOT NULL,
    reviews               JSON         NOT NULL,
    labels                JSON         NOT NULL,
    last_commit_at        DATETIME(6)  NULL,
    github_created_at     DATETIME(6)  NOT NULL,
    github_updated_at     DATETIME(6)  NOT NULL,
    merged_at             DATETIME(6)  NULL,
    closed_at             DATETIME(6)  NULL,
    state_changed_at      DATETIME(6)  NOT NULL,
    synced_at             DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_submission_workspace_number UNIQUE (workspace_id, github_pr_number),
    CONSTRAINT fk_submission_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_submission_author_member FOREIGN KEY (author_member_id) REFERENCES team_member (id),
    CONSTRAINT ck_submission_merged CHECK (state = 'MERGED' OR merged_at IS NULL)
);

-- PR–이슈 연결. GitHub가 공식으로 인식하는 연결만 저장한다(본문 #N 언급으로 만들지 않는다).
-- source: GitHub 연결 종류 — 값은 #71에서 정한다.
CREATE TABLE submission_issue_link (
    id            BIGINT      NOT NULL AUTO_INCREMENT,
    submission_id BIGINT      NOT NULL,
    task_id       BIGINT      NOT NULL,
    source        VARCHAR(32) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_submission_issue_link UNIQUE (submission_id, task_id),
    CONSTRAINT fk_submission_issue_link_submission FOREIGN KEY (submission_id) REFERENCES submission (id),
    CONSTRAINT fk_submission_issue_link_task FOREIGN KEY (task_id) REFERENCES task (id)
);

-- 회의. 상태(진행 중 · 끝)는 ended_at으로 정한다.
-- 사무실마다 진행 중 회의는 하나 — Service가 conflict로 막고, 진행 중 행에만 1이 들어가는 생성 열이 DB에서 한 번 더 막는다.
CREATE TABLE meeting (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT      NOT NULL,
    started_at   DATETIME(6) NOT NULL,
    ended_at     DATETIME(6) NULL,
    notes        TEXT        NULL,
    ongoing_flag TINYINT AS (CASE WHEN ended_at IS NULL THEN 1 ELSE NULL END) STORED,
    PRIMARY KEY (id),
    CONSTRAINT uk_meeting_one_ongoing UNIQUE (workspace_id, ongoing_flag),
    CONSTRAINT fk_meeting_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT ck_meeting_period CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- 회의 참석자(FR-MTG-05 — 비어도 된다).
CREATE TABLE meeting_attendee (
    meeting_id BIGINT NOT NULL,
    member_id  BIGINT NOT NULL,
    PRIMARY KEY (meeting_id, member_id),
    CONSTRAINT fk_meeting_attendee_meeting FOREIGN KEY (meeting_id) REFERENCES meeting (id),
    CONSTRAINT fk_meeting_attendee_member FOREIGN KEY (member_id) REFERENCES team_member (id)
);

-- 회의 안건(결정 기록 포함). 행을 지우지 않는다 — 거두면 WITHDRAWN.
-- 원본은 종류에 맞게 하나만: ISSUE → task, PR → submission, HELP_REQUEST → 도움 요청, LEARNING · OTHER → 없음.
-- evaluation_round_id의 외래키는 evaluation_round를 만드는 #19가, source_help_request_id의 외래키는
-- help_request를 만드는 #47(A)이 건다(#7이 허용한 도움 요청 ↔ 안건 순환 외래키). 전환된 안건은 도움 요청당 하나.
CREATE TABLE agenda_item (
    id                           BIGINT       NOT NULL AUTO_INCREMENT,
    workspace_id                 BIGINT       NOT NULL,
    kind                         VARCHAR(16)  NOT NULL,
    status                       VARCHAR(16)  NOT NULL,
    title                        VARCHAR(100) NOT NULL,
    background                   TEXT         NULL,
    tried                        TEXT         NULL,
    unresolved_reason            TEXT         NULL,
    source_task_id               BIGINT       NULL,
    source_submission_id         BIGINT       NULL,
    source_help_request_id       BIGINT       NULL,
    evaluation_round_id          BIGINT       NULL,
    raised_by_member_id          BIGINT       NOT NULL,
    raised_at                    DATETIME(6)  NOT NULL,
    conclusion                   TEXT         NULL,
    learning                     TEXT         NULL,
    pr_decision                  VARCHAR(32)  NULL,
    follow_up_assignee_member_id BIGINT       NULL,
    follow_up_due_date           DATE         NULL,
    meeting_id                   BIGINT       NULL,
    decided_by_member_id         BIGINT       NULL,
    decided_at                   DATETIME(6)  NULL,
    feedback_requested_at        DATETIME(6)  NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_agenda_item_help_request UNIQUE (source_help_request_id),
    CONSTRAINT fk_agenda_item_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_agenda_item_task FOREIGN KEY (source_task_id) REFERENCES task (id),
    CONSTRAINT fk_agenda_item_submission FOREIGN KEY (source_submission_id) REFERENCES submission (id),
    CONSTRAINT fk_agenda_item_raised_by FOREIGN KEY (raised_by_member_id) REFERENCES team_member (id),
    CONSTRAINT fk_agenda_item_follow_up FOREIGN KEY (follow_up_assignee_member_id) REFERENCES team_member (id),
    CONSTRAINT fk_agenda_item_meeting FOREIGN KEY (meeting_id) REFERENCES meeting (id),
    CONSTRAINT fk_agenda_item_decided_by FOREIGN KEY (decided_by_member_id) REFERENCES team_member (id),
    CONSTRAINT ck_agenda_item_source CHECK (
        (kind = 'ISSUE' AND source_task_id IS NOT NULL AND source_submission_id IS NULL
            AND source_help_request_id IS NULL)
        OR (kind = 'PR' AND source_submission_id IS NOT NULL AND source_task_id IS NULL
            AND source_help_request_id IS NULL)
        OR (kind = 'HELP_REQUEST' AND source_help_request_id IS NOT NULL AND source_task_id IS NULL
            AND source_submission_id IS NULL)
        OR (kind IN ('LEARNING', 'OTHER') AND source_task_id IS NULL AND source_submission_id IS NULL
            AND source_help_request_id IS NULL)),
    CONSTRAINT ck_agenda_item_decision CHECK (
        (status = 'DISCUSSED') = (conclusion IS NOT NULL AND decided_at IS NOT NULL
            AND decided_by_member_id IS NOT NULL)),
    CONSTRAINT ck_agenda_item_pr_decision CHECK (pr_decision IS NULL OR kind = 'PR')
);

-- 스탠드업. (사무실, 팀원, 날짜) 유일 — 날짜는 한국 시간 기준 달력 날짜.
CREATE TABLE standup (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT      NOT NULL,
    member_id    BIGINT      NOT NULL,
    standup_date DATE        NOT NULL,
    yesterday    TEXT        NOT NULL,
    blockers     TEXT        NULL,
    updated_at   DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_standup_member_date UNIQUE (workspace_id, member_id, standup_date),
    CONSTRAINT fk_standup_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id),
    CONSTRAINT fk_standup_member FOREIGN KEY (member_id) REFERENCES team_member (id)
);
