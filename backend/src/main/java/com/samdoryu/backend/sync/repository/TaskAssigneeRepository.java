package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.TaskAssignee;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskAssigneeRepository extends JpaRepository<TaskAssignee, Long> {

    List<TaskAssignee> findByTaskId(Long taskId);
}
