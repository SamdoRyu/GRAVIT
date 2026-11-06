package com.samdoryu.backend.instructor.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.instructor.dto.InboxItem;
import com.samdoryu.backend.instructor.service.InstructorInboxService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 강사 요청함 — CONTRACTS_API 「16」. 사무실 경로 밖이다. 세션 없음 {@code unauthorized} → {@code MeResponse.isInstructor}가
 * 아님 {@code forbidden_role}. {@code answered}가 {@code true}/{@code false}가 아니면 {@code invalid}.
 */
@RestController
public class InstructorInboxController {

    private final AuthorizationService authorizationService;
    private final InstructorInboxService instructorInboxService;

    public InstructorInboxController(AuthorizationService authorizationService,
            InstructorInboxService instructorInboxService) {
        this.authorizationService = authorizationService;
        this.instructorInboxService = instructorInboxService;
    }

    /** {@code requestedAt} 내림차순. {@code answered}를 빼면 전부. */
    @GetMapping("/api/instructor/inbox")
    public List<InboxItem> inbox(@RequestParam(required = false) Boolean answered) {
        return instructorInboxService.inbox(authorizationService.requireInstructorInboxWorkspaceIds(), answered);
    }
}
