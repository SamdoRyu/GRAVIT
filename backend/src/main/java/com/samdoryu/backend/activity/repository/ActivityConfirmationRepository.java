package com.samdoryu.backend.activity.repository;

import com.samdoryu.backend.activity.domain.ActivityConfirmation;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityConfirmationRepository extends JpaRepository<ActivityConfirmation, Long> {

    /** 확인한 사람들 — 하나라도 있으면 그 활동은 confirmed. */
    List<ActivityConfirmation> findByActivityRecordId(Long activityRecordId);

    boolean existsByActivityRecordIdAndConfirmerId(Long activityRecordId, Long confirmerMemberId);

    /** 활동 여럿의 확인 행을 한 번에 — 빈 목록으로 부르지 않는다. */
    List<ActivityConfirmation> findByActivityRecordIdIn(Collection<Long> activityRecordIds);
}
