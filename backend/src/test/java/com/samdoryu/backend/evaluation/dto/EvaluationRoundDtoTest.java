package com.samdoryu.backend.evaluation.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 회차 응답 조립 — 익명(평가자 · 평가 ID · 시각 없음), 이유 순서, 현재 회차 집계, 내 평가만 따로(FR-LRN-01 · 02 · 03). */
class EvaluationRoundDtoTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String SHA = "3f2c9a1e5b7d4c6a8e0f1b2c3d4e5f6a7b8c9d0e";

    private final AppUser alice = user(7L, 1001L, "alice");
    private final AppUser bob = user(8L, 1002L, "bob");
    private final AppUser carol = user(9L, 1003L, "carol");
    private final EvaluationRound round = round();

    private static AppUser user(long id, long githubUserId, String login) {
        AppUser user = AppUser.github(githubUserId, login, login, null);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    private static EvaluationRound round() {
        Workspace workspace = Workspace.demo("시연", T0);
        Submission submission = Submission.builder().workspace(workspace).githubPrNumber(15).title("PR")
                .state(SubmissionState.OPEN).headSha(SHA).reviewRequestsJson("[]").reviewsJson("[]")
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
        EvaluationRound round = new EvaluationRound(submission, 1, SHA, RoundOpenedReason.NEW_PR, T0);
        ReflectionTestUtils.setField(round, "id", 21L);
        return round;
    }

    private Evaluation evaluation(long id, AppUser evaluator, Verdict verdict, String reason) {
        Evaluation evaluation = new Evaluation(round, evaluator, verdict, reason, T0.plusSeconds(id));
        ReflectionTestUtils.setField(evaluation, "id", id);
        return evaluation;
    }

    @Test
    void recommendReasonsComeFirstThenSavedOrderAndOnlyTheViewersOwnEvaluationIsSeparate() {
        List<Evaluation> evaluations = List.of(
                evaluation(1, alice, Verdict.NOT_RECOMMEND, "실패 응답 모양이 계약과 달라요"),
                evaluation(2, bob, Verdict.RECOMMEND, "세션 만료 처리가 명확해요"),
                evaluation(3, carol, Verdict.RECOMMEND, "테스트가 꼼꼼해요"));

        EvaluationRoundDto dto = EvaluationRoundDto.of(round, evaluations, bob.getId(), true);

        assertThat(dto.id()).isEqualTo("21");
        assertThat(dto.headSha()).isEqualTo(SHA);
        assertThat(dto.recommendCount()).isEqualTo(2);
        assertThat(dto.notRecommendCount()).isEqualTo(1);
        assertThat(dto.reasons()).extracting(EvaluationRoundDto.Reason::reason)
                .containsExactly("세션 만료 처리가 명확해요", "테스트가 꼼꼼해요", "실패 응답 모양이 계약과 달라요");
        assertThat(dto.myEvaluation()).isEqualTo(
                new EvaluationRoundDto.MyEvaluation(Verdict.RECOMMEND, "세션 만료 처리가 명확해요", T0.plusSeconds(2)));
        assertThat(dto.canEvaluate()).isTrue();
    }

    @Test
    void responseCarriesNoEvaluatorEvaluationIdOrTime() {
        EvaluationRoundDto dto = EvaluationRoundDto.of(round,
                List.of(evaluation(1, alice, Verdict.RECOMMEND, "좋아요")), carol.getId(), false);

        JsonNode json = JsonMapper.builder().build().valueToTree(dto);

        assertThat(json.get("reasons").get(0).propertyNames()).containsExactlyInAnyOrder("verdict", "reason");
        assertThat(json.get("myEvaluation").isNull()).isTrue();
        assertThat(json.toString()).doesNotContain("alice", "1001", "evaluator");
    }

    @Test
    void emptyRoundCountsZero() {
        EvaluationRoundDto dto = EvaluationRoundDto.of(round, List.of(), alice.getId(), false);

        assertThat(dto.recommendCount()).isZero();
        assertThat(dto.notRecommendCount()).isZero();
        assertThat(dto.reasons()).isEmpty();
        assertThat(dto.myEvaluation()).isNull();
    }
}
