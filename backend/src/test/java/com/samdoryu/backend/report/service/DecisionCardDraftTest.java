package com.samdoryu.backend.report.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.service.DecisionCardDraft.Decision;
import com.samdoryu.backend.report.service.DecisionCardDraft.Feedback;
import com.samdoryu.backend.report.service.DecisionCardDraft.Materials;
import com.samdoryu.backend.report.service.DecisionCardDraft.Standup;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** #62 FR-REP-07 · P11 — 9칸은 앱이 가진 재료를 규칙대로 옮기고, 재료가 없는 칸은 null. DB 없이 규칙만 본다. */
class DecisionCardDraftTest {

    private static final String PR_URL = "https://github.com/samdoryu/a/pull/15";
    private static final LocalDate D1 = LocalDate.of(2026, 11, 2);
    private static final LocalDate D2 = LocalDate.of(2026, 11, 3);

    private static Materials materials(List<String> titles, List<Feedback> feedbacks, List<Decision> decisions,
            List<Integer> issueNumbers, List<Standup> standups, List<String> issueUrls) {
        return new Materials(titles, feedbacks, decisions, issueNumbers, standups, PR_URL, issueUrls);
    }

    private static Materials onlyThePr() {
        return materials(List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    @Test
    void withoutMaterialsOnlyTheSourceIsFilled() {
        DecisionCardCells cells = DecisionCardDraft.fill(onlyThePr());

        assertThat(cells).isEqualTo(new DecisionCardCells(null, null, null, null, null, null, null, null, PR_URL));
    }

    @Test
    void cellsWhoseMaterialsTheAppDoesNotStoreStayEmpty() {
        // PR 본문 · 커밋 메시지 · 변경 파일은 앱이 저장하지 않는다 → 처음 택한 방법 · 최종적으로 바꾼 것은 늘 null, 배운 점은 본인이 쓴다
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of("로그인"),
                List.of(new Feedback(Verdict.RECOMMEND, "좋아요")),
                List.of(new Decision("고친다", "배움", "메모")), List.of(12),
                List.of(new Standup(D1, "#12 막힘")), List.of("https://github.com/samdoryu/a/issues/12")));

        assertThat(cells.initialApproach()).isNull();
        assertThat(cells.finalChange()).isNull();
        assertThat(cells.learning()).isNull();
    }

    @Test
    void goalIsTheLinkedRequirementTitlesOncePerLine() {
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of("GitHub 로그인", "세션 만료", "GitHub 로그인"),
                List.of(), List.of(), List.of(), List.of(), List.of()));

        assertThat(cells.goal()).isEqualTo("GitHub 로그인\n세션 만료");
    }

    @Test
    void feedbackKeepsEveryReasonInOrderWithoutEvaluators() {
        // 같은 이유를 두 사람이 남겨도 둘 다 옮긴다 — 평가자는 재료에 없다
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(
                        new Feedback(Verdict.NOT_RECOMMEND, "실패 응답 모양이 계약과 달라요"),
                        new Feedback(Verdict.NOT_RECOMMEND, "실패 응답 모양이 계약과 달라요"),
                        new Feedback(Verdict.RECOMMEND, "고친 뒤 좋아요")),
                List.of(), List.of(), List.of(), List.of()));

        assertThat(cells.feedbackReceived()).isEqualTo("비추천: 실패 응답 모양이 계약과 달라요\n"
                + "비추천: 실패 응답 모양이 계약과 달라요\n추천: 고친 뒤 좋아요");
    }

    @Test
    void meetingDecisionAndRationaleComeFromTheDecidedAgendaItems() {
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(), List.of(
                        new Decision("에러 응답을 계약 모양으로 맞춘다", "에러는 한 곳에서", "전역 예외 처리로 가자"),
                        new Decision("다시 평가받는다", " ", "전역 예외 처리로 가자"),
                        new Decision("머지한다", null, null)),
                List.of(), List.of(), List.of()));

        assertThat(cells.meetingDecision()).isEqualTo(
                "에러 응답을 계약 모양으로 맞춘다\n배운 점: 에러는 한 곳에서\n다시 평가받는다\n머지한다");
        // 같은 회의 메모는 한 번, 메모 없는 결정은 빠진다
        assertThat(cells.rationale()).isEqualTo("전역 예외 처리로 가자");
    }

    @Test
    void blockedMomentIsOwnStandupsMentioningALinkedIssueByNumber() {
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(), List.of(), List.of(12, 7),
                List.of(new Standup(D1, "#12 에러 모양을 모르겠다"),
                        new Standup(D1.plusDays(1), "#123 다른 이슈"),
                        new Standup(D1.plusDays(2), "a#12 처럼 붙은 것"),
                        new Standup(D1.plusDays(3), null),
                        new Standup(D2.plusDays(3), "어제 #7, 오늘도 막힘")),
                List.of()));

        assertThat(cells.blockedMoment()).isEqualTo("2026-11-02: #12 에러 모양을 모르겠다\n2026-11-06: 어제 #7, 오늘도 막힘");
    }

    @Test
    void sourceIsThePrThenTheLinkedIssues() {
        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(), List.of(), List.of(3, 4),
                List.of(), List.of("https://github.com/samdoryu/a/issues/3", "https://github.com/samdoryu/a/issues/4")));

        assertThat(cells.source()).isEqualTo(PR_URL + "\nhttps://github.com/samdoryu/a/issues/3"
                + "\nhttps://github.com/samdoryu/a/issues/4");
    }

    @Test
    void aCellIsCutAtTheContractLimit() {
        String longNotes = "가".repeat(DecisionCardDraft.CELL_MAX_LENGTH + 500);

        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(),
                List.of(new Decision("결론", null, longNotes)), List.of(), List.of(), List.of()));

        assertThat(cells.rationale()).hasSize(DecisionCardDraft.CELL_MAX_LENGTH);
    }

    @Test
    void cuttingDoesNotSplitAnEmoji() {
        // 1999자 뒤에 이모지(서로게이트 쌍) — 2000자에서 자르면 쌍이 깨진다
        String notes = "가".repeat(DecisionCardDraft.CELL_MAX_LENGTH - 1) + "😀" + "끝";

        DecisionCardCells cells = DecisionCardDraft.fill(materials(List.of(), List.of(),
                List.of(new Decision("결론", null, notes)), List.of(), List.of(), List.of()));

        assertThat(cells.rationale()).isEqualTo("가".repeat(DecisionCardDraft.CELL_MAX_LENGTH - 1));
    }
}
