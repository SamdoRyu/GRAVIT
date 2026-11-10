-- #335 — 회고 리포트를 만들 때 제목 · 느낀 점 · 넣을 기술 결정 카드를 받는다. 카드의 「확인함」 단계는 없앤다.

-- 1. 리포트 제목. 이미 만든 리포트는 종류 · 만든 날짜(한국 시간)로 채운다 — 예: "최종 회고 리포트 · 2026-11-10".
ALTER TABLE retro_report ADD COLUMN title VARCHAR(100) NULL AFTER kind;
UPDATE retro_report
SET title = CONCAT(CASE kind WHEN 'FINAL' THEN '최종' ELSE '중간' END, ' 회고 리포트 · ',
                   DATE_FORMAT(DATE_ADD(created_at, INTERVAL 9 HOUR), '%Y-%m-%d'));
ALTER TABLE retro_report MODIFY title VARCHAR(100) NOT NULL;

-- 2. 리포트에 고른 기술 결정 카드 — 만든 뒤 바꾸지 않는다. 카드를 지우는 API는 없다.
CREATE TABLE retro_report_decision_card (
    report_id        BIGINT NOT NULL,
    decision_card_id BIGINT NOT NULL,
    PRIMARY KEY (report_id, decision_card_id),
    CONSTRAINT fk_retro_report_card_report FOREIGN KEY (report_id) REFERENCES retro_report (id),
    CONSTRAINT fk_retro_report_card_card FOREIGN KEY (decision_card_id) REFERENCES decision_card (id)
);

-- 이미 만든 리포트는 지금 보이던 내용 그대로 — 그 주인이 확인했던 카드를 고른 카드로 잇는다(그때 리포트는 확인한 카드를 모두 보였다).
INSERT INTO retro_report_decision_card (report_id, decision_card_id)
SELECT r.id, c.id
FROM retro_report r
    JOIN decision_card c ON c.member_id = r.member_id
WHERE c.confirmed_at IS NOT NULL;

-- 3. 카드의 「확인함」 삭제 — 확인 시각을 쓰던 CHECK를 먼저 지운다.
ALTER TABLE decision_card DROP CHECK ck_decision_card_confirmed_learning;
ALTER TABLE decision_card DROP COLUMN confirmed_at;
