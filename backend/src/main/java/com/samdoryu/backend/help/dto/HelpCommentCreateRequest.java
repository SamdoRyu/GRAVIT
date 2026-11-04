package com.samdoryu.backend.help.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** `POST W/help-requests/{helpRequestId}/comments` 요청 — CONTRACTS_API 「11」. */
public record HelpCommentCreateRequest(@NotNull @Size(min = 1, max = 2000) String content) {
}
