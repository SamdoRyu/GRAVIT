package com.samdoryu.backend.help.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * `POST W/help-requests/{helpRequestId}/close` 요청 — CONTRACTS_API 「11」.
 *
 * @param helpfulCommentId 도움이 된 코멘트(없으면 null) — 이 글의 코멘트 · 강사 답변 아님 · 요청자 본인 것 아님
 * @param learning 배운 점 1~200자
 */
public record HelpRequestCloseRequest(
        String helpfulCommentId,
        @NotBlank @Size(max = 200) String learning) {
}
