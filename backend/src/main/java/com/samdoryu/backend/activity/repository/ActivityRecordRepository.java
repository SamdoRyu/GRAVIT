package com.samdoryu.backend.activity.repository;

import com.samdoryu.backend.activity.domain.ActivityRecord;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityRecordRepository extends JpaRepository<ActivityRecord, Long> {

    /** 사무실 조건 — 작성 팀원이 그 사무실 것일 때만. */
    Optional<ActivityRecord> findByIdAndAuthorWorkspaceId(Long id, Long workspaceId);
}
