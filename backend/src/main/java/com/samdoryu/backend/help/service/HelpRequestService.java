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
import com.samdoryu.backend.help.repository.HelpRequestHiddenRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
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
    private final HelpRequestHiddenRepository hiddenRepository;
    private final InstructorAssignmentService instructorAssignmentService;
    private final WorkspaceEventHub eventHub;
    private final EntityManager entityManager;

    public HelpRequestService(HelpRequestRepository helpRequestRepository,
            HelpCommentRepository helpCommentRepository, HelpRequestHiddenRepository hiddenRepository,
            InstructorAssignmentService instructorAssignmentService, WorkspaceEventHub eventHub,
            EntityManager entityManager) {
        this.helpRequestRepository = helpRequestRepository;
        this.helpCommentRepository = helpCommentRepository;
        this.hiddenRepository = hiddenRepository;
        this.instructorAssignmentService = instructorAssignmentService;
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
     * "강사에게 요청" 켜기(FR-LRN-21 · CONTRACTS_API 「11」) — 요청자만. 검사 순서는 대상(404) → 요청자(403 — 강사 포함)
     * → 상태(409 — 강사가 답할 수 있는 {@code open} · {@code discussing} · {@code on_agenda}만, 이미 켜져 있어도)
     * → 이미 켜져 있으면 그대로(처음 시각 유지 · 변경 알림 없음) → 지정된 강사 없음(409). 시연 사무실은 심사용 강사 계정이
     * 강사라 지정 행을 보지 않는다.
     */
    @Transactional
    public HelpRequestSummary requestInstructor(WorkspaceAccess access, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        if (!helpRequest.getStatus().acceptsComments()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        Instant now = Instant.now();
        if (helpRequest.isInstructorRequested()) {
            return HelpRequestSummary.of(helpRequest, now);
        }
        if (helpRequest.getWorkspace().getKind() != WorkspaceKind.DEMO
                && !instructorAssignmentService.hasCurrentInstructor(access.workspaceId())) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
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

    /**
     * 전환된 안건을 거둔 것과 같은 트랜잭션에서 부른다(meeting 패키지, #313) → 전환 직전 상태({@code open} / {@code discussing})
     * 그대로. 안건은 이미 같은 사무실 것으로 찾았고 올린 사람 · 상태 검사도 끝났다. 본문 · 코멘트 · "강사에게 요청"은 그대로 둔다.
     */
    @Transactional
    public void returnFromAgenda(Long workspaceId, Long helpRequestId) {
        helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, workspaceId)
                .orElseThrow(() -> new IllegalStateException("안건의 도움 요청이 이 사무실에 없음"))
                .returnFromAgenda();
    }

    /**
     * 나에게서만 삭제(#315 ① · #333) — 그 도움 요청을 볼 수 있는 사람(팀원 · 지정된 강사) 누구나. 이 사용자의 조회 결과
     * (Snapshot {@code helpRequests} · 강사 요청함)에서만 뺀다. 대상이 없거나 다른 사무실 것이면 {@code not_found}. 이미 뺐으면
     * 그대로(처음 시각 유지). 되돌리는 길은 없다. 원본 · 코멘트와 다른 사람의 화면은 그대로라 변경 알림을 보내지 않는다 — 뺀 사람의
     * 화면이 스스로 다시 읽는다.
     */
    @Transactional
    public void hide(WorkspaceAccess access, Long helpRequestId) {
        requireInWorkspace(access.workspaceId(), helpRequestId);
        try {
            hiddenRepository.insertIfAbsent(helpRequestId, access.userId(), Instant.now());
        } catch (DataIntegrityViolationException e) {
            // 위 확인과 이 저장 사이에 요청자가 영구 삭제했다(외래키) — 이제 없는 요청이다
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
    }

    /**
     * 영구 삭제(#315 ②) 1단계 — 요청자만. 검사 순서는 대상(404 — 없거나 다른 사무실 것 · 이미 지운 요청) → 요청자(403 — 강사는
     * {@code InstructorWriteGuard}가 먼저 막는다). 상태와 상관없이 지울 수 있다. 행을 잠가 읽어, 지울 때까지 같은 글의 코멘트 ·
     * 안건 전환 · 숨김이 끼어들지 못하게 한다. {@link HelpRequestDeletionService}만 부른다.
     */
    @Transactional
    public HelpRequest lockForPermanentDelete(WorkspaceAccess access, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestRepository.findForDeleteByIdAndWorkspaceId(helpRequestId,
                        access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(helpRequest.getRequester().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        return helpRequest;
    }

    /**
     * 영구 삭제(#315 ②) 마지막 단계 — 안건 쪽 연결을 끊은 뒤 같은 트랜잭션에서 부른다. 서로를 가리키는 외래키 때문에 순서대로
     * 지운다: 도움이 된 코멘트 연결 비우기 → 모든 사용자의 숨김 행 → 코멘트 전부(남의 코멘트 · 강사 답변 포함) → 도움 요청.
     * 논리 삭제 칸을 두지 않고 행을 실제로 지운다. 연쇄 삭제(cascade · ON DELETE)는 쓰지 않는다.
     * {@link HelpRequestDeletionService}만 부른다.
     */
    @Transactional
    public void deletePermanently(HelpRequest helpRequest) {
        helpRequest.clearHelpfulCommentForDeletion();
        helpRequestRepository.flush(); // 안건 연결 끊기와 도움이 된 코멘트 비우기를 아래 일괄 삭제보다 먼저 DB에
        hiddenRepository.deleteAllByHelpRequestId(helpRequest.getId());
        helpCommentRepository.deleteAllByHelpRequestId(helpRequest.getId());
        helpRequestRepository.delete(helpRequest);
        helpRequestRepository.flush();
    }

    private void requireInWorkspace(Long workspaceId, Long helpRequestId) {
        if (helpRequestRepository.findByIdAndWorkspaceId(helpRequestId, workspaceId).isEmpty()) {
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
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

    /**
     * Snapshot {@code helpRequests} 조각 — 사무실의 도움 요청 중 보는 사람이 숨기지 않은 것, createdAt 오름차순(#315 ①).
     *
     * @param viewerUserId 세션 사용자 — 이 사람이 숨긴 요청만 뺀다
     */
    @Transactional(readOnly = true)
    public List<HelpRequestSummary> listSummaries(Long workspaceId, Long viewerUserId, Instant now) {
        Set<Long> hidden = hiddenRepository.findHelpRequestIdsByUserIdAndWorkspaceId(viewerUserId, workspaceId);
        return helpRequestRepository.findByWorkspaceIdOrderByCreatedAtAscIdAsc(workspaceId).stream()
                .filter(helpRequest -> !hidden.contains(helpRequest.getId()))
                .map(helpRequest -> HelpRequestSummary.of(helpRequest, now))
                .toList();
    }

    /**
     * 강사 요청함(CONTRACTS_API 「16」 · FR-LRN-23) 재료 — 여러 사무실의 "강사에게 요청"이 켜진 글을 사무실 · 요청자와 함께.
     * 보는 강사가 숨긴 글은 뺀다(#315 ①). 어느 사무실을 볼지(지금 지정된 사무실)는 부르는 쪽이 정한다.
     */
    @Transactional(readOnly = true)
    public List<HelpRequest> listInstructorRequested(Collection<Long> workspaceIds, Long viewerUserId) {
        if (workspaceIds.isEmpty()) {
            return List.of();
        }
        List<HelpRequest> requested = helpRequestRepository.findInstructorRequestedByWorkspaceIds(workspaceIds);
        if (requested.isEmpty()) {
            return requested;
        }
        Set<Long> hidden = hiddenRepository.findHiddenAmong(viewerUserId,
                requested.stream().map(HelpRequest::getId).toList());
        return requested.stream().filter(helpRequest -> !hidden.contains(helpRequest.getId())).toList();
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
