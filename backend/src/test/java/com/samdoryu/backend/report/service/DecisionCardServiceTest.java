package com.samdoryu.backend.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.report.domain.FollowUpQuestion;
import com.samdoryu.backend.report.dto.DecisionCardDto.FollowUpQuestionDto;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import com.samdoryu.backend.meeting.dto.AgendaDecisionDto;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.dto.StandupDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.meeting.service.MeetingService;
import com.samdoryu.backend.meeting.service.StandupService;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.dto.DecisionCardDto;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.requirement.dto.RequirementDto;
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
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * #62 FR-REP-07 — 카드 만들기 · 읽기 · 고치기의 검사 순서와 재료 연결. 저장소 · 다른 패키지 Service는 가짜.
 * 9칸 규칙 자체는 {@code DecisionCardDraftTest}, 실제 HTTP · MySQL은 {@code DecisionCardIntegrationTest}.
 */
class DecisionCardServiceTest {

    private static final long WS = 3L;
    private static final long ALICE = 10L;
    private static final long BOB = 11L;
    private static final long PR = 20L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    private final DecisionCardRepository cards = mock(DecisionCardRepository.class);
    private final FollowUpQuestionRepository questions = mock(FollowUpQuestionRepository.class);
    private final WorkspaceService workspaceService = mock(WorkspaceService.class);
    private final SyncedItemService syncedItemService = mock(SyncedItemService.class);
    private final EvaluationRoundService evaluationRoundService = mock(EvaluationRoundService.class);
    private final RequirementService requirementService = mock(RequirementService.class);
    private final RequirementLinkService requirementLinkService = mock(RequirementLinkService.class);
    private final AgendaItemService agendaItemService = mock(AgendaItemService.class);
    private final MeetingService meetingService = mock(MeetingService.class);
    private final StandupService standupService = mock(StandupService.class);
    private final AppUserService appUserService = mock(AppUserService.class);
    private final DecisionCardService service = new DecisionCardService(cards, questions, workspaceService,
            syncedItemService, evaluationRoundService, requirementService, requirementLinkService, agendaItemService,
            meetingService, standupService, appUserService);

    private final WorkspaceAccess alice = new WorkspaceAccess(WS, 1L, WorkspaceRole.PARTICIPANT, ALICE);
    private final WorkspaceAccess bob = new WorkspaceAccess(WS, 2L, WorkspaceRole.PARTICIPANT, BOB);
    private final WorkspaceAccess instructor = new WorkspaceAccess(WS, 9L, WorkspaceRole.INSTRUCTOR, null);
    private Member aliceMember;
    private Submission submission;

    @BeforeEach
    void setUp() {
        aliceMember = member(ALICE);
        given(workspaceService.requireMember(WS, ALICE)).willReturn(aliceMember);
        submission = mock(Submission.class);
        given(submission.getId()).willReturn(PR);
        given(submission.getAuthorMember()).willReturn(aliceMember);
        given(submission.getState()).willReturn(SubmissionState.MERGED);
        given(syncedItemService.requireSubmission(WS, PR)).willReturn(submission);
    }

    private static Member member(long id) {
        Member member = mock(Member.class);
        given(member.getId()).willReturn(id);
        return member;
    }

    private static void assertError(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    // ---- 만들기: 검사 순서 ----

    @Test
    void aPathMemberOutsideTheWorkspaceIsNotFound() {
        given(workspaceService.requireMember(WS, 99L)).willThrow(new ApiException(ErrorCode.NOT_FOUND));

        assertError(() -> service.create(alice, 99L, PR), ErrorCode.NOT_FOUND);
    }

    @Test
    void anotherStudentOrAnInstructorCannotCreate() {
        assertError(() -> service.create(bob, ALICE, PR), ErrorCode.FORBIDDEN_ROLE);
        assertError(() -> service.create(instructor, ALICE, PR), ErrorCode.FORBIDDEN_ROLE);
        verify(syncedItemService, never()).requireSubmission(any(), any());
    }

    @Test
    void someoneElsesPrIsForbidden() {
        Member bobMember = member(BOB);
        given(submission.getAuthorMember()).willReturn(bobMember);
        assertError(() -> service.create(alice, ALICE, PR), ErrorCode.FORBIDDEN_ROLE);

        // 작성자가 팀원과 짝지어지지 않은 PR도 내 PR이 아니다
        given(submission.getAuthorMember()).willReturn(null);
        assertError(() -> service.create(alice, ALICE, PR), ErrorCode.FORBIDDEN_ROLE);
    }

    @Test
    void anOpenOrDraftPrIsAConflict() {
        for (SubmissionState state : List.of(SubmissionState.OPEN, SubmissionState.DRAFT)) {
            given(submission.getState()).willReturn(state);
            assertError(() -> service.create(alice, ALICE, PR), ErrorCode.CONFLICT);
        }
        verify(cards, never()).save(any());
    }

    @Test
    void aSecondCardForTheSamePrIsAConflict() {
        given(cards.existsByMemberIdAndSubmissionId(ALICE, PR)).willReturn(true);

        assertError(() -> service.create(alice, ALICE, PR), ErrorCode.CONFLICT);
        verify(cards, never()).save(any());
    }

    @Test
    void aConcurrentDuplicateIsAConflict() {
        stubNoMaterials();
        given(cards.save(any(DecisionCard.class))).willAnswer(invocation -> invocation.getArgument(0));
        doThrow(new DataIntegrityViolationException("uk_decision_card_member_submission")).when(cards).flush();

        assertError(() -> service.create(alice, ALICE, PR), ErrorCode.CONFLICT);
    }

    // ---- 만들기: 재료 ----

    private SubmissionDto submissionDto(List<String> linkedTaskIds) {
        SubmissionDto dto = mock(SubmissionDto.class);
        given(dto.id()).willReturn(String.valueOf(PR));
        given(dto.linkedTaskIds()).willReturn(linkedTaskIds);
        given(dto.htmlUrl()).willReturn("https://github.com/samdoryu/a/pull/15");
        return dto;
    }

    private static TaskDto task(String id, int number) {
        TaskDto dto = mock(TaskDto.class);
        given(dto.id()).willReturn(id);
        given(dto.githubIssueNumber()).willReturn(number);
        given(dto.htmlUrl()).willReturn("https://github.com/samdoryu/a/issues/" + number);
        return dto;
    }

    private static RequirementDto requirement(String id, String title) {
        RequirementDto dto = mock(RequirementDto.class);
        given(dto.id()).willReturn(id);
        given(dto.title()).willReturn(title);
        return dto;
    }

    private static EvaluationRoundDto round(EvaluationRoundDto.Reason... reasons) {
        EvaluationRoundDto dto = mock(EvaluationRoundDto.class);
        given(dto.reasons()).willReturn(List.of(reasons));
        return dto;
    }

    private static AgendaItemDto agenda(String sourceType, String sourceId, String conclusion, String learning,
            String meetingId, Instant decidedAt) {
        AgendaItemDto dto = mock(AgendaItemDto.class);
        given(dto.source()).willReturn(sourceType == null ? null : new AgendaItemDto.Source(sourceType, sourceId));
        if (conclusion != null) {
            AgendaDecisionDto decision = mock(AgendaDecisionDto.class);
            given(decision.conclusion()).willReturn(conclusion);
            given(decision.learning()).willReturn(learning);
            given(decision.meetingId()).willReturn(meetingId);
            given(decision.decidedAt()).willReturn(decidedAt);
            given(dto.decision()).willReturn(decision);
        }
        return dto;
    }

    private void stubNoMaterials() {
        // 가짜 DTO는 given(...) 밖에서 먼저 만든다 — 안에서 만들면 Mockito가 stub 중첩으로 본다
        SubmissionDto pr = submissionDto(List.of());
        given(syncedItemService.listSubmissions(WS)).willReturn(List.of(pr));
        given(syncedItemService.listTasks(WS)).willReturn(List.of());
        given(requirementLinkService.listLinks(WS)).willReturn(List.of());
        given(requirementService.listAll(WS)).willReturn(List.of());
        given(evaluationRoundService.listRounds(alice, PR)).willReturn(List.of());
        given(agendaItemService.listAll(WS)).willReturn(List.of());
        given(standupService.listByMember(WS, ALICE)).willReturn(List.of());
    }

    @Test
    void createFillsTheCellsFromTheWorkspacesMaterials() {
        // 가짜 DTO는 given(...) 밖에서 먼저 만든다 — 안에서 만들면 Mockito가 stub 중첩으로 본다
        SubmissionDto pr = submissionDto(List.of("31"));
        List<TaskDto> taskList = List.of(task("30", 11), task("31", 12));
        List<RequirementDto> requirements = List.of(requirement("40", "GitHub 로그인"), requirement("41", "다른 요구사항"));
        // 회차 번호 내림차순(현재 회차가 처음)으로 온다 → 카드는 오래된 회차부터
        List<EvaluationRoundDto> rounds = List.of(
                round(new EvaluationRoundDto.Reason(Verdict.RECOMMEND, "고친 뒤 좋아요")),
                round(new EvaluationRoundDto.Reason(Verdict.NOT_RECOMMEND, "실패 응답 모양이 달라요")));
        List<AgendaItemDto> agendaItems = List.of(
                agenda("submission", "20", "다시 평가받는다", null, "6", T0.plusSeconds(120)),
                agenda("submission", "20", "에러 응답을 맞춘다", "에러는 한 곳에서", "5", T0.plusSeconds(60)),
                agenda("submission", "21", "다른 PR 결정", null, "5", T0),
                agenda("task", "31", "이슈 안건", null, "5", T0),
                agenda("submission", "20", null, null, null, null));

        given(syncedItemService.listSubmissions(WS)).willReturn(List.of(pr));
        given(syncedItemService.listTasks(WS)).willReturn(taskList);
        given(requirementLinkService.listLinks(WS)).willReturn(List.of(
                new RequirementLinkDto("1", "40", "31", T0), new RequirementLinkDto("2", "41", "30", T0)));
        given(requirementService.listAll(WS)).willReturn(requirements);
        given(evaluationRoundService.listRounds(alice, PR)).willReturn(rounds);
        given(agendaItemService.listAll(WS)).willReturn(agendaItems);
        given(meetingService.notes(WS, 5L)).willReturn(Optional.of("전역 예외 처리로 가자"));
        given(meetingService.notes(WS, 6L)).willReturn(Optional.empty());
        given(standupService.listByMember(WS, ALICE)).willReturn(List.of(
                new StandupDto("1", "10", LocalDate.of(2026, 11, 2), "어제", "#12 에러 모양을 모르겠다", T0),
                new StandupDto("2", "10", LocalDate.of(2026, 11, 3), "어제", "#11 은 다른 PR", T0)));
        given(cards.save(any(DecisionCard.class))).willAnswer(invocation -> {
            DecisionCard card = invocation.getArgument(0);
            ReflectionTestUtils.setField(card, "id", 8L);
            return card;
        });

        service.create(alice, ALICE, PR);

        ArgumentCaptor<DecisionCard> saved = ArgumentCaptor.forClass(DecisionCard.class);
        verify(cards).save(saved.capture());
        assertThat(saved.getValue().getCells()).isEqualTo(new DecisionCardCells(
                "GitHub 로그인",
                null,
                "비추천: 실패 응답 모양이 달라요\n추천: 고친 뒤 좋아요",
                "에러 응답을 맞춘다\n배운 점: 에러는 한 곳에서\n다시 평가받는다",
                null,
                "전역 예외 처리로 가자",
                "2026-11-02: #12 에러 모양을 모르겠다",
                null,
                "https://github.com/samdoryu/a/pull/15\nhttps://github.com/samdoryu/a/issues/12"));
        assertThat(saved.getValue().getFollowUpRequestedAt()).isNull();
    }

    // ---- 읽기 ----

    @Test
    void theOwnerAndTheInstructorReadAnotherStudentCannot() {
        given(cards.findByMemberIdOrderByCreatedAtDescIdDesc(ALICE)).willReturn(List.of());

        assertThat(service.list(alice, ALICE)).isEmpty();
        assertThat(service.list(instructor, ALICE)).isEmpty();
        assertError(() -> service.list(bob, ALICE), ErrorCode.FORBIDDEN_ROLE);
    }

    // ---- 고치기 ----

    private DecisionCard existingCard() {
        DecisionCard card = new DecisionCard(aliceMember, submission, DecisionCardCells.EMPTY, T0);
        ReflectionTestUtils.setField(card, "id", 8L);
        given(cards.findByIdAndMemberId(8L, ALICE)).willReturn(Optional.of(card));
        given(questions.findWithInstructorByDecisionCardIds(List.of(8L))).willReturn(List.of());
        return card;
    }

    private static DecisionCardCells cellsWithLearning(String learning) {
        return new DecisionCardCells("목표", null, null, null, null, null, null, learning, null);
    }

    /** #335 — 「확인함」 단계가 없다. 저장만 하고, 배운 점 칸이 있으면 리포트를 만들 때 고를 수 있다. */
    @Test
    void theOwnerEditsCellsAndALearningMakesItSelectable() {
        DecisionCard card = existingCard();

        DecisionCardDto draft = service.update(alice, ALICE, 8L, cellsWithLearning(null));
        assertThat(draft.cells().goal()).isEqualTo("목표");
        assertThat(draft.updatedAt()).isAfter(T0);
        assertThat(card.isSelectableForReport()).isFalse();

        service.update(alice, ALICE, 8L, cellsWithLearning(" "));
        assertThat(card.isSelectableForReport()).isFalse();
        service.update(alice, ALICE, 8L, cellsWithLearning("배운 점"));
        assertThat(card.isSelectableForReport()).isTrue();
    }

    /** 리포트에 넣을 카드 — 본인 카드이고 배운 점이 있어야 한다. 아니면(없음 · 남의 것 · 빈 배운 점 · 중복 · 형식) 모두 같은 invalid. */
    @Test
    void cardsForAReportMustBeMineWithALearning() {
        DecisionCard mine = new DecisionCard(aliceMember, submission, cellsWithLearning("배운 점"), T0);
        ReflectionTestUtils.setField(mine, "id", 8L);
        DecisionCard noLearning = new DecisionCard(aliceMember, submission, cellsWithLearning(null), T0);
        ReflectionTestUtils.setField(noLearning, "id", 9L);
        DecisionCard bobs = new DecisionCard(member(BOB), submission, cellsWithLearning("배운 점"), T0);
        ReflectionTestUtils.setField(bobs, "id", 10L);
        given(cards.findAllById(List.of(8L))).willReturn(List.of(mine));
        given(cards.findAllById(List.of(9L))).willReturn(List.of(noLearning));
        given(cards.findAllById(List.of(10L))).willReturn(List.of(bobs));
        given(cards.findAllById(List.of(11L))).willReturn(List.of());

        assertThat(service.requireSelectableForReport(ALICE, List.of())).isEmpty();
        assertThat(service.requireSelectableForReport(ALICE, List.of("8"))).containsExactly(mine);
        for (List<String> bad : List.of(List.of("9"), List.of("10"), List.of("11"), List.of("8", "8"), List.of("x"))) {
            assertError(() -> service.requireSelectableForReport(ALICE, bad), ErrorCode.INVALID);
        }
    }

    @Test
    void onlyTheOwnerEditsAndAnotherMembersCardIsNotFound() {
        existingCard();

        assertError(() -> service.update(bob, ALICE, 8L, cellsWithLearning(null)), ErrorCode.FORBIDDEN_ROLE);
        assertError(() -> service.update(instructor, ALICE, 8L, cellsWithLearning(null)),
                ErrorCode.FORBIDDEN_ROLE);
        given(cards.findByIdAndMemberId(9L, ALICE)).willReturn(Optional.empty());
        assertError(() -> service.update(alice, ALICE, 9L, cellsWithLearning(null)), ErrorCode.NOT_FOUND);
    }

    // ---- #59 꼬리질문 요청 · 쓰기 ----

    @Test
    void theOwnerRequestsAFollowUpOnceAndAgainKeepsTheFirstTime() {
        DecisionCard card = existingCard();

        DecisionCardDto requested = service.requestFollowUp(alice, ALICE, 8L);
        assertThat(requested.followUpRequested()).isTrue();
        Instant first = requested.followUpRequestedAt();
        assertThat(first).isNotNull();

        assertThat(service.requestFollowUp(alice, ALICE, 8L).followUpRequestedAt()).isEqualTo(first);
        // 요청은 9칸을 건드리지 않는다
        assertThat(card.getCells()).isEqualTo(DecisionCardCells.EMPTY);
    }

    @Test
    void onlyTheOwnerRequestsAFollowUp() {
        DecisionCard card = existingCard();

        assertError(() -> service.requestFollowUp(bob, ALICE, 8L), ErrorCode.FORBIDDEN_ROLE);
        assertError(() -> service.requestFollowUp(instructor, ALICE, 8L), ErrorCode.FORBIDDEN_ROLE);
        given(cards.findByIdAndMemberId(9L, ALICE)).willReturn(Optional.empty());
        assertError(() -> service.requestFollowUp(alice, ALICE, 9L), ErrorCode.NOT_FOUND);
        assertThat(card.getFollowUpRequestedAt()).isNull();
    }

    @Test
    void theInstructorWritesAFollowUpQuestionOnARequestedCard() {
        DecisionCard card = existingCard();
        card.requestFollowUp(T0.plusSeconds(60));
        AppUser teacher = AppUser.github(9001L, "teacher", "강사", null);
        ReflectionTestUtils.setField(teacher, "id", 9L);
        given(appUserService.require(9L)).willReturn(teacher);
        given(questions.save(any(FollowUpQuestion.class))).willAnswer(invocation -> {
            FollowUpQuestion question = invocation.getArgument(0);
            ReflectionTestUtils.setField(question, "id", 30L);
            return question;
        });
        Instant updatedBefore = card.getUpdatedAt();

        FollowUpQuestionDto question = service.addFollowUpQuestion(instructor, ALICE, 8L, "이 결정을 다시 한다면?");

        assertThat(question.id()).isEqualTo("30");
        assertThat(question.body()).isEqualTo("이 결정을 다시 한다면?");
        assertThat(question.instructor().userId()).isEqualTo("9");
        assertThat(question.instructor().githubLogin()).isEqualTo("teacher");
        assertThat(question.createdAt()).isAfter(T0);
        // 9칸과 따로 붙는다 — 카드의 수정 시각 · 확인 여부는 그대로
        assertThat(card.getUpdatedAt()).isEqualTo(updatedBefore);
        assertThat(card.getCells()).isEqualTo(DecisionCardCells.EMPTY);
    }

    @Test
    void aCardWithoutAFollowUpRequestIsForbiddenForTheInstructor() {
        existingCard();

        assertError(() -> service.addFollowUpQuestion(instructor, ALICE, 8L, "질문"), ErrorCode.FORBIDDEN_ROLE);
        verify(questions, never()).save(any());
    }

    @Test
    void onlyTheAssignedInstructorWritesFollowUpQuestions() {
        DecisionCard card = existingCard();
        card.requestFollowUp(T0.plusSeconds(60));

        // 본인 · 다른 학생도 꼬리질문은 못 쓴다(강사가 직접 쓴다 — FR-REP-11)
        assertError(() -> service.addFollowUpQuestion(alice, ALICE, 8L, "질문"), ErrorCode.FORBIDDEN_ROLE);
        assertError(() -> service.addFollowUpQuestion(bob, ALICE, 8L, "질문"), ErrorCode.FORBIDDEN_ROLE);
        // 강사라도 다른 팀원의 카드 ID면 404
        given(cards.findByIdAndMemberId(9L, ALICE)).willReturn(Optional.empty());
        assertError(() -> service.addFollowUpQuestion(instructor, ALICE, 9L, "질문"), ErrorCode.NOT_FOUND);
        verify(questions, never()).save(any());
    }
}
