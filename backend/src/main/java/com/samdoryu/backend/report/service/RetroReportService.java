package com.samdoryu.backend.report.service;

import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.service.ActivityService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.dto.DecisionCardDto;
import com.samdoryu.backend.report.dto.ReportCreateRequest;
import com.samdoryu.backend.report.dto.RetroReportDto;
import com.samdoryu.backend.report.dto.RetroReportSummary;
import com.samdoryu.backend.report.repository.RetroReportRepository;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개인 회고 리포트(FR-REP-01 · 02 · 05 · 06 · 07). 저장하는 것은 종류 · 제목 · 느낀 점 · 만든 시각 · 고른 기술 결정 카드(#335)이고,
 * 나머지 칸은 읽을 때 지금 데이터로 계산한다. 개인 API 공통 규칙(CONTRACTS_API 「15」): 사무실 접근(Controller) → 경로 팀원(빠진 팀원
 * 포함, 아니면 404) → 읽기는 본인 · 지정된 강사, 쓰기는 본인(403). Snapshot · SSE에 싣지 않는다.
 */
@Service
public class RetroReportService {

    private static final String AREA_LABEL_PREFIX = "area:";
    private static final String NONE = "- 없음";
    /** 마크다운의 활동 유형 이름 — 이슈 #173 「문제 / 목적」의 말. */
    private static final Map<ActivityKind, String> ACTIVITY_KIND_NAMES = Map.of(
            ActivityKind.PLANNING, "기획", ActivityKind.RESEARCH, "자료조사", ActivityKind.DESIGN, "디자인",
            ActivityKind.PRESENTATION, "발표 준비", ActivityKind.MENTOR_QUESTION, "멘토 질문");
    /** 리포트 안 카드 순서 — PR 번호 오름차순(같으면 먼저 만든 카드). */
    private static final Comparator<DecisionCard> BY_PR_NUMBER = Comparator
            .comparingInt((DecisionCard card) -> card.getSubmission().getGithubPrNumber())
            .thenComparing(DecisionCard::getId);

    private final RetroReportRepository retroReportRepository;
    private final WorkspaceService workspaceService;
    private final SyncedItemService syncedItemService;
    private final AgendaItemService agendaItemService;
    private final DecisionCardService decisionCardService;
    private final ActivityService activityService;

    public RetroReportService(RetroReportRepository retroReportRepository, WorkspaceService workspaceService,
            SyncedItemService syncedItemService, AgendaItemService agendaItemService,
            DecisionCardService decisionCardService, ActivityService activityService) {
        this.retroReportRepository = retroReportRepository;
        this.workspaceService = workspaceService;
        this.syncedItemService = syncedItemService;
        this.agendaItemService = agendaItemService;
        this.decisionCardService = decisionCardService;
        this.activityService = activityService;
    }

    /** {@code GET W/members/{memberId}/reports} — createdAt 내림차순. 본인 · 지정된 강사. */
    @Transactional(readOnly = true)
    public List<RetroReportSummary> list(WorkspaceAccess access, Long memberId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        return retroReportRepository.findByMemberIdOrderByCreatedAtDesc(memberId).stream()
                .map(RetroReportSummary::of).toList();
    }

    /**
     * {@code POST W/members/{memberId}/reports}(#335) — 본인만. 제목(앞뒤 공백 뺌) · 느낀 점 · 넣을 카드를 받는다. 카드는 본인 카드이고
     * 배운 점이 있어야 한다({@link DecisionCardService#requireSelectableForReport}). 여러 번 만들 수 있다(제목 · 만든 시각으로 구분).
     */
    @Transactional
    public RetroReportDto create(WorkspaceAccess access, Long memberId, ReportCreateRequest request) {
        Member member = workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        List<DecisionCard> cards = decisionCardService.requireSelectableForReport(memberId, request.decisionCardIds());
        RetroReport report = retroReportRepository.save(new RetroReport(member, request.kind(), request.title().strip(),
                request.learning(), cards, Instant.now()));
        return toDto(access, report);
    }

    /** {@code GET W/members/{memberId}/reports/{reportId}} — 본인 · 지정된 강사. 다른 팀원의 리포트 ID면 404. */
    @Transactional(readOnly = true)
    public RetroReportDto get(WorkspaceAccess access, Long memberId, Long reportId) {
        return toDto(access, requireReadable(access, memberId, reportId));
    }

    /**
     * {@code PUT W/members/{memberId}/reports/{reportId}/learning}(FR-REP-02) — 느낀 점을 통째로 바꾼다(1~5000자). 본인만
     * (다른 학생 · 강사 403). 다른 팀원의 리포트 ID면 404.
     */
    @Transactional
    public RetroReportDto writeLearning(WorkspaceAccess access, Long memberId, Long reportId, String learning) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelf(memberId);
        RetroReport report = retroReportRepository.findByIdAndMemberId(reportId, memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        report.writeLearning(learning);
        return toDto(access, report);
    }

    /**
     * {@code GET W/members/{memberId}/reports/{reportId}/markdown}(FR-REP-03) — {@link #get}과 같은 검사 · 계산 칸을 마크다운으로.
     * 사무실 팀원(빠진 팀원 포함)의 이름 · 로그인은 처음 나온 순서대로 "팀원 A" · "팀원 B"…로, 강사는 "강사"로만 적는다.
     */
    @Transactional(readOnly = true)
    public String markdown(WorkspaceAccess access, Long memberId, Long reportId) {
        RetroReport stored = requireReadable(access, memberId, reportId);
        Map<String, String> cardHeads = stored.getDecisionCards().stream().collect(Collectors.toMap(
                card -> Ids.toApi(card.getId()),
                card -> "#" + card.getSubmission().getGithubPrNumber() + " " + card.getSubmission().getTitle()));
        return anonymize(toMarkdown(toDto(access, stored), cardHeads), workspaceService.allMembers(access.workspaceId()));
    }

    private RetroReport requireReadable(WorkspaceAccess access, Long memberId, Long reportId) {
        workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        return retroReportRepository.findByIdAndMemberId(reportId, memberId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** @param cardHeads 카드 ID → "#PR번호 PR 제목" */
    private static String toMarkdown(RetroReportDto report, Map<String, String> cardHeads) {
        StringBuilder md = new StringBuilder();
        md.append("# ").append(report.title()).append("\n\n")
                .append("- 만든 시각: ").append(report.createdAt()).append("\n\n")
                .append("## 느낀 점\n\n").append(report.learning() == null || report.learning().isBlank()
                        ? NONE : report.learning()).append("\n\n")
                .append("## 담당 기능 영역\n\n");
        report.areaLabels().forEach(label -> md.append("- ").append(label).append('\n'));
        if (report.areaLabels().isEmpty()) {
            md.append(NONE).append('\n');
        }
        md.append("\n## 안건 결론\n\n");
        for (RetroReportDto.AgendaResult result : report.agendaResults()) {
            md.append("### ").append(result.title()).append("\n\n")
                    .append("- 결론: ").append(result.conclusion()).append('\n');
            if (result.learning() != null) {
                md.append("- 배운 점: ").append(result.learning()).append('\n');
            }
            if (result.prDecision() != null) {
                md.append("- PR 결정: ").append(result.prDecision().value()).append('\n');
            }
            md.append("- 결정 시각: ").append(result.decidedAt()).append("\n\n");
        }
        if (report.agendaResults().isEmpty()) {
            md.append(NONE).append("\n\n");
        }
        md.append("## 강사 피드백\n\n");
        report.instructorFeedbacks().forEach(feedback -> md.append("- ").append(feedback.createdAt())
                .append(" 강사: ").append(feedback.body()).append('\n'));
        if (report.instructorFeedbacks().isEmpty()) {
            md.append(NONE).append('\n');
        }
        md.append("\n## 활동 분포\n\n");
        report.activityDistribution().forEach(share -> md.append("- ").append(ACTIVITY_KIND_NAMES.get(share.kind()))
                .append(": ").append(share.totalMinutes()).append("분\n"));
        if (report.activityDistribution().isEmpty()) {
            md.append(NONE).append('\n');
        }
        md.append("\n## 기술 결정 카드\n\n");
        for (DecisionCardDto card : report.decisionCards()) {
            md.append("### ").append(cardHeads.get(card.id())).append("\n\n");
            cellLines(card.cells()).forEach(line -> md.append(line).append('\n'));
            card.followUpQuestions().forEach(question -> md.append("- ").append(question.createdAt())
                    .append(" 강사 꼬리질문: ").append(question.body()).append('\n'));
            md.append('\n');
        }
        if (report.decisionCards().isEmpty()) {
            md.append(NONE).append('\n');
        }
        return md.toString();
    }

    /** 값이 있는 칸만 "- 칸 이름: 값", 여러 줄 값은 목록 안으로 들여 쓴다. 칸 이름은 CONTRACTS_API 「15」 DecisionCardCells 주석. */
    private static List<String> cellLines(DecisionCardCells cells) {
        String[][] named = {
                {"무엇을 하려 했나", cells.goal()}, {"처음 택한 방법", cells.initialApproach()},
                {"받은 평가", cells.feedbackReceived()}, {"회의에서 정한 것", cells.meetingDecision()},
                {"최종적으로 바꾼 것", cells.finalChange()}, {"왜 그렇게 결정했나", cells.rationale()},
                {"막혔던 순간", cells.blockedMoment()}, {"내가 배운 점", cells.learning()}, {"원본", cells.source()}};
        return Stream.of(named)
                .filter(cell -> cell[1] != null && !cell[1].isBlank())
                .map(cell -> "- " + cell[0] + ": " + cell[1].replace("\n", "\n  "))
                .toList();
    }

    /**
     * 팀원 이름 · 로그인({@code @bob}은 {@code @팀원 A})을 한 번에 훑어 처음 나온 순서대로 "팀원 A"…로 바꾼다. 긴 이름을 먼저 맞춰
     * {@code kim}이 {@code kimchi} 안에서 바뀌지 않게 하고, 영문 · 숫자에 붙은 곳은 다른 단어로 보고 건너뛴다(한글 조사는 붙어도 바꾼다).
     * ponytail: 별명 · 이름 일부는 못 잡고, 26명을 넘으면 글자가 A~Z 밖으로 나간다 — 팀 규모(최대 8 포드)면 충분
     */
    private static String anonymize(String text, List<Member> members) {
        Map<String, Long> memberIdByAlias = new HashMap<>();
        for (Member member : members) {
            Stream.of(member.getDisplayName(), member.getGithubLogin())
                    .filter(alias -> alias != null && !alias.isBlank())
                    .forEach(alias -> memberIdByAlias.putIfAbsent(alias.toLowerCase(Locale.ROOT), member.getId()));
        }
        if (memberIdByAlias.isEmpty()) {
            return text;
        }
        String alternatives = memberIdByAlias.keySet().stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .map(Pattern::quote).collect(Collectors.joining("|"));
        Matcher matcher = Pattern.compile("(?<![A-Za-z0-9_-])(?:" + alternatives + ")(?![A-Za-z0-9_-])",
                Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(text);
        Map<Long, String> labelByMemberId = new HashMap<>();
        return matcher.replaceAll(match -> labelByMemberId.computeIfAbsent(
                memberIdByAlias.get(match.group().toLowerCase(Locale.ROOT)),
                id -> "팀원 " + (char) ('A' + labelByMemberId.size())));
    }

    /**
     * 계산 칸 — 활동 분포는 본인의 확인된 활동만 유형별 분 합계(FR-ACT-03 · #173). 기술 결정 카드는 리포트에 고른 것만 PR 번호 순(#335),
     * 담당 기능 영역은 고른 카드의 PR과 그 PR에 연결된 이슈의 {@code area:*}(중복 없이 이름순). 카드 읽기 검사(본인 · 지정된 강사)는 리포트
     * 읽기와 같다.
     */
    private RetroReportDto toDto(WorkspaceAccess access, RetroReport report) {
        Long workspaceId = access.workspaceId();
        String me = Ids.toApi(report.getMember().getId());
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

        List<DecisionCard> cards = report.getDecisionCards().stream().sorted(BY_PR_NUMBER).toList();
        List<String> areaLabels = areaLabels(workspaceId, cards);
        List<RetroReportDto.ActivityShare> activityDistribution = activityService
                .confirmedMinutesByKind(report.getMember().getId()).entrySet().stream()
                .map(entry -> new RetroReportDto.ActivityShare(entry.getKey(), entry.getValue()))
                .toList();

        return new RetroReportDto(Ids.toApi(report.getId()), report.getKind(), report.getTitle(), report.getCreatedAt(),
                me, areaLabels, report.getLearning(), agendaResults, feedbacks, activityDistribution,
                decisionCardService.toDtos(cards));
    }

    /** 고른 카드의 PR + 그 PR에 연결된 이슈의 {@code area:*} — 카드가 없으면 빈 목록. */
    private List<String> areaLabels(Long workspaceId, List<DecisionCard> cards) {
        if (cards.isEmpty()) {
            return List.of();
        }
        Set<String> prIds = cards.stream().map(card -> Ids.toApi(card.getSubmission().getId()))
                .collect(Collectors.toSet());
        // ponytail: 사무실의 PR · 이슈 전부를 읽어 고른 것을 거른다 — 팀 레포 규모면 충분, 커지면 ID 조건 쿼리로
        List<SubmissionDto> prs = syncedItemService.listSubmissions(workspaceId).stream()
                .filter(pr -> prIds.contains(pr.id())).toList();
        Set<String> issueIds = prs.stream().flatMap(pr -> pr.linkedTaskIds().stream()).collect(Collectors.toSet());
        List<TaskDto> issues = issueIds.isEmpty() ? List.of() : syncedItemService.listTasks(workspaceId).stream()
                .filter(issue -> issueIds.contains(issue.id())).toList();
        return Stream.concat(prs.stream().flatMap(pr -> pr.labels().stream()),
                        issues.stream().flatMap(issue -> issue.labels().stream()))
                .filter(label -> label.startsWith(AREA_LABEL_PREFIX))
                .distinct().sorted().toList();
    }
}
