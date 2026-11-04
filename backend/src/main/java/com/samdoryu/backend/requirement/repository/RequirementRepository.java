package com.samdoryu.backend.requirement.repository;

import com.samdoryu.backend.requirement.domain.Requirement;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface RequirementRepository extends JpaRepository<Requirement, Long> {

    Optional<Requirement> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** 재동기화의 매칭 대상 — 상태 무관 전부. */
    List<Requirement> findByWorkspaceIdOrderByPositionAsc(Long workspaceId);
}
