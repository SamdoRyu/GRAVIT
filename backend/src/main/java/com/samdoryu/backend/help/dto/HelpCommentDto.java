package com.samdoryu.backend.help.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import java.time.Instant;

/**
 * 도움 요청 코멘트 — CONTRACTS_API 「11」 HelpCommentDto. 익명이 아니다.
 *
 * @param authorMemberId 강사는 null
 */
public record HelpCommentDto(
        String id,
        UserRef author,
        String authorMemberId,
        boolean isInstructorAnswer,
        String content,
        Instant createdAt) {

    public static HelpCommentDto of(HelpComment comment) {
        return new HelpCommentDto(
                Ids.toApi(comment.getId()),
                UserRef.of(comment.getAuthor()),
                comment.getAuthorMember() == null ? null : Ids.toApi(comment.getAuthorMember().getId()),
                comment.isInstructorAnswer(),
                comment.getContent(),
                comment.getCreatedAt());
    }
}
