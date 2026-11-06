package com.samdoryu.backend.report.service;

import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.dto.PageResponse;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.report.dto.TimelineEntry;
import com.samdoryu.backend.report.dto.TimelineEntry.Kind;
import com.samdoryu.backend.report.dto.TimelineEntry.Ref;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 학습 타임라인(FR-LRN-08 · #172) — CONTRACTS_API 「15」 {@code GET W/members/{memberId}/timeline}. 저장하지 않고 읽을 때 지금
 * 데이터로 계산한다. 개인 API 공통 규칙: 사무실 접근(Controller) → 경로 팀원(빠진 팀원 포함, 아니면 404) → 본인 · 지정된 강사(403).
 * <ul>
 *   <li>{@code evaluation_received}: 내 PR의 모든 회차 이유. 평가자 · 평가 ID · 평가 시각은 싣지 않는다(CONTRACTS.md 「5」 익명성) —
 *       [구현 기본값] {@code occurredAt}은 평가 시각이 아니라 그 회차가 열린 시각, 한 회차 안 순서는 회차 목록과 같은 "추천 먼저".</li>
 *   <li>{@code evaluation_given}: 그 팀원이 남긴 평가, {@code occurredAt}은 마지막으로 고친 시각(본인 평가 — {@code myEvaluation}과 같다).</li>
 *   <li>{@code agenda_raised} · {@code agenda_decided} · {@code instructor_feedback}: 그 팀원이 올린 안건(거둔 것 포함), 그 결정, 거기
 *       달린 강사 피드백.</li>
 *   <li>{@code commit_after_meeting}: 아직 내지 않는다 — 사용자별 커밋을 읽는 B 어댑터가 생기면 채운다(#34와 같은 선행).</li>
 * </ul>
 */
@Service
public class TimelineService {

    private static final String SUBMISSION = "submission";
    private static final String AGENDA_ITEM = "agenda_item";

    private final WorkspaceService workspaceService;
    private final SyncedItemService syncedItemService;
    private final EvaluationRoundService evaluationRoundService;
    private final AgendaItemService agendaItemService;

    public TimelineService(WorkspaceService workspaceService, SyncedItemService syncedItemService,
            EvaluationRoundService evaluationRoundService, AgendaItemService agendaItemService) {
        this.workspaceService = workspaceService;
        this.syncedItemService = syncedItemService;
        this.evaluationRoundService = evaluationRoundService;
        this.agendaItemService = agendaItemService;
    }

    /** {@code occurredAt} 내림차순 한 페이지. {@code page} · {@code size} 범위는 Controller가 검증한다. */
    @Transactional(readOnly = true)
    public PageResponse<TimelineEntry> timeline(WorkspaceAccess access, Long memberId, int page, int size) {
        Member member = workspaceService.requireMember(access.workspaceId(), memberId);
        access.requireSelfOrInstructor(memberId);
        Long workspaceId = access.workspaceId();
        String me = Ids.toApi(member.getId());

        // ponytail: 사무실의 PR · 안건 전부를 읽어 본인 것을 거른 뒤 메모리에서 자른다 — 4인 · 2주 규모면 충분(CONTRACTS.md 「4」 페이지)
        Map<String, SubmissionDto> prById = syncedItemService.listSubmissions(workspaceId).stream()
                .collect(Collectors.toMap(SubmissionDto::id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        List<TimelineEntry> entries = new ArrayList<>();

        for (SubmissionDto pr : prById.values()) {
            if (!me.equals(pr.authorMemberId())) {
                continue;
            }
            for (EvaluationRoundDto round : evaluationRoundService.listRounds(access, Ids.fromPath(pr.id()))) {
                round.reasons().forEach(reason -> entries.add(new TimelineEntry(Kind.EVALUATION_RECEIVED,
                        round.openedAt(), prTitle(pr), reason.reason(), reason.verdict(), new Ref(SUBMISSION, pr.id()))));
            }
        }
        if (member.getUser() != null) {
            // 같은 사무실 PR만 오므로 prById에 늘 있다
            evaluationRoundService.evaluationsGivenBy(workspaceId, member.getUser().getId()).forEach(given ->
                    entries.add(new TimelineEntry(Kind.EVALUATION_GIVEN, given.updatedAt(),
                            prTitle(prById.get(given.submissionId())), given.reason(), given.verdict(),
                            new Ref(SUBMISSION, given.submissionId()))));
        }
        for (AgendaItemDto item : agendaItemService.listAll(workspaceId)) {
            if (!me.equals(item.raisedByMemberId())) {
                continue;
            }
            Ref ref = new Ref(AGENDA_ITEM, item.id());
            entries.add(new TimelineEntry(Kind.AGENDA_RAISED, item.raisedAt(), item.title(), item.background(), null,
                    ref));
            if (item.decision() != null) {
                entries.add(new TimelineEntry(Kind.AGENDA_DECIDED, item.decision().decidedAt(), item.title(),
                        item.decision().conclusion(), null, ref));
            }
            item.instructorFeedbacks().forEach(feedback -> entries.add(new TimelineEntry(Kind.INSTRUCTOR_FEEDBACK,
                    feedback.createdAt(), item.title(), feedback.body(), null, ref)));
        }

        entries.sort(Comparator.comparing(TimelineEntry::occurredAt).reversed());
        return PageResponse.slice(entries, page, size);
    }

    /** 계약 예시와 같이 {@code #번호 제목}. */
    private static String prTitle(SubmissionDto pr) {
        return "#" + pr.githubPrNumber() + " " + pr.title();
    }
}
