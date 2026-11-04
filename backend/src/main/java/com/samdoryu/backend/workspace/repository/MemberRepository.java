package com.samdoryu.backend.workspace.repository;

import com.samdoryu.backend.workspace.domain.Member;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어, CONTRACTS.md 「2」 ID 정책 「소유」). */
public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByIdAndWorkspaceId(Long id, Long workspaceId);

    Optional<Member> findByWorkspaceIdAndUserId(Long workspaceId, Long userId);

    List<Member> findByWorkspaceId(Long workspaceId);

    /** 지금 팀원 — 콜라보레이터에서 빠진 팀원은 뺀다. */
    List<Member> findByWorkspaceIdAndRemovedAtIsNull(Long workspaceId);

    /** 이 사용자가 지금 팀원인 실제 사무실 중 그 레포들의 것 — 로그인 때 역할 판정(#65). */
    List<Member> findByUserIdAndRemovedAtIsNullAndWorkspaceGithubRepoIdIn(Long userId,
            Collection<Long> githubRepoIds);
}
