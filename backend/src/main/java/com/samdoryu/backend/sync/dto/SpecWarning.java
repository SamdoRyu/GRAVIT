package com.samdoryu.backend.sync.dto;

/**
 * 마지막 명세 문서 읽기의 경고 — CONTRACTS_API.md 「4」 SpecWarning. 명세 문서를 읽는 #14가 채운다.
 *
 * @param code {@code duplicate_source_key} · {@code duplicate_title} · {@code spec_not_found}
 * @param heading 문제의 {@code ##} 제목. {@code spec_not_found}는 null
 */
public record SpecWarning(String code, String heading) {
}
