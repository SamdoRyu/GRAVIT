package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 동기화된 이슈(Task) · PR(Submission)을 다른 패키지에 읽어 준다 — 항상 사무실 조건으로 찾는다(IDOR 방어).
 * 없거나 다른 사무실 것이면 {@code not_found}.
 */
@Service
public class SyncedItemService {

    private final TaskRepository taskRepository;
    private final SubmissionRepository submissionRepository;

    public SyncedItemService(TaskRepository taskRepository, SubmissionRepository submissionRepository) {
        this.taskRepository = taskRepository;
        this.submissionRepository = submissionRepository;
    }

    @Transactional(readOnly = true)
    public Task requireTask(Long workspaceId, Long taskId) {
        return taskRepository.findByIdAndWorkspaceId(taskId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public Submission requireSubmission(Long workspaceId, Long submissionId) {
        return submissionRepository.findByIdAndWorkspaceId(submissionId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }
}
