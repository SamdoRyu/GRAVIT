package com.samdoryu.backend.report.service;

import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.dto.RetroReportDto;
import com.samdoryu.backend.report.dto.RetroReportSummary;
import com.samdoryu.backend.report.repository.RetroReportRepository;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개인 회고 리포트(FR-REP-01 · 05 · 06). 저장하는 것은 종류 · 배운 점 · 만든 시각뿐이고, 나머지 칸은 읽을 때 지금 데이터로 계산한다.
 * 개인 API 공통 규칙(CONTRACTS_API 「15」): 사무실 접근(Controller) → 경로 팀원(빠진 팀원 포함, 아니면 404) → 읽기는 본인 · 지정된 강사,
 * 쓰기는 본인(403). Snapshot · SSE에 싣지 않는다.
 */
@Service
public class RetroReportService {

    private static final String AREA_LABEL_PREFIX = "area:";

    private final RetroReportRepository retroReportRepository;
    private final WorkspaceService workspaceService;
    private final SyncedItemService syncedItemService;
    private final AgendaItemService agendaItemService;

    public RetroReportService(RetroReportRepository retroReportRepository, WorkspaceService workspaceService,
            SyncedItemService syncedItemService, AgendaItemService agendaItemService) {
        this.retroReportRepository = retroReportRepository;
        this.workspaceService = workspaceService;
        this.syncedItemService = syncedItemService;
        this.agendaItemService = agendaItemService;
    }

    /** {@code GET W/members/{memberId}/reports} — createdAt 내림차순. 본인 · 지정된 강사. */
    @Transactional(readOnly = true)
    public List<RetroReportSummary> list(WorkspaceAccess access, Long memberId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        return retroReportRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
                .map(RetroReportSummary::of).toList();
    }

    /** {@code POST W/members/{memberId}/reports} — 본인만. 종류마다 여러 번 만들 수 있다(만든 시각으로 구분). */
    @Transactional
    public RetroReportDto create(WorkspaceAccess access, Long memberId, ReportKind kind) {
        Member member = workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        RetroReport report = retroReportRepository.save(new RetroReport(member, kind, Instant.now()));
        return toDto(access.workspaceId(), report);
    }

    /** {@code GET W/members/{memberId}/reports/{reportId}} — 본인 · 지정된 강사. 다른 팀원의 리포트 ID면 404. */
    @Transactional(readOnly = true)
    public RetroReportDto get(WorkspaceAccess access, Long memberId, Long reportId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        RetroReport report = retroReportRepository.findByIdAndMemberId(reportId, memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        return toDto(access.workspaceId(), report);
    }

    /**
     * {@code PUT W/members/{memberId}/reports/{reportId}/learning}(FR-REP-02) — 내가 배운 점을 통째로 바꾼다. 본인만
     * (다른 학생 · 강사 403). 다른 팀원의 리포트 ID면 404.
     */
    @Transactional
    public RetroReportDto writeLearning(WorkspaceAccess access, Long memberId, Long reportId, String learning) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        RetroReport report = retroReportRepository.findByIdAndMemberId(reportId, memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        report.writeLearning(learning);
        return toDto(access.workspaceId(), report);
    }

    /** 계산 칸 — 활동 분포(활동 기록 기능 전)와 결정 카드(#62 전)는 아직 빈 목록이다. */
    private RetroReportDto toDto(Long workspaceId, RetroReport report) {
        String me = Ids.toApi(report.getMember().getId());
        // ponytail: 사무실의 이슈 · PR · 안건 전부를 읽어 본인 것을 거른다 — 팀 레포 규모면 충분, 커지면 팀원 조건 쿼리로
        List<TaskDto> myIssues = syncedItemService.listTasks(workspaceId).stream()
                .filter(issue -> issue.assigneeMemberIds().contains(me)).toList();
        List<SubmissionDto> myPrs = syncedItemService.listSubmissions(workspaceId).stream()
                .filter(pr -> me.equals(pr.authorMemberId())).toList();
        List<AgendaItemDto> myAgenda = agendaItemService.listAll(workspaceId).stream()
                .filter(item -> me.equals(item.raisedByMemberId())).toList();

        List<RetroReportDto.AgendaResult> agendaResults = myAgenda.stream()
                .filter(item -> item.decision() != null)
                .map(item -> new RetroReportDto.AgendaResult(item.id(), item.title(), item.decision().conclusion(),
                        item.decision().learning(), item.decision().prDecision(), item.decision().decidedAt()))
                .sorted(Comparator.comparing(RetroReportDto.AgendaResult::decidedAt))
                .toList();
        List<RetroReportDto.InstructorFeedback> feedbacks = myAgenda.stream()
                .flatMap(item -> item.instructorFeedbacks().stream()
                        .map(feedback -> new RetroReportDto.InstructorFeedback(item.id(), feedback.instructor(),
                                feedback.body(), feedback.createdAt())))
                .sorted(Comparator.comparing(RetroReportDto.InstructorFeedback::createdAt))
                .toList();
        List<String> areaLabels = Stream.concat(
                        myIssues.stream().flatMap(issue -> issue.labels().stream()),
                        myPrs.stream().flatMap(pr -> pr.labels().stream()))
                .filter(label -> label.startsWith(AREA_LABEL_PREFIX))
                .distinct().sorted().toList();

        String summary = "맡은 이슈 %d개(닫힘 %d) · 작성한 PR %d개(머지 %d) · 올린 안건 %d건(결론 %d)".formatted(
                myIssues.size(), myIssues.stream().filter(issue -> issue.state() == TaskState.CLOSED).count(),
                myPrs.size(), myPrs.stream().filter(pr -> pr.state() == SubmissionState.MERGED).count(),
                myAgenda.size(), agendaResults.size());
        return new RetroReportDto(Ids.toApi(report.getId()), report.getKind(), report.getCreatedAt(), me, summary,
                areaLabels, report.getLearning(), agendaResults, feedbacks, List.of(), List.of());
    }
}
