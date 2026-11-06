package com.samdoryu.backend.help.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** `POST W/help-requests` 요청 — CONTRACTS_API 「11」. */
public record HelpRequestCreateRequest(
        @NotBlank @Size(max = 2000) String content,
        String fromStandupId) {
}
