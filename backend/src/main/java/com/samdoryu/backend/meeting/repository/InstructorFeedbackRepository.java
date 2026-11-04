package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorFeedbackRepository extends JpaRepository<InstructorFeedback, Long> {

    List<InstructorFeedback> findByAgendaItemIdOrderByCreatedAtAsc(Long agendaItemId);

    /** Snapshot {@code agendaItems}의 강사 피드백 — 사무실의 것 전부, createdAt 오름차순. */
    List<InstructorFeedback> findByAgendaItemWorkspaceIdOrderByCreatedAtAscIdAsc(Long workspaceId);
}
