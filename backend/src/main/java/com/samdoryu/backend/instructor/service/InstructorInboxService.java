package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.service.HelpRequestService;
import com.samdoryu.backend.instructor.dto.InboxItem;
import com.samdoryu.backend.instructor.dto.InboxItem.Kind;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.service.DecisionCardService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 강사 요청함(CONTRACTS_API 「16」 · FR-LRN-23) — 도움 요청 · 결정 기록 · 기술 결정 카드에서 강사에게 요청된 건을 모아 계산한다.
 * 저장하지 않는다. 어느 사무실을 볼지(지금 지정된 사무실)는 {@code AuthorizationService}가 정해 넘긴다.
 * 각 원본은 그 패키지의 Service로만 읽는다.
 */
@Service
public class InstructorInboxService {

    /** 도움 요청 title의 최대 글자 수 — 안건 제목(1~100자)과 맞춘다 [구현 기본값 — 계약 「16」 반영 요청 중]. */
    static final int HELP_REQUEST_TITLE_MAX_CODE_POINTS = 100;

    /** {@code requestedAt} 내림차순(계약). 같으면 종류 → 대상 ID 내림차순으로 순서를 고정한다 [구현 기본값]. */
    private static final Comparator<InboxItem> NEWEST_FIRST = Comparator.comparing(InboxItem::requestedAt)
            .reversed()
            .thenComparing(InboxItem::kind)
            .thenComparing(item -> Long.valueOf(item.targetId()), Comparator.reverseOrder());

    private final HelpRequestService helpRequestService;
    private final AgendaItemService agendaItemService;
    private final DecisionCardService decisionCardService;

    public InstructorInboxService(HelpRequestService helpRequestService, AgendaItemService agendaItemService,
            DecisionCardService decisionCardService) {
        this.helpRequestService = helpRequestService;
        this.agendaItemService = agendaItemService;
        this.decisionCardService = decisionCardService;
    }

    /**
     * @param workspaceIds 볼 사무실 — 비어 있으면 빈 목록
     * @param answered {@code null}이면 전부, {@code true}면 답이 있는 것만, {@code false}면 아직 없는 것만
     */
    @Transactional(readOnly = true)
    public List<InboxItem> inbox(Collection<Long> workspaceIds, Boolean answered) {
        List<InboxItem> items = new ArrayList<>();

        List<HelpRequest> helpRequests = helpRequestService.listInstructorRequested(workspaceIds);
        Map<Long, Instant> helpAnswers = helpRequestService.firstInstructorAnswerAt(ids(helpRequests, HelpRequest::getId));
        // 답 없이 닫힌(resolved · ended) 도움 요청은 강사가 더 답할 수 없어 빼고, 답한 기록은 남긴다(계약 「16」)
        helpRequests.stream()
                .filter(help -> help.getStatus().acceptsComments() || helpAnswers.containsKey(help.getId()))
                .forEach(help -> items.add(InboxItem.of(Kind.HELP_REQUEST, help.getWorkspace(), help.getId(),
                        help.getRequester().getId(), helpRequestTitle(help.getContent()),
                        help.getInstructorRequestedAt(), helpAnswers.get(help.getId()))));

        List<AgendaItem> agendaItems = agendaItemService.listFeedbackRequested(workspaceIds);
        Map<Long, Instant> feedbacks = agendaItemService.firstInstructorFeedbackAt(ids(agendaItems, AgendaItem::getId));
        agendaItems.forEach(item -> items.add(InboxItem.of(Kind.DECISION_FEEDBACK, item.getWorkspace(), item.getId(),
                item.getRaisedBy().getId(), item.getTitle(), item.getFeedbackRequestedAt(), feedbacks.get(item.getId()))));

        List<DecisionCard> cards = decisionCardService.listFollowUpRequested(workspaceIds);
        Map<Long, Instant> questions = decisionCardService.firstFollowUpQuestionAt(ids(cards, DecisionCard::getId));
        cards.forEach(card -> items.add(InboxItem.of(Kind.FOLLOW_UP_QUESTION, card.getMember().getWorkspace(),
                card.getId(), card.getMember().getId(), card.getSubmission().getTitle(), card.getFollowUpRequestedAt(),
                questions.get(card.getId()))));

        return items.stream()
                .filter(item -> answered == null || answered == (item.answeredAt() != null))
                .sorted(NEWEST_FIRST)
                .toList();
    }

    /**
     * 도움 요청에는 제목이 없어 내용에서 만든다 — 빈 줄을 건너뛴 첫 줄의 앞뒤 공백을 빼고 최대 100자(유니코드 문자 단위라 이모지를
     * 반으로 자르지 않는다). 말줄임표는 붙이지 않는다 [구현 기본값 — 계약 「16」 반영 요청 중].
     */
    static String helpRequestTitle(String content) {
        String firstLine = content.lines().map(String::strip).filter(line -> !line.isEmpty()).findFirst().orElse("");
        if (firstLine.codePointCount(0, firstLine.length()) <= HELP_REQUEST_TITLE_MAX_CODE_POINTS) {
            return firstLine;
        }
        return firstLine.substring(0, firstLine.offsetByCodePoints(0, HELP_REQUEST_TITLE_MAX_CODE_POINTS));
    }

    private static <T> List<Long> ids(List<T> rows, Function<T, Long> id) {
        return rows.stream().map(id).toList();
    }
}
