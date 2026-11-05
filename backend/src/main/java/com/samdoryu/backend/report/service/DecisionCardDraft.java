package com.samdoryu.backend.report.service;

import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * 기술 결정 카드 9칸의 첫 내용(FR-REP-07 · P11 · CONTRACTS_API 「15」) — 기획안 「카드 칸과 재료」 표의 재료를 <b>앱이 가진 것만</b>
 * 시간순으로 그대로 옮긴다. 요약하거나 문장을 새로 만들지 않고(AI 없음), 재료가 없는 칸은 {@code null}이다. DB를 모르는 순수 규칙.
 *
 * <ul>
 *   <li>{@code goal} — PR의 연결 이슈(GitHub 공식 연결)에 연결된 요구사항 제목. 이슈 본문은 앱이 저장하지 않아 옮기지 않는다.</li>
 *   <li>{@code initialApproach} · {@code finalChange} — 재료(PR 본문 · 커밋 메시지 · 변경 파일)를 앱이 저장하지 않아 늘 {@code null}.</li>
 *   <li>{@code feedbackReceived} — 모든 회차의 추천 · 비추천 이유, 회차 오름차순. 평가자는 없다.</li>
 *   <li>{@code meetingDecision} — 이 PR 안건의 회의 결론 · 배운 점, 결정 시각 순.</li>
 *   <li>{@code rationale} — 그 안건을 정한 회의의 메모 원문. PR 템플릿 "고민한 점"은 PR 본문이라 옮기지 않는다.</li>
 *   <li>{@code blockedMoment} — 본인 스탠드업 "막힌 것" 가운데 연결 이슈를 {@code #번호}로 언급한 것, 날짜 순.</li>
 *   <li>{@code learning} — 본인이 직접 쓴다. 처음에는 {@code null}.</li>
 *   <li>{@code source} — PR 링크, 연결 이슈 링크.</li>
 * </ul>
 * [구현 기본값 — #62] 여러 재료는 한 줄에 하나씩 잇고, 칸 길이 한도(2000자)를 넘으면 앞에서부터 2000자까지만 둔다.
 */
final class DecisionCardDraft {

    /** 칸 하나의 최대 길이(CONTRACTS_API 「15」 DecisionCardCells — 각 0~2000자). */
    static final int CELL_MAX_LENGTH = 2000;

    private DecisionCardDraft() {
    }

    record Feedback(Verdict verdict, String reason) {
    }

    /** @param meetingNotes 그 안건을 정한 회의의 메모(없으면 null) */
    record Decision(String conclusion, String learning, String meetingNotes) {
    }

    record Standup(LocalDate date, String blockers) {
    }

    /**
     * @param requirementTitles 연결 이슈에 연결된 요구사항 제목, 요구사항 순서
     * @param feedbacks 평가 이유, 회차 오름차순
     * @param decisions 이 PR 안건의 결정, 결정 시각 순
     * @param linkedIssueNumbers 연결 이슈 번호
     * @param standups 본인 스탠드업, 날짜 순
     * @param linkedIssueUrls 연결 이슈 링크, 이슈 번호 순
     */
    record Materials(List<String> requirementTitles, List<Feedback> feedbacks, List<Decision> decisions,
            List<Integer> linkedIssueNumbers, List<Standup> standups, String prUrl, List<String> linkedIssueUrls) {
    }

    static DecisionCardCells fill(Materials m) {
        return new DecisionCardCells(
                cell(distinct(m.requirementTitles())),
                null,
                cell(m.feedbacks().stream().map(DecisionCardDraft::feedbackLine).toList()),
                cell(m.decisions().stream().flatMap(d -> decisionLines(d).stream()).toList()),
                null,
                // 한 회의에서 안건 여럿을 정했으면 메모는 한 번만
                cell(distinct(m.decisions().stream().map(Decision::meetingNotes).toList())),
                cell(blockedLines(m.standups(), m.linkedIssueNumbers())),
                null,
                cell(sourceLines(m.prUrl(), m.linkedIssueUrls())));
    }

    private static String feedbackLine(Feedback feedback) {
        return (feedback.verdict() == Verdict.RECOMMEND ? "추천: " : "비추천: ") + feedback.reason();
    }

    private static List<String> decisionLines(Decision decision) {
        List<String> lines = new ArrayList<>();
        lines.add(decision.conclusion());
        if (hasText(decision.learning())) {
            lines.add("배운 점: " + decision.learning());
        }
        return lines;
    }

    private static List<String> blockedLines(List<Standup> standups, List<Integer> issueNumbers) {
        List<Pattern> mentions = issueNumbers.stream()
                .map(number -> Pattern.compile("(?<![\\w&#])#" + number + "(?!\\d)"))
                .toList();
        return standups.stream()
                .filter(s -> hasText(s.blockers()) && mentions.stream().anyMatch(p -> p.matcher(s.blockers()).find()))
                .map(s -> s.date() + ": " + s.blockers())
                .toList();
    }

    private static List<String> sourceLines(String prUrl, List<String> issueUrls) {
        List<String> lines = new ArrayList<>();
        lines.add(prUrl);
        lines.addAll(issueUrls);
        return lines;
    }

    /** 빈 재료를 빼고 한 줄에 하나씩 잇는다. 남는 것이 없으면 {@code null}. */
    private static String cell(List<String> materials) {
        List<String> lines = materials.stream().filter(Objects::nonNull).map(String::strip)
                .filter(line -> !line.isEmpty()).toList();
        return lines.isEmpty() ? null : truncate(String.join("\n", lines));
    }

    private static List<String> distinct(List<String> materials) {
        return new ArrayList<>(new LinkedHashSet<>(materials));
    }

    private static String truncate(String text) {
        if (text.length() <= CELL_MAX_LENGTH) {
            return text;
        }
        // 서로게이트 쌍(이모지 등)을 반으로 자르지 않는다
        int end = Character.isHighSurrogate(text.charAt(CELL_MAX_LENGTH - 1)) ? CELL_MAX_LENGTH - 1 : CELL_MAX_LENGTH;
        return text.substring(0, end);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
