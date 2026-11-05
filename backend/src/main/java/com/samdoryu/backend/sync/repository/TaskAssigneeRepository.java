package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.TaskAssignee;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskAssigneeRepository extends JpaRepository<TaskAssignee, Long> {

    List<TaskAssignee> findByTaskId(Long taskId);

    /** Snapshot — 사무실의 담당자 전부를 한 번에(이슈마다 묻지 않는다). */
    List<TaskAssignee> findByTaskWorkspaceId(Long workspaceId);
}
