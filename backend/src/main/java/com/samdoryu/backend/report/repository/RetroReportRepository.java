package com.samdoryu.backend.report.repository;

import com.samdoryu.backend.report.domain.RetroReport;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 경로의 팀원 조건으로 찾는다 — 팀원은 먼저 사무실 조건으로 찾는다. */
public interface RetroReportRepository extends JpaRepository<RetroReport, Long> {

    Optional<RetroReport> findByIdAndMemberId(Long id, Long memberId);

    List<RetroReport> findByMemberIdOrderByCreatedAtDesc(Long memberId);
}
