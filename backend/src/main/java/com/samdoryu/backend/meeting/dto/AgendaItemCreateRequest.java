package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.meeting.domain.AgendaKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * `POST W/agenda-items` 요청 — CONTRACTS_API 「10」. {@code help_request} 종류는 Service가 {@code invalid}로 막는다(도움 요청은 「11」 전환으로만).
 *
 * @param sourceId issue → taskId, pr → submissionId, learning · other → null
 */
public record AgendaItemCreateRequest(
        @NotNull AgendaKind kind,
        String sourceId,
        @NotBlank @Size(max = 100) String title,
        @Size(max = 2000) String background,
        @Size(max = 2000) String tried,
        @Size(max = 2000) String unresolvedReason) {
}
