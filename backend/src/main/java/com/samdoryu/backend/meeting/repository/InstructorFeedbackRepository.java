package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorFeedbackRepository extends JpaRepository<InstructorFeedback, Long> {

    List<InstructorFeedback> findByAgendaItemIdOrderByCreatedAtAsc(Long agendaItemId);

    /** Snapshot {@code agendaItems}의 강사 피드백 — 사무실의 것 전부, createdAt 오름차순. */
    List<InstructorFeedback> findByAgendaItemWorkspaceIdOrderByCreatedAtAscIdAsc(Long workspaceId);

    /** 안건 여럿의 강사 피드백 — 강사 요청함의 답변 시각. 빈 목록으로 부르지 않는다. */
    List<InstructorFeedback> findByAgendaItemIdIn(Collection<Long> agendaItemIds);
}
