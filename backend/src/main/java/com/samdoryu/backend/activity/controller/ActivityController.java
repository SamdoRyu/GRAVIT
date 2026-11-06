package com.samdoryu.backend.activity.controller;

import com.samdoryu.backend.activity.domain.ActivityStatus;
import com.samdoryu.backend.activity.dto.ActivityConsentRequest;
import com.samdoryu.backend.activity.dto.ActivityConsentResponse;
import com.samdoryu.backend.activity.dto.ActivityCreateRequest;
import com.samdoryu.backend.activity.dto.ActivityRecordDto;
import com.samdoryu.backend.activity.service.ActivityService;
import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.dto.PageResponse;
import com.samdoryu.backend.common.id.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 활동 기록 · 수집 동의 — CONTRACTS_API 「14」(FR-ACT-01~03). 동료 피드백(FR-ACT-04 · Could)은 v1 보류라 경로가 없다.
 * 강사 쓰기는 {@code InstructorWriteGuard}가 Controller 앞에서도 막는다.
 */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class ActivityController {

    private final AuthorizationService authorizationService;
    private final ActivityService activityService;

    public ActivityController(AuthorizationService authorizationService, ActivityService activityService) {
        this.authorizationService = authorizationService;
        this.activityService = activityService;
    }

    /** 팀원 본인 동의 · 철회. 강사 {@code forbidden_role}. */
    @PutMapping("/activity-consent")
    public ActivityConsentResponse setConsent(@PathVariable String workspaceId,
            @Valid @RequestBody ActivityConsentRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return new ActivityConsentResponse(activityService.setConsent(access, request.consented()));
    }

    /** 접근 — 팀원 · 지정된 강사. {@code status}는 {@code pending} · {@code confirmed}, 그 밖과 페이지 범위 밖은 {@code invalid}. */
    @GetMapping("/activities")
    public PageResponse<ActivityRecordDto> list(@PathVariable String workspaceId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "" + PageResponse.DEFAULT_SIZE) @Min(1) @Max(PageResponse.MAX_SIZE) int size) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return activityService.list(access.workspaceId(), status == null ? null : ActivityStatus.fromQuery(status),
                page, size);
    }

    /** 팀원 — 수집 동의한 사람만(안 했으면 {@code conflict}). 강사 {@code forbidden_role}. */
    @PostMapping("/activities")
    @ResponseStatus(HttpStatus.CREATED)
    public ActivityRecordDto create(@PathVariable String workspaceId,
            @Valid @RequestBody ActivityCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return activityService.create(access, request);
    }

    /** 작성자가 아닌 팀원. 작성자 · 강사 {@code forbidden_role}. 이미 확인했으면 그대로. */
    @PostMapping("/activities/{activityId}/confirm")
    public ActivityRecordDto confirm(@PathVariable String workspaceId, @PathVariable String activityId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return activityService.confirm(access, Ids.fromPath(activityId));
    }
}
