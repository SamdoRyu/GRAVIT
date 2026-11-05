package com.samdoryu.backend.plan.repository;

import com.samdoryu.backend.plan.domain.TaskDueDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskDueDateRepository extends JpaRepository<TaskDueDate, Long> {

    Optional<TaskDueDate> findByTaskId(Long taskId);

    /** Snapshot {@code tasks[].dueDate} — 사무실의 마감 전부를 한 번에. */
    List<TaskDueDate> findByTaskWorkspaceId(Long workspaceId);
}
