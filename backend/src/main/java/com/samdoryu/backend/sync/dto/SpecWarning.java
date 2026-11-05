package com.samdoryu.backend.sync.dto;

/**
 * 마지막 명세 문서 읽기의 경고 — CONTRACTS_API.md 「4」 SpecWarning(CONTRACTS.md 「3」 요구사항 재동기화 · #14).
 *
 * @param code {@code duplicate_source_key} · {@code duplicate_title} · {@code spec_not_found}
 * @param heading 문제의 {@code ##} 제목. {@code spec_not_found}는 null
 */
public record SpecWarning(String code, String heading) {

    public static final String DUPLICATE_SOURCE_KEY = "duplicate_source_key";
    public static final String DUPLICATE_TITLE = "duplicate_title";
    public static final String SPEC_NOT_FOUND = "spec_not_found";

    /** 같은 원본 ID가 문서에 두 번 이상 — 그 제목들은 가져오지 않는다. */
    public static SpecWarning duplicateSourceKey(String heading) {
        return new SpecWarning(DUPLICATE_SOURCE_KEY, heading);
    }

    /** 같은 제목이 모호함 — 그 제목들은 자동 매칭 · 생성하지 않는다. */
    public static SpecWarning duplicateTitle(String heading) {
        return new SpecWarning(DUPLICATE_TITLE, heading);
    }

    /** 명세 문서를 읽지 못함(경로에 파일 없음) — 요구사항을 하나도 바꾸지 않는다. */
    public static SpecWarning specNotFound() {
        return new SpecWarning(SPEC_NOT_FOUND, null);
    }
}
