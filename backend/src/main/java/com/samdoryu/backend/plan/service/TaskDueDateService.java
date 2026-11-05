package com.samdoryu.backend.plan.service;

import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import java.time.LocalDate;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 앱 저장 작업 마감(FR-PLAN-02 · 03 · P14). 지금은 다른 패키지가 쓰는 읽기만 있다 — 마감 바꾸기는 #39에서 더한다. */
@Service
public class TaskDueDateService {

    private final TaskDueDateRepository taskDueDateRepository;

    public TaskDueDateService(TaskDueDateRepository taskDueDateRepository) {
        this.taskDueDateRepository = taskDueDateRepository;
    }

    /** taskId → 마감. 마감이 없는 이슈는 키가 없다. */
    @Transactional(readOnly = true)
    public Map<Long, LocalDate> dueDatesIn(Long workspaceId) {
        return taskDueDateRepository.findByTaskWorkspaceId(workspaceId).stream()
                .collect(Collectors.toMap(dueDate -> dueDate.getTask().getId(), TaskDueDate::getDueDate));
    }
}
