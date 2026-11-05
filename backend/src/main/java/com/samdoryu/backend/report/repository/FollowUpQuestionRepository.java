package com.samdoryu.backend.report.repository;

import com.samdoryu.backend.report.domain.FollowUpQuestion;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FollowUpQuestionRepository extends JpaRepository<FollowUpQuestion, Long> {

    List<FollowUpQuestion> findByDecisionCardIdOrderByCreatedAtAsc(Long decisionCardId);

    /** 카드 여럿의 꼬리질문을 쓴 강사와 함께 한 번에 — createdAt 오름차순. 빈 목록으로 부르지 않는다. */
    @Query("select q from FollowUpQuestion q join fetch q.instructor"
            + " where q.decisionCard.id in :cardIds order by q.createdAt asc, q.id asc")
    List<FollowUpQuestion> findWithInstructorByDecisionCardIds(@Param("cardIds") Collection<Long> cardIds);
}
