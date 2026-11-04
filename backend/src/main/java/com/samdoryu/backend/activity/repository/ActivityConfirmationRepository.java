package com.samdoryu.backend.activity.repository;

import com.samdoryu.backend.activity.domain.ActivityConfirmation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityConfirmationRepository extends JpaRepository<ActivityConfirmation, Long> {

    /** 확인한 사람들 — 하나라도 있으면 그 활동은 confirmed. */
    List<ActivityConfirmation> findByActivityRecordId(Long activityRecordId);

    boolean existsByActivityRecordIdAndConfirmerId(Long activityRecordId, Long confirmerMemberId);
}
