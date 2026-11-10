package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.activity.domain.ActivityConfirmation;
import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.domain.ActivityRecord;
import com.samdoryu.backend.activity.domain.PeerFeedback;
import com.samdoryu.backend.activity.repository.ActivityConfirmationRepository;
import com.samdoryu.backend.activity.repository.ActivityRecordRepository;
import com.samdoryu.backend.activity.repository.PeerFeedbackRepository;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.domain.FollowUpQuestion;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.report.repository.RetroReportRepository;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * #7 T4-c — 요구사항 · 평가 · 강사 피드백 · 마감 · 카드 · 리포트 · 활동 · 컨벤션 라이브러리 테이블(V2)을
 * 실제 MySQL로 확인한다(CONTRACTS.md 「2」 · 「3」 무결성 제약). 테스트마다 트랜잭션을 되돌린다.
 */
@SpringBootTest
@Transactional
class FeatureSchemaIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00.123456Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired SubmissionRepository submissions;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired RequirementRepository requirements;
    @Autowired RequirementLinkRepository requirementLinks;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired EvaluationRepository evaluations;
    @Autowired InstructorFeedbackRepository instructorFeedbacks;
    @Autowired TaskDueDateRepository dueDates;
    @Autowired DecisionCardRepository cards;
    @Autowired FollowUpQuestionRepository followUps;
    @Autowired RetroReportRepository reports;
    @Autowired ActivityRecordRepository activities;
    @Autowired ActivityConfirmationRepository confirmations;
    @Autowired PeerFeedbackRepository peerFeedbacks;
    @Autowired ConventionLibraryItemRepository library;

    private AppUser aliceUser;
    private AppUser instructor;
    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Task task;
    private Submission pr;

    @BeforeEach
    void setUp() {
        aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        instructor = users.saveAndFlush(AppUser.github(9001L, "teacher", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        task = tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(1).title("이슈").state(TaskState.OPEN)
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
        pr = submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(2).title("PR")
                .authorGithubUserId(1001L).authorMember(alice).state(SubmissionState.OPEN).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                .githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
    }

    private EvaluationRound round(int number) {
        return rounds.saveAndFlush(new EvaluationRound(pr, number, SHA, RoundOpenedReason.NEW_PR, T0));
    }

    @Test
    void savesAndReadsBackEveryFeatureEntity() {
        Requirement req = requirements.saveAndFlush(
                new Requirement(ws, "FR-AUTH-01", "FR-AUTH-01 GitHub 로그인", "GitHub 로그인", 0, T0));
        requirementLinks.saveAndFlush(new RequirementLink(req, task, aliceUser, T0));
        EvaluationRound round = round(1);
        evaluations.saveAndFlush(new Evaluation(round, users.findByGithubUserId(1002L).orElseThrow(),
                Verdict.NOT_RECOMMEND, "  실패 응답 모양이 계약과 달라요  ", T0));
        AgendaItem agenda = agendaItems.saveAndFlush(AgendaItem.forSubmission(ws, pr, round.getId(), "응답 모양",
                null, null, null, alice, T0));
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(agenda, instructor, "좋은 결정이에요", T0));
        dueDates.saveAndFlush(new TaskDueDate(task, LocalDate.of(2026, 11, 10), aliceUser, T0));
        DecisionCard card = cards.saveAndFlush(new DecisionCard(alice, pr, DecisionCardCells.EMPTY, T0));
        followUps.saveAndFlush(new FollowUpQuestion(card, instructor, "다른 방법은 없었나요?", T0));
        reports.saveAndFlush(new RetroReport(alice, ReportKind.MIDTERM, "중간 회고", "느낀 점", java.util.List.of(card),
                T0));
        ActivityRecord activity = activities.saveAndFlush(
                new ActivityRecord(alice, ActivityKind.RESEARCH, "OAuth 조사", 90, T0));
        confirmations.saveAndFlush(new ActivityConfirmation(activity, bob, T0));
        peerFeedbacks.saveAndFlush(new PeerFeedback(ws, alice, bob, "2026-W45", "고마워요", "더 일찍 공유", T0));
        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.BRANCH_NAME, "브랜치 이름",
                "<type>/<이슈번호>-<설명>", null, instructor, T0));
        em.clear();

        Requirement readReq = requirements.findByIdAndWorkspaceId(req.getId(), ws.getId()).orElseThrow();
        assertThat(readReq.getStatus()).isEqualTo(RequirementStatus.ACTIVE);
        assertThat(requirements.findByIdAndWorkspaceId(req.getId(), otherWs.getId())).isEmpty();
        assertThat(requirementLinks.findByRequirementIdAndTaskId(req.getId(), task.getId())).isPresent();

        assertThat(rounds.findFirstBySubmissionIdOrderByRoundNumberDesc(pr.getId())).get()
                .extracting(r -> r.getRoundNumber()).isEqualTo(1);
        assertThat(evaluations.findByRoundIdOrderByIdAsc(round.getId())).singleElement()
                .extracting(e -> e.getReason()).isEqualTo("실패 응답 모양이 계약과 달라요");
        assertThat(agendaItems.findById(agenda.getId()).orElseThrow().getEvaluationRoundId())
                .isEqualTo(round.getId());
        assertThat(instructorFeedbacks.findByAgendaItemIdOrderByCreatedAtAsc(agenda.getId())).hasSize(1);
        assertThat(dueDates.findByTaskId(task.getId()).orElseThrow().getDueDate())
                .isEqualTo(LocalDate.of(2026, 11, 10));

        DecisionCard readCard = cards.findByIdAndMemberId(card.getId(), alice.getId()).orElseThrow();
        assertThat(readCard.getCells()).isEqualTo(DecisionCardCells.EMPTY);
        assertThat(cards.findByIdAndMemberId(card.getId(), bob.getId())).isEmpty();
        assertThat(followUps.findByDecisionCardIdOrderByCreatedAtAsc(card.getId())).hasSize(1);
        assertThat(reports.findByMemberIdOrderByCreatedAtDesc(alice.getId())).singleElement()
                .extracting(r -> r.getKind()).isEqualTo(ReportKind.MIDTERM);
        assertThat(reports.findByMemberIdOrderByCreatedAtDesc(alice.getId()).get(0).getDecisionCards())
                .extracting(c -> c.getId()).containsExactly(card.getId());

        assertThat(activities.findByIdAndAuthorWorkspaceId(activity.getId(), otherWs.getId())).isEmpty();
        assertThat(confirmations.existsByActivityRecordIdAndConfirmerId(activity.getId(), bob.getId())).isTrue();
        assertThat(peerFeedbacks.findByWorkspaceIdAndRecipientIdOrderByCreatedAtDesc(ws.getId(), bob.getId()))
                .singleElement().extracting(f -> f.getThanks()).isEqualTo("고마워요");
        assertThat(library.findAllByOrderByTargetAscNameAsc()).singleElement()
                .extracting(i -> i.getContent()).isEqualTo("<type>/<이슈번호>-<설명>");
    }

    @Test
    void decisionCardCellsRoundTrip() {
        DecisionCard card = cards.saveAndFlush(new DecisionCard(alice, pr, DecisionCardCells.EMPTY, T0));
        DecisionCardCells cells = new DecisionCardCells("목표", null, "비추천 이유", null, null, "왜", null, "배운 점", "#2");
        card.edit(cells, T0.plusSeconds(60));
        cards.saveAndFlush(card);
        em.clear();

        DecisionCard read = cards.findById(card.getId()).orElseThrow();
        assertThat(read.getCells()).isEqualTo(cells);
        assertThat(read.getUpdatedAt()).isEqualTo(T0.plusSeconds(60));
    }

    @Nested
    class UniqueConstraints {

        @Test
        void requirementSourceKeyIsUniquePerWorkspaceButNullsMayRepeat() {
            requirements.saveAndFlush(new Requirement(ws, null, "로그인", "로그인", 0, T0));
            requirements.saveAndFlush(new Requirement(ws, null, "로그인", "로그인", 1, T0));
            requirements.saveAndFlush(new Requirement(ws, "FR-1", "FR-1 a", "a", 2, T0));
            requirements.saveAndFlush(new Requirement(otherWs, "FR-1", "FR-1 a", "a", 0, T0));

            assertThatThrownBy(() -> requirements.saveAndFlush(new Requirement(ws, "FR-1", "FR-1 b", "b", 3, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void requirementLinkIsUniquePerRequirementAndTask() {
            Requirement req = requirements.saveAndFlush(new Requirement(ws, null, "a", "a", 0, T0));
            requirementLinks.saveAndFlush(new RequirementLink(req, task, aliceUser, T0));

            assertThatThrownBy(() -> requirementLinks.saveAndFlush(new RequirementLink(req, task, aliceUser, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void roundNumberIsUniquePerSubmissionAndSameHeadShaMayRepeat() {
            round(1);
            rounds.saveAndFlush(new EvaluationRound(pr, 2, SHA, RoundOpenedReason.MEETING_REEVALUATE, T0));

            assertThatThrownBy(() -> round(2)).isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneEvaluationPerRoundAndEvaluator() {
            EvaluationRound round = round(1);
            evaluations.saveAndFlush(new Evaluation(round, instructor, Verdict.RECOMMEND, "좋아요", T0));

            assertThatThrownBy(() -> evaluations.saveAndFlush(
                    new Evaluation(round, instructor, Verdict.NOT_RECOMMEND, "다시", T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneDueDatePerTask() {
            dueDates.saveAndFlush(new TaskDueDate(task, LocalDate.of(2026, 11, 10), aliceUser, T0));

            assertThatThrownBy(() -> dueDates.saveAndFlush(
                    new TaskDueDate(task, LocalDate.of(2026, 11, 11), aliceUser, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneDecisionCardPerMemberAndSubmission() {
            cards.saveAndFlush(new DecisionCard(alice, pr, DecisionCardCells.EMPTY, T0));
            cards.saveAndFlush(new DecisionCard(bob, pr, DecisionCardCells.EMPTY, T0));

            assertThatThrownBy(() -> cards.saveAndFlush(new DecisionCard(alice, pr, DecisionCardCells.EMPTY, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneConfirmationPerActivityAndConfirmer() {
            ActivityRecord activity = activities.saveAndFlush(
                    new ActivityRecord(alice, ActivityKind.DESIGN, "설계", 30, T0));
            confirmations.saveAndFlush(new ActivityConfirmation(activity, bob, T0));

            assertThatThrownBy(() -> confirmations.saveAndFlush(new ActivityConfirmation(activity, bob, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void onePeerFeedbackPerAuthorRecipientAndWeek() {
            peerFeedbacks.saveAndFlush(new PeerFeedback(ws, alice, bob, "2026-W45", "a", "b", T0));
            peerFeedbacks.saveAndFlush(new PeerFeedback(ws, alice, bob, "2026-W46", "a", "b", T0));
            peerFeedbacks.saveAndFlush(new PeerFeedback(ws, bob, alice, "2026-W45", "a", "b", T0));

            assertThatThrownBy(() -> peerFeedbacks.saveAndFlush(
                    new PeerFeedback(ws, alice, bob, "2026-W45", "c", "d", T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    /** DB CHECK · 외래키 제약 — Entity를 거치지 않은 쓰기도 막는다. */
    @Nested
    class DatabaseConstraints {

        @Test
        void agendaRoundMustExist() {
            AgendaItem agenda = agendaItems.saveAndFlush(AgendaItem.forSubmission(ws, pr, null, "t", null, null, null,
                    alice, T0));

            assertThatThrownBy(() -> jdbc.update("UPDATE agenda_item SET evaluation_round_id = 999999 WHERE id = ?",
                    agenda.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void blankEvaluationReasonIsRejected() {
            EvaluationRound round = round(1);

            assertThatThrownBy(() -> jdbc.update("INSERT INTO evaluation (round_id, evaluator_user_id, verdict, reason,"
                    + " updated_at) VALUES (?, ?, 'RECOMMEND', '   ', '2026-11-05 03:00:00')",
                    round.getId(), instructor.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void peerFeedbackCannotTargetSelf() {
            assertThatThrownBy(() -> jdbc.update("INSERT INTO peer_feedback (workspace_id, author_member_id,"
                    + " recipient_member_id, week, thanks, improve, created_at)"
                    + " VALUES (?, ?, ?, '2026-W45', 'a', 'b', '2026-11-05 03:00:00')",
                    ws.getId(), alice.getId(), alice.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void activityDurationIsInRange() {
            assertThatThrownBy(() -> jdbc.update("INSERT INTO activity_record (author_member_id, kind, content,"
                    + " duration_minutes, created_at) VALUES (?, 'DESIGN', 'x', 0, '2026-11-05 03:00:00')",
                    alice.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void confirmedCardNeedsLearning() {
            DecisionCard card = cards.saveAndFlush(new DecisionCard(alice, pr, DecisionCardCells.EMPTY, T0));

            assertThatThrownBy(() -> jdbc.update(
                    "UPDATE decision_card SET confirmed_at = '2026-11-05 03:00:00' WHERE id = ?", card.getId()))
                    .isInstanceOf(DataAccessException.class);
        }
    }
}
