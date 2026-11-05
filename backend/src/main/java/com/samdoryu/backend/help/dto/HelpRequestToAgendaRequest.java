package com.samdoryu.backend.help.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** `POST W/help-requests/{id}/to-agenda` 요청 — CONTRACTS_API 「11」. 직접 전환과 48시간 후보 확정이 같다. */
public record HelpRequestToAgendaRequest(@NotNull @Size(min = 1, max = 100) String title) {
}
