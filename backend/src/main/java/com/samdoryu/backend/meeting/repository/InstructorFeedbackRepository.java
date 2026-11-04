package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorFeedbackRepository extends JpaRepository<InstructorFeedback, Long> {

    List<InstructorFeedback> findByAgendaItemIdOrderByCreatedAtAsc(Long agendaItemId);
}
