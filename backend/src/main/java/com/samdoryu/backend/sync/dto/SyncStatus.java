package com.samdoryu.backend.sync.dto;

import com.samdoryu.backend.sync.domain.SyncState;
import java.time.Instant;
import java.util.List;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code GET W/sync-status} · {@code POST W/sync} 응답과 SSE {@code sync} 이벤트 — CONTRACTS_API.md 「4」 SyncStatus.
 *
 * @param state {@code idle} · {@code running}
 * @param lastFailureCode {@code github_unauthorized} · {@code github_rate_limited} · {@code unavailable} · null
 * @param isFailing 마지막 실패가 마지막 성공보다 나중 — 상단 바 실패 표시(FR-GH-05)
 * @param specWarnings 마지막 명세 문서 읽기의 경고(#14). 읽은 적 없으면 빈 배열
 */
public record SyncStatus(String state, Instant lastSucceededAt, Instant lastFailedAt, String lastFailureCode,
        String lastFailureMessage, boolean isFailing, List<SpecWarning> specWarnings) {

    public static final String IDLE = "idle";
    public static final String RUNNING = "running";

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<SpecWarning>> WARNINGS = new TypeReference<>() {
    };

    public SyncStatus {
        specWarnings = specWarnings == null ? List.of() : List.copyOf(specWarnings);
    }

    public static SyncStatus of(SyncState state) {
        List<SpecWarning> warnings = state.getSpecWarningsJson() == null
                ? List.of() : JSON.readValue(state.getSpecWarningsJson(), WARNINGS);
        return new SyncStatus(state.isRunning() ? RUNNING : IDLE, state.getLastSucceededAt(),
                state.getLastFailedAt(), state.getLastFailureCode() == null ? null : state.getLastFailureCode().code(),
                state.getLastFailureMessage(), state.isFailing(), warnings);
    }
}
