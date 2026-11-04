package com.samdoryu.backend.instructor.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 컨벤션 라이브러리 대상(FR-LIB-01). JSON 값은 소문자 snake. */
public enum ConventionTarget {
    BRANCH_NAME,
    COMMIT_MESSAGE,
    PR_TITLE,
    PR_BODY,
    ISSUE_BODY,
    ISSUE_TEMPLATE,
    PR_TEMPLATE;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
