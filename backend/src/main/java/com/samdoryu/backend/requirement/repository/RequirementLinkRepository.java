package com.samdoryu.backend.requirement.repository;

import com.samdoryu.backend.requirement.domain.RequirementLink;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RequirementLinkRepository extends JpaRepository<RequirementLink, Long> {

    /** 같은 연결 요청은 기존 연결을 돌려준다(CONTRACTS_API.md 「8」). */
    Optional<RequirementLink> findByRequirementIdAndTaskId(Long requirementId, Long taskId);

    /** 사무실 조건 — 링크의 요구사항이 그 사무실 것일 때만. */
    Optional<RequirementLink> findByIdAndRequirementWorkspaceId(Long id, Long workspaceId);
}
