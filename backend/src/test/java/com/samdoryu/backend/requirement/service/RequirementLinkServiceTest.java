package com.samdoryu.backend.requirement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.dto.RequirementLinkCreateRequest;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * #18 연결 규칙과 검사 순서 — ID 형식(400) → 대상(404) → R2(403) → 상태(409)(CONTRACTS_API 「8」 · CONTRACTS.md 「6」).
 * 저장소는 가짜(Mockito) — 실제 MySQL 흐름은 {@code RequirementLinkIntegrationTest}.
 */
class RequirementLinkServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Long WS = 3L;

    private final RequirementRepository requirements = mock(RequirementRepository.class);
    private final RequirementLinkRepository links = mock(RequirementLinkRepository.class);
    private final SyncedItemService syncedItems = mock(SyncedItemService.class);
    private final AppUserService appUsers = mock(AppUserService.class);
    private final RequirementLinkService service = new RequirementLinkService(requirements, links, syncedItems,
            appUsers, mock(WorkspaceEventHub.class));

    private final WorkspaceAccess admin = new WorkspaceAccess(WS, 7L, WorkspaceRole.REPO_ADMIN, 12L);
    private final WorkspaceAccess participant = new WorkspaceAccess(WS, 8L, WorkspaceRole.PARTICIPANT, 13L);
    private final WorkspaceAccess instructor = new WorkspaceAccess(WS, 9L, WorkspaceRole.INSTRUCTOR, null);

    private Requirement requirement;
    private Task task;

    private static <T> T withId(T entity, long id) {
        ReflectionTestUtils.setField(entity, "id", id);
        return entity;
    }

    @BeforeEach
    void setUp() {
        Workspace workspace = Workspace.demo("시연", T0);
        requirement = withId(new Requirement(workspace, "FR-AUTH-01", "FR-AUTH-01 로그인", "로그인", 0, T0), 5L);
        task = withId(Task.builder().workspace(workspace).githubIssueNumber(1).title("로그인 화면").state(TaskState.OPEN)
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build(), 41L);
        given(requirements.findByIdAndWorkspaceId(5L, WS)).willReturn(Optional.of(requirement));
        given(syncedItems.requireTask(WS, 41L)).willReturn(task);
        given(links.findByRequirementIdAndTaskId(5L, 41L)).willReturn(Optional.empty());
        given(appUsers.require(7L)).willReturn(withId(AppUser.github(1001L, "kim", "김", null), 7L));
    }

    private static RequirementLinkCreateRequest request(String requirementId, String taskId) {
        return new RequirementLinkCreateRequest(requirementId, taskId);
    }

    private static void assertError(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    @Test
    void repoAdminLinksAnActiveRequirementToAnIssue() {
        RequirementLinkService.LinkResult result = service.link(admin, request("5", "41"), T0);

        assertThat(result.created()).isTrue();
        assertThat(result.link().requirementId()).isEqualTo("5");
        assertThat(result.link().taskId()).isEqualTo("41");
        assertThat(result.link().linkedAt()).isEqualTo(T0);
        verify(links).saveAndFlush(any(RequirementLink.class));
    }

    @Test
    void sameLinkReturnsTheExistingOneEvenIfTheRequirementIsNoLongerActive() {
        RequirementLink existing = withId(new RequirementLink(requirement, task, appUsers.require(7L), T0), 30L);
        given(links.findByRequirementIdAndTaskId(5L, 41L)).willReturn(Optional.of(existing));
        requirement.markUnmatched(RequirementStatus.MISSING);

        RequirementLinkService.LinkResult result = service.link(admin, request("5", "41"), T0.plusSeconds(60));

        assertThat(result.created()).isFalse();
        assertThat(result.link().id()).isEqualTo("30");
        assertThat(result.link().linkedAt()).isEqualTo(T0);
        verify(links, never()).saveAndFlush(any());
    }

    @Test
    void malformedIdsAreInvalidBeforeAnyLookup() {
        assertError(() -> service.link(admin, request("abc", "41"), T0), ErrorCode.INVALID);
        assertError(() -> service.link(admin, request("5", "0"), T0), ErrorCode.INVALID);
        verifyNoInteractions(requirements, syncedItems, links);
    }

    @Test
    void requirementOrIssueOfAnotherWorkspaceIsNotFound() {
        given(requirements.findByIdAndWorkspaceId(6L, WS)).willReturn(Optional.empty());
        given(syncedItems.requireTask(WS, 42L)).willThrow(new ApiException(ErrorCode.NOT_FOUND));

        assertError(() -> service.link(admin, request("6", "41"), T0), ErrorCode.NOT_FOUND);
        assertError(() -> service.link(admin, request("5", "42"), T0), ErrorCode.NOT_FOUND);
        // 대상 확인(404)이 역할 확인(403)보다 먼저다
        assertError(() -> service.link(participant, request("6", "41"), T0), ErrorCode.NOT_FOUND);
    }

    @Test
    void onlyTheRepoAdminCanLink() {
        assertError(() -> service.link(participant, request("5", "41"), T0), ErrorCode.FORBIDDEN_ROLE);
        assertError(() -> service.link(instructor, request("5", "41"), T0), ErrorCode.FORBIDDEN_ROLE);
        verify(links, never()).saveAndFlush(any());
    }

    @Test
    void missingOrNeedsReviewRequirementsTakeNoNewLinks() {
        for (RequirementStatus status : new RequirementStatus[] {RequirementStatus.MISSING,
                RequirementStatus.NEEDS_REVIEW}) {
            requirement.markUnmatched(status);

            assertError(() -> service.link(admin, request("5", "41"), T0), ErrorCode.CONFLICT);
        }
        verify(links, never()).saveAndFlush(any());
    }

    @Test
    void unlinkChecksTheWorkspaceThenTheRole() {
        RequirementLink link = withId(new RequirementLink(requirement, task, appUsers.require(7L), T0), 30L);
        given(links.findByIdAndRequirementWorkspaceId(30L, WS)).willReturn(Optional.of(link));
        given(links.findByIdAndRequirementWorkspaceId(31L, WS)).willReturn(Optional.empty());

        assertError(() -> service.unlink(admin, 31L), ErrorCode.NOT_FOUND);
        assertError(() -> service.unlink(participant, 30L), ErrorCode.FORBIDDEN_ROLE);
        verify(links, never()).delete(any());

        service.unlink(admin, 30L);
        verify(links).delete(link);
    }
}
