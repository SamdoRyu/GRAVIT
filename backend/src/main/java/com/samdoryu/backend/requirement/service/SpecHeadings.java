package com.samdoryu.backend.requirement.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 명세 문서(Markdown)의 {@code ##} 제목 읽기 — CONTRACTS.md 「3」 요구사항 재동기화 「읽기」 1~3.
 * <ul>
 *   <li>정확히 2단계 ATX 제목({@code ## 제목})만 읽는다. 코드 블록({@code ```} · {@code ~~~}) 안은 건너뛴다.</li>
 *   <li>제목 맨 앞이 요구사항 ID 꼴이면 원본 ID({@code sourceKey})다.</li>
 *   <li>정규화 제목: 원본 ID와 바로 뒤의 구분 기호(공백 · {@code :} · {@code -} · {@code .})를 빼고, 앞뒤 공백을 지우고,
 *       연속 공백을 하나로.</li>
 * </ul>
 * [구현 기본값 — #14] 밑줄로 쓰는 제목(Setext {@code ---})은 읽지 않는다. 원본 ID가 64자를 넘으면(DB 칸) 원본 ID가 없는 제목으로,
 * 제목 · 정규화 제목이 512자를 넘으면 앞 512자만 쓴다.
 */
final class SpecHeadings {

    /** 원본 ID 꼴(계약) + 바로 뒤가 끝이거나 구분 기호 — {@code FR-1abc}의 {@code FR-1}은 원본 ID가 아니다. */
    static final Pattern SOURCE_KEY = Pattern.compile("^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]+(?=$|[\\s:.\\-])");
    static final int MAX_SOURCE_KEY_LENGTH = 64;
    static final int MAX_TEXT_LENGTH = 512;

    private static final Pattern H2 = Pattern.compile("^ {0,3}##(?:[ \\t]+(.*))?$");
    private static final Pattern CLOSING_HASHES = Pattern.compile("(?:^|[ \\t]+)#+[ \\t]*$");
    private static final Pattern FENCE = Pattern.compile("^ {0,3}(`{3,}|~{3,})");
    private static final Pattern LEADING_SEPARATORS = Pattern.compile("^[\\s:.\\-]+");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    /**
     * @param position 문서 안 순서(0부터) — 읽은 {@code ##} 제목 전체에서의 순서
     * @param heading 제목 원문(앞뒤 공백 · 닫는 {@code #} 제거)
     * @param sourceKey 원본 ID, 없으면 null
     * @param title 정규화 제목 — 매칭과 응답의 {@code title}
     */
    record Heading(int position, String heading, String sourceKey, String title) {
    }

    private SpecHeadings() {
    }

    static List<Heading> parse(String markdown) {
        List<Heading> headings = new ArrayList<>();
        String fence = null;
        for (String line : markdown.split("\\R", -1)) {
            Matcher fenceMatcher = FENCE.matcher(line);
            if (fenceMatcher.find()) {
                String marker = fenceMatcher.group(1);
                if (fence == null) {
                    fence = marker;
                } else if (marker.charAt(0) == fence.charAt(0) && marker.length() >= fence.length()) {
                    fence = null;
                }
                continue;
            }
            if (fence != null) {
                continue;
            }
            Matcher h2 = H2.matcher(line);
            if (!h2.matches() || h2.group(1) == null) {
                continue;
            }
            String text = CLOSING_HASHES.matcher(h2.group(1)).replaceFirst("").strip();
            if (!text.isEmpty()) {
                headings.add(heading(headings.size(), text));
            }
        }
        return headings;
    }

    private static Heading heading(int position, String text) {
        Matcher key = SOURCE_KEY.matcher(text);
        String sourceKey = null;
        String rest = text;
        if (key.find() && key.group().length() <= MAX_SOURCE_KEY_LENGTH) {
            sourceKey = key.group();
            rest = LEADING_SEPARATORS.matcher(text.substring(key.end())).replaceFirst("");
        }
        String title = SPACES.matcher(rest.strip()).replaceAll(" ");
        return new Heading(position, cut(text), sourceKey, cut(title));
    }

    private static String cut(String value) {
        return value.length() <= MAX_TEXT_LENGTH ? value : value.substring(0, MAX_TEXT_LENGTH);
    }
}
