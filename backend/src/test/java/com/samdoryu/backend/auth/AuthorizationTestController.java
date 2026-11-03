package com.samdoryu.backend.auth;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * 테스트에만 있는 사무실 경로 — 인가 서비스를 실제 HTTP로 확인한다.
 * 항목 저장소는 가짜(메모리)다: 항목 1은 사무실 1, 항목 2는 사무실 2 것.
 */
@RestController
class AuthorizationTestController {

    private static final Map<Long, Long> ITEM_WORKSPACE = Map.of(1L, 1L, 2L, 2L);

    record AccessResponse(String workspaceId, String role, String memberId) {
        static AccessResponse of(WorkspaceAccess access) {
            return new AccessResponse(Ids.toApi(access.workspaceId()), access.role().value(), Ids.toApi(access.memberId()));
        }
    }

    private final AuthorizationService authorizationService;

    AuthorizationTestController(AuthorizationService authorizationService) {
        this.authorizationService = authorizationService;
    }

    @GetMapping("/api/workspaces/{workspaceId}/test-items/{itemId}")
    AccessResponse item(@PathVariable String workspaceId, @PathVariable String itemId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        // 검사 순서 3 — findByIdAndWorkspaceId 꼴
        Long id = Ids.fromPath(itemId);
        if (!access.workspaceId().equals(ITEM_WORKSPACE.get(id))) {
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
        return AccessResponse.of(access);
    }

    @GetMapping("/api/workspaces/{workspaceId}/test-admin-only")
    AccessResponse adminOnly(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireRepoAdmin();
        return AccessResponse.of(access);
    }

    @GetMapping("/api/workspaces/{workspaceId}/test-team-only")
    AccessResponse teamOnly(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireTeamMember();
        return AccessResponse.of(access);
    }

    @GetMapping("/api/workspaces/{workspaceId}/members/{memberId}/test-personal")
    AccessResponse personal(@PathVariable String workspaceId, @PathVariable String memberId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireSelfOrInstructor(Ids.fromPath(memberId));
        return AccessResponse.of(access);
    }
}
