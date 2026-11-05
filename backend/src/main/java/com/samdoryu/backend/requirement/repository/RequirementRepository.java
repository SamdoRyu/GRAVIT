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

    /** Snapshot {@code requirements} — 상태 무관 전부. 사라진 요구사항은 옛 순서를 지녀 position이 겹칠 수 있어 id로 이어 정렬한다. */
    List<Requirement> findByWorkspaceIdOrderByPositionAscIdAsc(Long workspaceId);
}
