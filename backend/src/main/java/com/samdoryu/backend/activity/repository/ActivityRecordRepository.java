package com.samdoryu.backend.activity.repository;

import com.samdoryu.backend.activity.domain.ActivityRecord;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityRecordRepository extends JpaRepository<ActivityRecord, Long> {

    /** 사무실 조건 — 작성 팀원이 그 사무실 것일 때만. */
    Optional<ActivityRecord> findByIdAndAuthorWorkspaceId(Long id, Long workspaceId);

    /** {@code GET W/activities} · Snapshot {@code activityNotes} — 사무실의 활동 전부, createdAt 내림차순(같으면 나중 것 먼저). */
    List<ActivityRecord> findByAuthorWorkspaceIdOrderByCreatedAtDescIdDesc(Long workspaceId);

    /** 회고 리포트 분포 — 한 팀원이 쓴 것. 팀원은 이미 사무실 조건으로 찾은 것이다. */
    List<ActivityRecord> findByAuthorId(Long authorMemberId);
}
