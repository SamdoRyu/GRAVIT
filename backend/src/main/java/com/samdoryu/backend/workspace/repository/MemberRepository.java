package com.samdoryu.backend.workspace.repository;

import com.samdoryu.backend.workspace.domain.Member;
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
}
