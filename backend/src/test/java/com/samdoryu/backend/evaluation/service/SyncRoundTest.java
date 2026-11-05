package com.samdoryu.backend.evaluation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 동기화가 여는 회차(CONTRACTS.md 「3」 평가 회차 · #19 · #46) — 새 PR은 1회차({@code new_pr}), 열린 PR의 새 커밋은 다음 회차
 * ({@code new_commit})와 이전 회차 닫기. 저장소는 가짜 — 실제 MySQL 흐름은 {@code IssuePullRequestSyncIntegrationTest}.
 */
class SyncRoundTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Instant T1 = T0.plusSeconds(3600);
    private static final String SHA1 = "a".repeat(40);
    private static final String SHA2 = "b".repeat(40);

    private final EvaluationRoundRepository rounds = mock(EvaluationRoundRepository.class);
    private final EvaluationRoundService service = new EvaluationRoundService(rounds, mock(EvaluationRepository.class),
            mock(SyncedItemService.class), mock(AppUserService.class), mock(WorkspaceEventHub.class));

    private static Submission pr(SubmissionState state, String sha) {
        Submission submission = Submission.builder().workspace(Workspace.demo("시연", T0)).githubPrNumber(3)
                .title("PR").state(state).headSha(sha).reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]")
                .githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
        ReflectionTestUtils.setField(submission, "id", 9L);
        return submission;
    }

    private EvaluationRound current(Submission submission, int number, String sha) {
        EvaluationRound round = new EvaluationRound(submission, number, sha, RoundOpenedReason.NEW_PR, T0);
        given(rounds.findFirstBySubmissionIdOrderByRoundNumberDesc(9L)).willReturn(Optional.of(round));
        return round;
    }

    private EvaluationRound saved() {
        ArgumentCaptor<EvaluationRound> captor = ArgumentCaptor.forClass(EvaluationRound.class);
        verify(rounds).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void newPullRequestGetsTheFirstRound() {
        given(rounds.findFirstBySubmissionIdOrderByRoundNumberDesc(9L)).willReturn(Optional.empty());

        service.openRoundForSync(pr(SubmissionState.OPEN, SHA1), T1);

        EvaluationRound first = saved();
        assertThat(first.getRoundNumber()).isEqualTo(1);
        assertThat(first.getOpenedReason()).isEqualTo(RoundOpenedReason.NEW_PR);
        assertThat(first.getHeadSha()).isEqualTo(SHA1);
        assertThat(first.getOpenedAt()).isEqualTo(T1);
    }

    @Test
    void newCommitOnAnOpenOrDraftPullRequestOpensTheNextRoundAndClosesThePrevious() {
        for (SubmissionState state : new SubmissionState[] {SubmissionState.OPEN, SubmissionState.DRAFT}) {
            EvaluationRound previous = current(pr(state, SHA2), 2, SHA1);

            service.openRoundForSync(pr(state, SHA2), T1);

            assertThat(previous.getClosedAt()).isEqualTo(T1);
            ArgumentCaptor<EvaluationRound> captor = ArgumentCaptor.forClass(EvaluationRound.class);
            verify(rounds, org.mockito.Mockito.atLeastOnce()).save(captor.capture());
            EvaluationRound next = captor.getValue();
            assertThat(next.getRoundNumber()).isEqualTo(3);
            assertThat(next.getOpenedReason()).isEqualTo(RoundOpenedReason.NEW_COMMIT);
            assertThat(next.getHeadSha()).isEqualTo(SHA2);
            assertThat(next.getClosedAt()).isNull();
        }
    }

    /** 다시 동기화하거나 회의 재평가로 같은 커밋에 회차가 열린 뒤 — 새 회차를 열지 않는다. */
    @Test
    void sameCommitOpensNothing() {
        EvaluationRound round = current(pr(SubmissionState.OPEN, SHA1), 2, SHA1);

        service.openRoundForSync(pr(SubmissionState.OPEN, SHA1), T1);

        assertThat(round.getClosedAt()).isNull();
        verify(rounds, never()).save(any());
    }

    /** 머지 · 닫힌 PR은 평가를 받지 않는다 — 커밋이 바뀌어도 새 회차를 열지 않고 마지막 회차를 그대로 보인다. */
    @Test
    void mergedOrClosedPullRequestOpensNoNewCommitRound() {
        for (SubmissionState state : new SubmissionState[] {SubmissionState.MERGED, SubmissionState.CLOSED}) {
            EvaluationRound round = current(pr(state, SHA2), 1, SHA1);

            service.openRoundForSync(pr(state, SHA2), T1);

            assertThat(round.getClosedAt()).isNull();
        }
        verify(rounds, never()).save(any());
    }
}
