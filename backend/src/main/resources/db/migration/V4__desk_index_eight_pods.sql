-- #71 — 책상 자리는 0~7, 최대 8자리(CONTRACTS.md 「2」 Member, 계약 2fbb17b · 2026-11-04 결정 — 우주정거장 작업 포드 8개).
-- 8자리가 다 차 있으면 새 팀원은 자리 없이(NULL) 들어온다. V1의 0~9 CHECK를 바꾼다(머지된 V1은 고치지 않는다).
-- 8 · 9번 자리를 쓰던 팀원이 있으면 그 자리를 비운다 — 팀원 권한은 그대로이고 3D 포드 · 아바타만 없다.
UPDATE team_member SET desk_index = NULL WHERE desk_index > 7;

ALTER TABLE team_member DROP CHECK ck_team_member_desk_index;
ALTER TABLE team_member ADD CONSTRAINT ck_team_member_desk_index CHECK (desk_index BETWEEN 0 AND 7);
