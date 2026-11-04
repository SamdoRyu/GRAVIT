package com.samdoryu.backend.report.repository;

import com.samdoryu.backend.report.domain.FollowUpQuestion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FollowUpQuestionRepository extends JpaRepository<FollowUpQuestion, Long> {

    List<FollowUpQuestion> findByDecisionCardIdOrderByCreatedAtAsc(Long decisionCardId);
}
