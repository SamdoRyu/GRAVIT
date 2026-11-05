package com.samdoryu.backend.evaluation.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.dto.EvaluateRequest;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.service.SyncedItemService;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

/** #20 FR-LRN-02 — 추천 · 비추천 모두 이유 필수. 다른 검사 · 저장보다 먼저 {@code invalid}로 거절한다. */
class EvaluationReasonTest {

    private final EvaluationRoundRepository rounds = mock(EvaluationRoundRepository.class);
    private final EvaluationRepository evaluations = mock(EvaluationRepository.class);
    private final SyncedItemService syncedItems = mock(SyncedItemService.class);
    private final EvaluationRoundService service = new EvaluationRoundService(rounds, evaluations, syncedItems,
            mock(AppUserService.class), mock(WorkspaceEventHub.class));
    private final WorkspaceAccess member = new WorkspaceAccess(3L, 7L, WorkspaceRole.PARTICIPANT, 12L);

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "\n\t"})
    void missingOrBlankReasonIsInvalid(String reason) {
        for (Verdict verdict : Verdict.values()) {
            assertInvalid(new EvaluateRequest("21", verdict, reason));
        }
    }

    @Test
    void reasonLongerThan200AfterTrimmingIsInvalid() {
        assertInvalid(new EvaluateRequest("21", Verdict.RECOMMEND, " " + "가".repeat(201) + " "));
    }

    private void assertInvalid(EvaluateRequest request) {
        assertThatThrownBy(() -> service.evaluate(member, 9L, request, Instant.parse("2026-11-05T03:00:00Z")))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID);
        verifyNoInteractions(rounds, evaluations, syncedItems);
    }
}
