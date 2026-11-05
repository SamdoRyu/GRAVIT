package com.samdoryu.backend.requirement.service;

import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.dto.RequirementLinkCreateRequest;
import com.samdoryu.backend.requirement.dto.RequirementLinkDto;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.service.SyncedItemService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 요구사항–이슈 연결(FR-REQ-04 · 07 · CONTRACTS_API 「8」). <b>앱 서버에만 저장한다</b> — GitHub 이슈를 바꾸지 않고 GitHub를
 * 부르지도 않는다. 연결은 이슈의 자리(placeRole)도 바꾸지 않는다(2026-11-01 결정). 동기화 · 재동기화는 연결을 지우지 않는다.
 * <p>
 * 인가 검사 순서 1 · 2는 Controller가 끝낸 뒤 부른다. 여기서는 ID 형식(400) → 대상(404 — 같은 사무실 것만) → 역할 R2(403) →
 * 상태(409) 순서로 본다(CONTRACTS.md 「6」).
 */
@Service
public class RequirementLinkService {

    private final RequirementRepository requirementRepository;
    private final RequirementLinkRepository requirementLinkRepository;
    private final SyncedItemService syncedItemService;
    private final AppUserService appUserService;
    private final WorkspaceEventHub eventHub;

    public RequirementLinkService(RequirementRepository requirementRepository,
            RequirementLinkRepository requirementLinkRepository, SyncedItemService syncedItemService,
            AppUserService appUserService, WorkspaceEventHub eventHub) {
        this.requirementRepository = requirementRepository;
        this.requirementLinkRepository = requirementLinkRepository;
        this.syncedItemService = syncedItemService;
        this.appUserService = appUserService;
        this.eventHub = eventHub;
    }

    /** @param created 새로 만들었으면 true({@code 201}), 같은 연결이 이미 있었으면 false({@code 200}) */
    public record LinkResult(RequirementLinkDto link, boolean created) {
    }

    /**
     * {@code POST W/requirement-links}. 같은 연결이 이미 있으면 기존 연결을 돌려준다 — 이미 있는 연결은 "새 연결"이 아니라
     * 요구사항이 {@code active}가 아니어도 그대로 돌려준다.
     */
    @Transactional
    public LinkResult link(WorkspaceAccess access, RequirementLinkCreateRequest request, Instant now) {
        Long requirementId = Ids.fromBody(request.requirementId());
        Long taskId = Ids.fromBody(request.taskId());
        Requirement requirement = requirementRepository.findByIdAndWorkspaceId(requirementId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        Task task = syncedItemService.requireTask(access.workspaceId(), taskId);
        access.requireRepoAdmin();

        Optional<RequirementLink> existing = requirementLinkRepository.findByRequirementIdAndTaskId(
                requirement.getId(), task.getId());
        if (existing.isPresent()) {
            return new LinkResult(RequirementLinkDto.of(existing.get()), false);
        }
        if (requirement.getStatus() != RequirementStatus.ACTIVE) {
            throw new ApiException(ErrorCode.CONFLICT, "문서에서 사라졌거나 확인이 필요한 요구사항에는 새로 연결할 수 없어요");
        }
        RequirementLink link = new RequirementLink(requirement, task, appUserService.require(access.userId()), now);
        try {
            requirementLinkRepository.saveAndFlush(link);
        } catch (DataIntegrityViolationException e) {
            // 같은 연결 요청이 동시에 들어옴 — (요구사항, 이슈) 유일 제약
            throw new ApiException(ErrorCode.CONFLICT, "같은 연결이 동시에 저장됐어요. 다시 불러와 주세요");
        }
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.REQUIREMENTS);
        return new LinkResult(RequirementLinkDto.of(link), true);
    }

    /** {@code DELETE W/requirement-links/{linkId}} — 연결만 지운다. 요구사항 · 이슈는 그대로다. */
    @Transactional
    public void unlink(WorkspaceAccess access, Long linkId) {
        RequirementLink link = requirementLinkRepository.findByIdAndRequirementWorkspaceId(linkId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        access.requireRepoAdmin();
        requirementLinkRepository.delete(link);
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.REQUIREMENTS);
    }

    /** Snapshot {@code requirementLinks} 조각 — 사무실의 연결 전부, 연결한 순서. */
    @Transactional(readOnly = true)
    public List<RequirementLinkDto> listLinks(Long workspaceId) {
        return requirementLinkRepository.findByRequirementWorkspaceIdOrderByLinkedAtAscIdAsc(workspaceId).stream()
                .map(RequirementLinkDto::of)
                .toList();
    }
}
