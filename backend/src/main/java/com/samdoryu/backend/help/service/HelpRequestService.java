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
import com.samdoryu.backend.help.dto.HelpRequestCloseRequest;
import com.samdoryu.backend.help.dto.HelpRequestCreateRequest;
import com.samdoryu.backend.help.dto.HelpRequestDetail;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;
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
    private final WorkspaceEventHub eventHub;
    private final EntityManager entityManager;

    public HelpRequestService(HelpRequestRepository helpRequestRepository,
            HelpCommentRepository helpCommentRepository, WorkspaceEventHub eventHub, EntityManager entityManager) {
        this.helpRequestRepository = helpRequestRepository;
        this.helpCommentRepository = helpCommentRepository;
        this.eventHub = eventHub;
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
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.HELP_REQUESTS);
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
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.HELP_REQUESTS);
        return HelpCommentDto.of(comment);
    }

    /**
     * 닫기(FR-LRN-17) — 요청자만. 검사 순서는 대상(404) → 요청자(403 — 강사 포함) → 상태(409 — open · discussing만)
     * → 도움이 된 코멘트(400). 닫으면 {@code resolved}이고 배운 점과 도움이 된 코멘트를 남긴다.
     */
    @Transactional
    public HelpRequestDetail close(WorkspaceAccess access, Long helpRequestId, HelpRequestCloseRequest request) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        if (!helpRequest.getStatus().isOpenForDiscussion()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        HelpComment helpfulComment = request.helpfulCommentId() == null
                ? null
                : requireHelpfulComment(helpRequest, Ids.fromBody(request.helpfulCommentId()));
        Instant now = Instant.now();
        helpRequest.close(helpfulComment, request.learning(), now);
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.HELP_REQUESTS);
        return HelpRequestDetail.of(helpRequest,
                helpCommentRepository.findByHelpRequestIdOrderByCreatedAtAscIdAsc(helpRequestId), now);
    }

    /**
     * "강사에게 요청" 켜기(FR-LRN-21) — 요청자만. 검사 순서는 대상(404) → 요청자(403 — 강사 포함).
     * 계약에 상태 조건이 없어 어느 상태에서든 켤 수 있고, 이미 켜져 있으면 그대로(처음 시각 유지)다.
     */
    @Transactional
    public HelpRequestSummary requestInstructor(WorkspaceAccess access, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        Instant now = Instant.now();
        helpRequest.requestInstructor(now);
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.HELP_REQUESTS);
        return HelpRequestSummary.of(helpRequest, now);
    }

    /**
     * 안건으로 전환(FR-LRN-18 · 19) — 요청자만. 검사 순서는 대상(404) → 요청자(403 — 강사 포함) → 상태(409 — open ·
     * discussing만) → {@code on_agenda}. 안건 생성과 같은 트랜잭션에서 meeting 패키지가 부른다(안건이 이 도움 요청을 가리킨다).
     */
    @Transactional
    public void moveToAgenda(WorkspaceAccess access, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        if (!helpRequest.getStatus().isOpenForDiscussion()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        helpRequest.moveToAgenda();
    }

    /** 안건 결정과 같은 트랜잭션에서 부른다(meeting 패키지). 안건은 이미 같은 사무실 것으로 찾은 것이다. */
    @Transactional
    public void endByAgendaDecision(Long workspaceId, Long helpRequestId, Instant decidedAt) {
        helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, workspaceId)
                .orElseThrow(() -> new IllegalStateException("안건의 도움 요청이 이 사무실에 없음"))
                .endByAgendaDecision(decidedAt);
    }

    /** 도움이 된 코멘트 — 이 글의 코멘트이고, 강사 답변 · 요청자 본인 코멘트가 아니어야 한다. 아니면 {@code invalid}. */
    private HelpComment requireHelpfulComment(HelpRequest helpRequest, Long commentId) {
        HelpComment comment = helpCommentRepository.findByIdAndHelpRequestId(commentId, helpRequest.getId())
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID, "도움이 된 코멘트는 이 도움 요청의 코멘트여야 해요"));
        if (comment.isInstructorAnswer()
                || comment.getAuthorMember().getId().equals(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.INVALID, "강사 답변이나 내 코멘트는 도움이 된 코멘트로 고를 수 없어요");
        }
        return comment;
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
     * 강사 요청함(CONTRACTS_API 「16」 · FR-LRN-23) 재료 — 여러 사무실의 "강사에게 요청"이 켜진 글을 사무실 · 요청자와 함께.
     * 어느 사무실을 볼지(지금 지정된 사무실)는 부르는 쪽이 정한다.
     */
    @Transactional(readOnly = true)
    public List<HelpRequest> listInstructorRequested(Collection<Long> workspaceIds) {
        return workspaceIds.isEmpty() ? List.of()
                : helpRequestRepository.findInstructorRequestedByWorkspaceIds(workspaceIds);
    }

    /** 도움 요청마다 첫 강사 답변 시각 — 강사 답변이 없는 글은 키가 없다. */
    @Transactional(readOnly = true)
    public Map<Long, Instant> firstInstructorAnswerAt(Collection<Long> helpRequestIds) {
        if (helpRequestIds.isEmpty()) {
            return Map.of();
        }
        return helpCommentRepository.findByHelpRequestIdInAndInstructorAnswerTrue(helpRequestIds).stream()
                .collect(Collectors.toMap(comment -> comment.getHelpRequest().getId(), HelpComment::getCreatedAt,
                        BinaryOperator.minBy(Comparator.naturalOrder())));
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
