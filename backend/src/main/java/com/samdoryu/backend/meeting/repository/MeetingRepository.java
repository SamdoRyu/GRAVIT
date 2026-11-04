package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.Meeting;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface MeetingRepository extends JpaRepository<Meeting, Long> {

    Optional<Meeting> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** 진행 중 회의가 있는가 — 있으면 새 회의는 {@code conflict}. */
    boolean existsByWorkspaceIdAndEndedAtIsNull(Long workspaceId);

    /** Snapshot {@code meetings} — 진행 중 회의. */
    List<Meeting> findByWorkspaceIdAndEndedAtIsNull(Long workspaceId);

    /** Snapshot {@code meetings} — 최근 끝난 회의 20개. */
    List<Meeting> findTop20ByWorkspaceIdAndEndedAtIsNotNullOrderByEndedAtDescIdDesc(Long workspaceId);
}
