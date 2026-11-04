package com.samdoryu.backend.help.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.dto.HelpCommentCreateRequest;
import com.samdoryu.backend.help.dto.HelpCommentDto;
import com.samdoryu.backend.help.dto.HelpRequestCreateRequest;
import com.samdoryu.backend.help.dto.HelpRequestDetail;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 도움 요청(FR-LRN-15). 다른 패키지는 이 Service로만 도움 요청을 읽는다(Snapshot {@code helpRequests}).
 * 인가 검사 순서 1 · 2 · 4는 Controller가 끝낸 뒤 부른다 — 여기서는 대상 존재(3)와 대상 조건(5)을 본다.
 */
@Service
public class HelpRequestService {

    private final HelpRequestRepository helpRequestRepository;
    private final HelpCommentRepository helpCommentRepository;
    private final EntityManager entityManager;

    public HelpRequestService(HelpRequestRepository helpRequestRepository,
            HelpCommentRepository helpCommentRepository, EntityManager entityManager) {
        this.helpRequestRepository = helpRequestRepository;
        this.helpCommentRepository = helpCommentRepository;
        this.entityManager = entityManager;
    }

    /** @param requesterMemberId 세션 사용자의 그 사무실 팀원 ID(강사는 Controller에서 이미 거부됨) */
    @Transactional
    public HelpRequestSummary create(Long workspaceId, Long requesterMemberId, HelpRequestCreateRequest request) {
        Standup fromStandup = request.fromStandupId() == null
                ? null
                : requireOwnStandup(workspaceId, requesterMemberId, Ids.fromBody(request.fromStandupId()));
        Instant now = Instant.now();
        HelpRequest helpRequest = helpRequestRepository.save(new HelpRequest(
                entityManager.getReference(Workspace.class, workspaceId),
                entityManager.getReference(Member.class, requesterMemberId),
                request.content(), fromStandup, now));
        return HelpRequestSummary.of(helpRequest, now);
    }

    /**
     * 코멘트 달기(FR-LRN-16 · 21). 검사 순서는 대상(404) → 역할(403 — 강사는 "강사에게 요청"이 켜진 글만) → 상태(409).
     * 요청자가 아닌 팀원의 첫 코멘트면 {@code open → discussing}. 요청자 코멘트 · 강사 답변은 상태를 바꾸지 않는다.
     */
    @Transactional
    public HelpCommentDto addComment(WorkspaceAccess access, Long helpRequestId, HelpCommentCreateRequest request) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        boolean instructorAnswer = access.role() == WorkspaceRole.INSTRUCTOR;
        if (instructorAnswer && !helpRequest.isInstructorRequested()) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        Long authorMemberId = instructorAnswer ? null : access.requireTeamMember();
        if (!helpRequest.getStatus().acceptsComments()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        HelpComment comment = helpCommentRepository.save(new HelpComment(helpRequest,
                entityManager.getReference(AppUser.class, access.userId()),
                authorMemberId == null ? null : entityManager.getReference(Member.class, authorMemberId),
                request.content(), Instant.now()));
        helpRequest.onComment(access.isSelf(helpRequest.getRequester().getId()), instructorAnswer);
        return HelpCommentDto.of(comment);
    }

    @Transactional(readOnly = true)
    public HelpRequestDetail getDetail(Long workspaceId, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        return HelpRequestDetail.of(helpRequest,
                helpCommentRepository.findByHelpRequestIdOrderByCreatedAtAscIdAsc(helpRequestId), Instant.now());
    }

    /** Snapshot {@code helpRequests} 조각 — 사무실의 도움 요청 전부, createdAt 오름차순. */
    @Transactional(readOnly = true)
    public List<HelpRequestSummary> listSummaries(Long workspaceId, Instant now) {
        return helpRequestRepository.findByWorkspaceIdOrderByCreatedAtAscIdAsc(workspaceId).stream()
                .map(helpRequest -> HelpRequestSummary.of(helpRequest, now))
                .toList();
    }

    /**
     * 다른 사무실 · 없는 스탠드업은 {@code not_found}(「3」 같은 사무실끼리만 참조), 다른 팀원 것은 {@code forbidden_role}.
     * ponytail: meeting 패키지에 Standup Service가 없어 Entity로 직접 읽는다 — 생기면 그 Service로 바꾼다.
     */
    private Standup requireOwnStandup(Long workspaceId, Long memberId, Long standupId) {
        Standup standup = entityManager.find(Standup.class, standupId);
        if (standup == null || !standup.getWorkspace().getId().equals(workspaceId)) {
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
        if (!standup.getMember().getId().equals(memberId)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        return standup;
    }
}
