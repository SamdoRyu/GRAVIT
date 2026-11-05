package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.Standup;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다. 스탠드업은 (사무실, 팀원, 날짜)가 자연 키다. */
public interface StandupRepository extends JpaRepository<Standup, Long> {

    Optional<Standup> findByWorkspaceIdAndMemberIdAndDate(Long workspaceId, Long memberId, LocalDate date);

    /** {@code GET W/standups?date=} — 그날 쓴 팀원 것, memberId 순. */
    List<Standup> findByWorkspaceIdAndDateOrderByMemberIdAsc(Long workspaceId, LocalDate date);
}
