package com.samdoryu.backend.report.service;

import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import com.samdoryu.backend.meeting.dto.AgendaDecisionDto;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.meeting.service.MeetingService;
import com.samdoryu.backend.meeting.service.StandupService;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.domain.FollowUpQuestion;
import com.samdoryu.backend.report.dto.DecisionCardDto;
import com.samdoryu.backend.report.dto.DecisionCardDto.FollowUpQuestionDto;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.requirement.dto.RequirementLinkDto;
import com.samdoryu.backend.requirement.service.RequirementLinkService;
import com.samdoryu.backend.requirement.service.RequirementService;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
 * 기술 결정 카드(FR-REP-07 · P11 · CONTRACTS_API 「15」). 개인 기록 — 공통 접근 규칙: 경로의 팀원이 그 사무실 팀원(빠진 팀원 포함)이
 * 아니면 {@code not_found}, 읽기는 본인 · 지정된 강사, 쓰기는 본인만(다른 학생 · 강사 {@code forbidden_role}). 사무실 접근은
 * Controller가 끝낸 뒤 부른다. Snapshot · SSE에 싣지 않는다. 강사 꼬리질문(#59 · FR-REP-11)은 본인이 요청한 카드에만
 * 지정된 강사가 쓴다.
 */
@Service
public class DecisionCardService {

    /** {@code AgendaItemDto.Source.type} — PR 안건. */
    private static final String SUBMISSION_SOURCE = "submission";
    private static final Set<SubmissionState> OPEN_STATES = Set.of(SubmissionState.OPEN, SubmissionState.DRAFT);
    private static final String REPORT_CARD_INVALID = "배운 점을 쓴 내 기술 결정 카드만 넣을 수 있어요";

    private final DecisionCardRepository decisionCardRepository;
    private final FollowUpQuestionRepository followUpQuestionRepository;
    private final WorkspaceService workspaceService;
    private final SyncedItemService syncedItemService;
    private final EvaluationRoundService evaluationRoundService;
    private final RequirementService requirementService;
    private final RequirementLinkService requirementLinkService;
    private final AgendaItemService agendaItemService;
    private final MeetingService meetingService;
    private final StandupService standupService;
    private final AppUserService appUserService;

    public DecisionCardService(DecisionCardRepository decisionCardRepository,
            FollowUpQuestionRepository followUpQuestionRepository, WorkspaceService workspaceService,
            SyncedItemService syncedItemService, EvaluationRoundService evaluationRoundService,
            RequirementService requirementService, RequirementLinkService requirementLinkService,
            AgendaItemService agendaItemService, MeetingService meetingService, StandupService standupService,
            AppUserService appUserService) {
        this.decisionCardRepository = decisionCardRepository;
        this.followUpQuestionRepository = followUpQuestionRepository;
        this.workspaceService = workspaceService;
        this.syncedItemService = syncedItemService;
        this.evaluationRoundService = evaluationRoundService;
        this.requirementService = requirementService;
        this.requirementLinkService = requirementLinkService;
        this.agendaItemService = agendaItemService;
        this.meetingService = meetingService;
        this.standupService = standupService;
        this.appUserService = appUserService;
    }

    /** {@code GET W/members/{memberId}/decision-cards} — createdAt 내림차순. 본인 · 지정된 강사. */
    @Transactional(readOnly = true)
    public List<DecisionCardDto> list(WorkspaceAccess access, Long memberId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        List<DecisionCard> cards = decisionCardRepository.findByMemberIdOrderByCreatedAtDescIdDesc(memberId);
        if (cards.isEmpty()) {
            return List.of();
        }
        Map<Long, List<FollowUpQuestion>> questions = followUpQuestionRepository
                .findWithInstructorByDecisionCardIds(cards.stream().map(DecisionCard::getId).toList()).stream()
                .collect(Collectors.groupingBy(question -> question.getDecisionCard().getId()));
        return cards.stream()
                .map(card -> DecisionCardDto.of(card, questions.getOrDefault(card.getId(), List.of())))
                .toList();
    }

    /**
     * {@code POST W/members/{memberId}/decision-cards} — 머지되거나 닫힌 내 PR로 카드를 만들고 9칸을 재료에서 규칙대로 채운다
     * ({@link DecisionCardDraft}). 검사 순서: 팀원 아님 · 다른 사무실 PR {@code not_found} → 본인 아님 · 내가 작성한 PR 아님
     * {@code forbidden_role} → PR이 아직 열림 · 같은 PR 카드가 있음 {@code conflict}.
     */
    @Transactional
    public DecisionCardDto create(WorkspaceAccess access, Long memberId, Long submissionId) {
        Member member = workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        Submission submission = syncedItemService.requireSubmission(access.workspaceId(), submissionId);
        if (submission.getAuthorMember() == null || !submission.getAuthorMember().getId().equals(memberId)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE, "내가 작성한 PR로만 카드를 만들 수 있어요");
        }
        if (OPEN_STATES.contains(submission.getState())) {
            throw new ApiException(ErrorCode.CONFLICT, "머지되거나 닫힌 PR로만 카드를 만들 수 있어요");
        }
        if (decisionCardRepository.existsByMemberIdAndSubmissionId(memberId, submission.getId())) {
            throw new ApiException(ErrorCode.CONFLICT, "이 PR의 카드가 이미 있어요");
        }

        DecisionCardCells cells = DecisionCardDraft.fill(materials(access, memberId, submission.getId()));
        DecisionCard card = decisionCardRepository.save(new DecisionCard(member, submission, cells, now()));
        try {
            decisionCardRepository.flush();
        } catch (DataIntegrityViolationException e) {
            // 같은 PR로 동시에 두 번 — (팀원, PR) 유일 제약
            throw new ApiException(ErrorCode.CONFLICT, "이 PR의 카드가 이미 있어요");
        }
        return DecisionCardDto.of(card, List.of());
    }

    /**
     * {@code PUT W/members/{memberId}/decision-cards/{cardId}}(P11) — 본인이 9칸을 통째로 고친다. 「확인함」 단계는 없다(#335) —
     * 배운 점 칸이 있으면 리포트를 만들 때 고를 수 있다. 다른 팀원의 카드 ID면 {@code not_found}.
     */
    @Transactional
    public DecisionCardDto update(WorkspaceAccess access, Long memberId, Long cardId, DecisionCardCells cells) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        DecisionCard card = requireCard(memberId, cardId);
        card.edit(cells, now());
        return DecisionCardDto.of(card,
                followUpQuestionRepository.findWithInstructorByDecisionCardIds(List.of(card.getId())));
    }

    /**
     * {@code POST W/members/{memberId}/decision-cards/{cardId}/follow-up-request}(FR-REP-11) — 본인이 강사 꼬리질문을 요청한다
     * → {@code followUpRequested: true}. 이미 켜져 있으면 처음 요청 시각 그대로 돌려준다. 다른 팀원의 카드 ID면 {@code not_found}.
     * 요청을 끄는 API는 없다. 강사 요청함(#58)은 이 값을 읽을 때 계산한다.
     */
    @Transactional
    public DecisionCardDto requestFollowUp(WorkspaceAccess access, Long memberId, Long cardId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        DecisionCard card = requireCard(memberId, cardId);
        card.requestFollowUp(now());
        return DecisionCardDto.of(card,
                followUpQuestionRepository.findWithInstructorByDecisionCardIds(List.of(card.getId())));
    }

    /**
     * {@code POST W/members/{memberId}/decision-cards/{cardId}/follow-up-questions}(FR-REP-11 · P13) — 지정된 강사가 꼬리질문을
     * 직접 쓴다(AI 없음). 9칸과 따로 붙고 카드의 수정 시각 · 확인 여부는 바꾸지 않는다. 검사 순서: 팀원 아님 {@code not_found} →
     * 강사 아님(학생 · 본인도) {@code forbidden_role} → 다른 팀원의 카드 ID {@code not_found} → 꼬리질문을 요청하지 않은 카드
     * {@code forbidden_role}(강사 쓰기는 요청된 건만 — FR-AUTH-08).
     */
    @Transactional
    public FollowUpQuestionDto addFollowUpQuestion(WorkspaceAccess access, Long memberId, Long cardId, String body) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireInstructor();
        DecisionCard card = requireCard(memberId, cardId);
        if (card.getFollowUpRequestedAt() == null) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE, "꼬리질문을 요청한 카드에만 쓸 수 있어요");
        }
        FollowUpQuestion question = followUpQuestionRepository.save(
                new FollowUpQuestion(card, appUserService.require(access.userId()), body, now()));
        return FollowUpQuestionDto.of(question);
    }

    /**
     * 강사 요청함(CONTRACTS_API 「16」 · FR-LRN-23) 재료 — 여러 사무실에서 꼬리질문을 요청한 카드를 주인 · 사무실 · PR과 함께.
     * 어느 사무실을 볼지(지금 지정된 사무실)는 부르는 쪽이 정한다.
     */
    @Transactional(readOnly = true)
    public List<DecisionCard> listFollowUpRequested(Collection<Long> workspaceIds) {
        return workspaceIds.isEmpty() ? List.of()
                : decisionCardRepository.findFollowUpRequestedByWorkspaceIds(workspaceIds);
    }

    /** 카드마다 첫 꼬리질문 시각 — 꼬리질문이 없는 카드는 키가 없다. */
    @Transactional(readOnly = true)
    public Map<Long, Instant> firstFollowUpQuestionAt(Collection<Long> cardIds) {
        if (cardIds.isEmpty()) {
            return Map.of();
        }
        return followUpQuestionRepository.findWithInstructorByDecisionCardIds(cardIds).stream()
                .collect(Collectors.toMap(question -> question.getDecisionCard().getId(), FollowUpQuestion::getCreatedAt,
                        BinaryOperator.minBy(Comparator.naturalOrder())));
    }

    /**
     * 리포트에 넣을 카드(#335 · P11) — 회고 리포트 만들기가 부른다(경로 팀원 · 본인 검사는 부른 쪽이 끝냈다). 모두 이 팀원의 카드이고
     * 배운 점 칸이 있어야 한다. 형식이 틀리거나 · 없거나 · 다른 팀원 것이거나 · 배운 점이 비었거나 · 중복이면 같은 {@code invalid}
     * — 개인 기록이라 존재를 구분하지 않는다.
     */
    @Transactional(readOnly = true)
    public List<DecisionCard> requireSelectableForReport(Long memberId, List<String> cardIds) {
        List<Long> ids = cardIds.stream().map(Ids::fromBody).toList();
        if (Set.copyOf(ids).size() != ids.size()) {
            throw new ApiException(ErrorCode.INVALID, REPORT_CARD_INVALID);
        }
        List<DecisionCard> cards = ids.isEmpty() ? List.of() : decisionCardRepository.findAllById(ids);
        if (cards.size() != ids.size() || cards.stream().anyMatch(card ->
                !card.getMember().getId().equals(memberId) || !card.isSelectableForReport())) {
            throw new ApiException(ErrorCode.INVALID, REPORT_CARD_INVALID);
        }
        return cards;
    }

    /** 카드 → 꼬리질문을 붙인 DTO, 주어진 순서 그대로 — 회고 리포트의 {@code decisionCards}. */
    @Transactional(readOnly = true)
    public List<DecisionCardDto> toDtos(List<DecisionCard> cards) {
        if (cards.isEmpty()) {
            return List.of();
        }
        Map<Long, List<FollowUpQuestion>> questions = followUpQuestionRepository
                .findWithInstructorByDecisionCardIds(cards.stream().map(DecisionCard::getId).toList()).stream()
                .collect(Collectors.groupingBy(question -> question.getDecisionCard().getId()));
        return cards.stream()
                .map(card -> DecisionCardDto.of(card, questions.getOrDefault(card.getId(), List.of())))
                .toList();
    }

    private DecisionCard requireCard(Long memberId, Long cardId) {
        return decisionCardRepository.findByIdAndMemberId(cardId, memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** 카드 재료 — 앱이 가진 것만, 모두 그 사무실 조건으로 읽는다. */
    private DecisionCardDraft.Materials materials(WorkspaceAccess access, Long memberId, Long submissionId) {
        Long workspaceId = access.workspaceId();
        String submissionApiId = Ids.toApi(submissionId);

        SubmissionDto submission = syncedItemService.listSubmissions(workspaceId).stream()
                .filter(s -> s.id().equals(submissionApiId))
                .findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        Set<String> linkedTaskIds = Set.copyOf(submission.linkedTaskIds());
        List<TaskDto> linkedTasks = syncedItemService.listTasks(workspaceId).stream()
                .filter(task -> linkedTaskIds.contains(task.id()))
                .toList();

        Set<String> linkedRequirementIds = requirementLinkService.listLinks(workspaceId).stream()
                .filter(link -> linkedTaskIds.contains(link.taskId()))
                .map(RequirementLinkDto::requirementId)
                .collect(Collectors.toSet());
        List<String> requirementTitles = requirementService.listAll(workspaceId).stream()
                .filter(requirement -> linkedRequirementIds.contains(requirement.id()))
                .map(requirement -> requirement.title())
                .toList();

        // 회차 번호 내림차순으로 오므로 뒤집어 오래된 회차부터
        List<EvaluationRoundDto> rounds = evaluationRoundService.listRounds(access, submissionId).reversed();
        List<DecisionCardDraft.Feedback> feedbacks = rounds.stream()
                .flatMap(round -> round.reasons().stream())
                .map(reason -> new DecisionCardDraft.Feedback(reason.verdict(), reason.reason()))
                .toList();

        List<DecisionCardDraft.Decision> decisions = agendaItemService.listAll(workspaceId).stream()
                .filter(item -> item.source() != null && SUBMISSION_SOURCE.equals(item.source().type())
                        && submissionApiId.equals(item.source().id()) && item.decision() != null)
                .map(AgendaItemDto::decision)
                .sorted(Comparator.comparing(AgendaDecisionDto::decidedAt))
                .map(decision -> new DecisionCardDraft.Decision(decision.conclusion(), decision.learning(),
                        meetingNotes(workspaceId, decision.meetingId())))
                .toList();

        List<DecisionCardDraft.Standup> standups = standupService.listByMember(workspaceId, memberId).stream()
                .map(standup -> new DecisionCardDraft.Standup(standup.date(), standup.blockers()))
                .toList();

        return new DecisionCardDraft.Materials(requirementTitles, feedbacks, decisions,
                linkedTasks.stream().map(TaskDto::githubIssueNumber).toList(), standups, submission.htmlUrl(),
                linkedTasks.stream().map(TaskDto::htmlUrl).toList());
    }

    private String meetingNotes(Long workspaceId, String meetingId) {
        return meetingId == null ? null : meetingService.notes(workspaceId, Long.valueOf(meetingId)).orElse(null);
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}
