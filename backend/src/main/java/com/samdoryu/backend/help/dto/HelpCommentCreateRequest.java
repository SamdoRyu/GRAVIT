package com.samdoryu.backend.help.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** `POST W/help-requests/{helpRequestId}/comments` 요청 — CONTRACTS_API 「11」. */
public record HelpCommentCreateRequest(@NotBlank @Size(max = 2000) String content) {
}
