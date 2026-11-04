package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.workspace.domain.Member;
import java.time.Instant;

/**
 * 팀원 — CONTRACTS_API 「5」 MemberDto.
 *
 * @param userId 시연 Seed 팀원은 null
 * @param githubUserId 시연 Seed · 심사용 팀원은 null
 * @param deskIndex 0~7. 빠진 팀원과 자리가 없는 팀원은 null — 책상 · 아바타 없음
 */
public record MemberDto(
        String id,
        String userId,
        String githubUserId,
        String githubLogin,
        String displayName,
        String avatarUrl,
        Integer deskIndex,
        boolean isRepoAdmin,
        Instant removedAt,
        Instant syncedAt) {

    public static MemberDto of(Member member) {
        return new MemberDto(
                Ids.toApi(member.getId()),
                member.getUser() == null ? null : Ids.toApi(member.getUser().getId()),
                Ids.toApi(member.githubUserId()),
                member.getGithubLogin(),
                member.getDisplayName(),
                member.getAvatarUrl(),
                member.getDeskIndex(),
                member.isRepoAdmin(),
                member.getRemovedAt(),
                member.getSyncedAt());
    }
}
