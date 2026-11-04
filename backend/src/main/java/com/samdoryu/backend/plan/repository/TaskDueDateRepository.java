package com.samdoryu.backend.plan.repository;

import com.samdoryu.backend.plan.domain.TaskDueDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskDueDateRepository extends JpaRepository<TaskDueDate, Long> {

    Optional<TaskDueDate> findByTaskId(Long taskId);
}
