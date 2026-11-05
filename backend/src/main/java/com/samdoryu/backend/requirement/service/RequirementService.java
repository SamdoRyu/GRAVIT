package com.samdoryu.backend.requirement.service;

import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.dto.RequirementDto;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.dto.SpecWarning;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 요구사항 구역(FR-REQ-02 · CONTRACTS.md 「3」 요구사항 재동기화). 명세 문서를 읽은 동기화가 {@link #resync}를 부른다.
 * 요구사항 행은 지우지 않고(사라지면 {@code missing}), 연결({@code RequirementLink})은 읽지도 지우지도 않는다.
 */
@Service
public class RequirementService {

    private final RequirementRepository requirementRepository;
    private final RequirementLinkRepository requirementLinkRepository;

    public RequirementService(RequirementRepository requirementRepository,
            RequirementLinkRepository requirementLinkRepository) {
        this.requirementRepository = requirementRepository;
        this.requirementLinkRepository = requirementLinkRepository;
    }

    /**
     * 명세 문서 내용으로 그 사무실의 요구사항을 맞춘다 — 동기화와 같은 트랜잭션에서 부른다.
     *
     * @param markdown 읽어 온 명세 문서 전체
     * @return 이번 읽기의 경고(없으면 빈 목록) — 동기화 상태에 그대로 남긴다
     */
    @Transactional
    public List<SpecWarning> resync(Workspace workspace, String markdown, Instant now) {
        List<Requirement> existing = requirementRepository.findByWorkspaceIdOrderByPositionAsc(workspace.getId());
        RequirementMatcher.Plan plan = RequirementMatcher.plan(SpecHeadings.parse(markdown), existing);

        plan.matched().forEach((requirement, heading) -> requirement.matchDocument(heading.sourceKey(),
                heading.heading(), heading.title(), heading.position(), now));
        plan.needsReview().forEach(requirement -> requirement.markUnmatched(RequirementStatus.NEEDS_REVIEW));
        plan.missing().forEach(requirement -> requirement.markUnmatched(RequirementStatus.MISSING));
        plan.created().forEach(heading -> requirementRepository.save(new Requirement(workspace, heading.sourceKey(),
                heading.heading(), heading.title(), heading.position(), now)));
        return plan.warnings();
    }

    /**
     * Snapshot {@code requirements} 조각 — 상태 무관 전부, position 오름차순(같으면 id). 진행률은 연결된 이슈 수와 그중 닫힌
     * 이슈 수(닫힘 사유 무관 — FR-REQ-05).
     */
    @Transactional(readOnly = true)
    public List<RequirementDto> listAll(Long workspaceId) {
        Map<Long, List<RequirementLink>> links = requirementLinkRepository.findByRequirementWorkspaceId(workspaceId)
                .stream()
                .collect(Collectors.groupingBy(link -> link.getRequirement().getId()));
        return requirementRepository.findByWorkspaceIdOrderByPositionAscIdAsc(workspaceId).stream()
                .map(requirement -> {
                    List<RequirementLink> linked = links.getOrDefault(requirement.getId(), List.of());
                    int done = (int) linked.stream()
                            .filter(link -> link.getTask().getState() == TaskState.CLOSED).count();
                    return RequirementDto.of(requirement, linked.size(), done);
                })
                .toList();
    }
}
