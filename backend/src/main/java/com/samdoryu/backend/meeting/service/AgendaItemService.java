package com.samdoryu.backend.meeting.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import com.samdoryu.backend.help.service.HelpRequestService;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.domain.PrDecision;
import com.samdoryu.backend.meeting.dto.AgendaItemCreateRequest;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.dto.DecisionRequest;
import com.samdoryu.backend.meeting.dto.InstructorFeedbackCreateRequest;
import com.samdoryu.backend.meeting.dto.InstructorFeedbackDto;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회의 안건(FR-MTG-03 · FR-LRN-14). 인가 검사 순서 1 · 2 · 4는 Controller가 끝낸 뒤 부른다 — 여기서는 요청 모양(400)과
 * 원본(404 — 같은 사무실 것만)을 본다. 개수 제한은 없다.
 */
@Service
public class AgendaItemService {

    private final AgendaItemRepository agendaItemRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final MeetingRepository meetingRepository;
    private final SyncedItemService syncedItemService;
    private final EvaluationRoundService evaluationRoundService;
    private final HelpRequestService helpRequestService;
    private final WorkspaceService workspaceService;
    private final WorkspaceEventHub eventHub;
    private final EntityManager entityManager;

    public AgendaItemService(AgendaItemRepository agendaItemRepository,
            InstructorFeedbackRepository instructorFeedbackRepository, MeetingRepository meetingRepository,
            SyncedItemService syncedItemService, EvaluationRoundService evaluationRoundService,
            HelpRequestService helpRequestService, WorkspaceService workspaceService, WorkspaceEventHub eventHub,
            EntityManager entityManager) {
        this.agendaItemRepository = agendaItemRepository;
        this.instructorFeedbackRepository = instructorFeedbackRepository;
        this.meetingRepository = meetingRepository;
        this.syncedItemService = syncedItemService;
        this.evaluationRoundService = evaluationRoundService;
        this.helpRequestService = helpRequestService;
        this.workspaceService = workspaceService;
        this.eventHub = eventHub;
        this.entityManager = entityManager;
    }

    /**
     * 안건 올리기 → {@code confirmed}. 종류와 원본이 맞지 않거나 {@code help_request} 종류면 {@code invalid},
     * 원본이 없거나 다른 사무실 것이면 {@code not_found}. PR 안건은 그때의 현재 평가 회차를 기억한다.
     *
     * @param raisedByMemberId 세션 사용자의 그 사무실 팀원 ID(강사는 Controller에서 이미 거부됨)
     */
    @Transactional
    public AgendaItemDto create(Long workspaceId, Long raisedByMemberId, AgendaItemCreateRequest request) {
        Workspace workspace = entityManager.getReference(Workspace.class, workspaceId);
        Member raisedBy = entityManager.getReference(Member.class, raisedByMemberId);
        Instant now = Instant.now();
        AgendaItem item = switch (request.kind()) {
            case ISSUE -> AgendaItem.forTask(workspace,
                    syncedItemService.requireTask(workspaceId, requireSourceId(request)),
                    request.title(), request.background(), request.tried(), request.unresolvedReason(), raisedBy, now);
            case PR -> {
                Submission submission = syncedItemService.requireSubmission(workspaceId, requireSourceId(request));
                yield AgendaItem.forSubmission(workspace, submission,
                        evaluationRoundService.currentRoundId(submission.getId()),
                        request.title(), request.background(), request.tried(), request.unresolvedReason(), raisedBy, now);
            }
            case LEARNING, OTHER -> {
                if (request.sourceId() != null) {
                    throw new ApiException(ErrorCode.INVALID, "배운 점 · 기타 안건에는 원본이 없어요");
                }
                yield AgendaItem.withoutSource(workspace, request.kind(),
                        request.title(), request.background(), request.tried(), request.unresolvedReason(), raisedBy, now);
            }
            case HELP_REQUEST -> throw new ApiException(ErrorCode.INVALID, "도움 요청은 도움 요청에서 안건으로 옮겨요");
        };
        agendaItemRepository.save(item);
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.AGENDA_ITEMS);
        return AgendaItemDto.of(item, List.of());
    }

    /**
     * 회의 전 거두기(FR-LRN-14) → {@code withdrawn}. 검사 순서는 대상(404 — 같은 사무실 것만) → 올린 사람(403) →
     * {@code confirmed}가 아님(409). 행은 지우지 않는다.
     */
    @Transactional
    public AgendaItemDto withdraw(WorkspaceAccess access, Long agendaItemId) {
        AgendaItem item = agendaItemRepository.findByIdAndWorkspaceId(agendaItemId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!access.isSelf(item.getRaisedBy().getId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        if (!item.isConfirmed()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        item.withdraw();
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.AGENDA_ITEMS);
        return AgendaItemDto.of(item, List.of());
    }

    /**
     * 결정 기록(FR-MTG-04) → {@code discussed}. 올린 사람이 아니어도 된다. 검사 순서는 대상(404 — 같은 사무실 것만) →
     * {@code confirmed}가 아님(409) → PR 결정이 종류와 맞지 않음 · 후속 담당자가 지금 팀원이 아님(400) → 다룬 회의(404).
     * 같은 트랜잭션에서 {@code revise_and_reevaluate}면 새 평가 회차를, 도움 요청 안건이면 그 도움 요청을 {@code ended}로.
     *
     * @param decidedByMemberId 세션 사용자의 그 사무실 팀원 ID(강사는 Controller에서 이미 거부됨)
     */
    @Transactional
    public AgendaItemDto decide(Long workspaceId, Long decidedByMemberId, Long agendaItemId, DecisionRequest request) {
        AgendaItem item = agendaItemRepository.findByIdAndWorkspaceId(agendaItemId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!item.isConfirmed()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        if ((request.prDecision() != null) != (item.getKind() == AgendaKind.PR)) {
            throw new ApiException(ErrorCode.INVALID, "PR 안건은 PR 결정을 골라야 하고, 다른 안건에는 PR 결정이 없어요");
        }
        Member followUpAssignee = null;
        if (request.followUpAssigneeMemberId() != null) {
            Long followUpId = Ids.fromBody(request.followUpAssigneeMemberId());
            followUpAssignee = workspaceService.currentMembers(workspaceId).stream()
                    .filter(member -> member.getId().equals(followUpId)).findFirst()
                    .orElseThrow(() -> new ApiException(ErrorCode.INVALID, "후속 담당자는 이 사무실의 지금 팀원이어야 해요"));
        }
        Meeting meeting = request.meetingId() == null ? null
                : meetingRepository.findByIdAndWorkspaceId(Ids.fromBody(request.meetingId()), workspaceId)
                        .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        Instant now = Instant.now();
        item.decide(request.conclusion(), request.learning(), request.prDecision(), followUpAssignee,
                request.followUpDueDate(), meeting, entityManager.getReference(Member.class, decidedByMemberId), now);

        List<SnapshotResource> changed = new ArrayList<>(List.of(SnapshotResource.AGENDA_ITEMS));
        if (meeting != null) {
            changed.add(SnapshotResource.MEETINGS); // discussedAgendaItemIds
        }
        if (request.prDecision() == PrDecision.REVISE_AND_REEVALUATE) {
            evaluationRoundService.openMeetingReevaluateRound(item.getSourceSubmission(), now);
            changed.add(SnapshotResource.SUBMISSIONS); // currentRound
        }
        if (item.getKind() == AgendaKind.HELP_REQUEST) {
            helpRequestService.endByAgendaDecision(workspaceId, item.getSourceHelpRequestId(), now);
            changed.add(SnapshotResource.HELP_REQUESTS);
        }
        eventHub.publishChangeAfterCommit(workspaceId, changed.toArray(SnapshotResource[]::new));
        return AgendaItemDto.of(item, List.of());
    }

    /**
     * 결정 기록에 강사 피드백 요청(FR-LRN-22) → {@code feedbackRequested: true}. 검사 순서는 대상(404 — 같은 사무실 것만) →
     * {@code discussed}가 아님(409). 이미 켜져 있으면 그대로 돌려준다.
     */
    @Transactional
    public AgendaItemDto requestFeedback(Long workspaceId, Long agendaItemId) {
        AgendaItem item = requireItem(workspaceId, agendaItemId);
        if (!item.isDiscussed()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        if (!item.isFeedbackRequested()) {
            item.requestFeedback(Instant.now());
            eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.AGENDA_ITEMS);
        }
        return AgendaItemDto.of(item, instructorFeedbackRepository.findByAgendaItemIdOrderByCreatedAtAsc(item.getId()));
    }

    /**
     * 강사 피드백(FR-LRN-22) — 결정 기록 아래 팀 전체에게 보인다. 안건 · 결정 상태는 바꾸지 않는다(SP3).
     * 검사 순서는 대상(404 — 같은 사무실 것만) → 피드백 요청이 켜지지 않음(403 — 강사 쓰기는 요청된 건만, FR-AUTH-08).
     *
     * @param instructorUserId 세션 사용자(지정된 강사인지는 Controller에서 이미 확인함)
     */
    @Transactional
    public InstructorFeedbackDto addInstructorFeedback(Long workspaceId, Long instructorUserId, Long agendaItemId,
            InstructorFeedbackCreateRequest request) {
        AgendaItem item = requireItem(workspaceId, agendaItemId);
        if (!item.isFeedbackRequested()) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        InstructorFeedback feedback = instructorFeedbackRepository.save(new InstructorFeedback(item,
                entityManager.getReference(AppUser.class, instructorUserId), request.body(), Instant.now()));
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.AGENDA_ITEMS);
        return InstructorFeedbackDto.of(feedback);
    }

    private AgendaItem requireItem(Long workspaceId, Long agendaItemId) {
        return agendaItemRepository.findByIdAndWorkspaceId(agendaItemId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** Snapshot {@code agendaItems} 조각 — 거둔 것 포함 전부, raisedAt 오름차순. 강사 피드백은 한 번에 읽어 나눈다. */
    @Transactional(readOnly = true)
    public List<AgendaItemDto> listAll(Long workspaceId) {
        Map<Long, List<InstructorFeedback>> feedbacks = instructorFeedbackRepository
                .findByAgendaItemWorkspaceIdOrderByCreatedAtAscIdAsc(workspaceId).stream()
                .collect(Collectors.groupingBy(feedback -> feedback.getAgendaItem().getId()));
        return agendaItemRepository.findByWorkspaceIdOrderByRaisedAtAscIdAsc(workspaceId).stream()
                .map(item -> AgendaItemDto.of(item, feedbacks.getOrDefault(item.getId(), List.of())))
                .toList();
    }

    /**
     * 도움 요청 → 안건 전환(CONTRACTS_API 「11」 to-agenda, FR-LRN-18 · 19) → {@code help_request} 종류 {@code confirmed} 안건.
     * 도움 요청의 검사(404 → 요청자 403 → 상태 409)와 {@code on_agenda} 전환이 안건 생성과 한 트랜잭션이다.
     * 동시에 두 번 전환하면 안건 유일 제약(도움 요청당 하나)이 막는다 → {@code conflict}.
     */
    @Transactional
    public AgendaItemDto createFromHelpRequest(WorkspaceAccess access, Long helpRequestId, String title) {
        helpRequestService.moveToAgenda(access, helpRequestId);
        AgendaItem item = AgendaItem.forHelpRequest(entityManager.getReference(Workspace.class, access.workspaceId()),
                helpRequestId, title, entityManager.getReference(Member.class, access.requireTeamMember()),
                Instant.now());
        try {
            agendaItemRepository.saveAndFlush(item);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.AGENDA_ITEMS,
                SnapshotResource.HELP_REQUESTS);
        return AgendaItemDto.of(item, List.of());
    }

    /** 이슈 · PR 안건의 원본 ID — 없으면 {@code invalid}(종류와 원본이 맞지 않음). */
    private static Long requireSourceId(AgendaItemCreateRequest request) {
        if (request.sourceId() == null) {
            throw new ApiException(ErrorCode.INVALID, "이슈 · PR 안건은 원본을 골라야 해요");
        }
        return Ids.fromBody(request.sourceId());
    }
}
