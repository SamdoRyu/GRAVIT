package com.samdoryu.backend.common.id;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import java.util.regex.Pattern;

/**
 * 내부 ID 문자열 ↔ {@code Long} 변환의 한 곳(CONTRACTS.md 「2」 ID 정책).
 * API의 내부 ID는 10진 문자열이고, Entity 기본키는 {@code Long}이다.
 */
public final class Ids {

    private static final Pattern FORMAT = Pattern.compile("[1-9][0-9]{0,18}");

    private Ids() {
    }

    /** 경로 변수의 ID. 형식이 틀리면 그런 대상은 없다 — {@code not_found}. */
    public static Long fromPath(String value) {
        return parse(value, ErrorCode.NOT_FOUND);
    }

    /** 요청 본문 · 쿼리의 ID. 형식이 틀리면 {@code invalid}. */
    public static Long fromBody(String value) {
        return parse(value, ErrorCode.INVALID);
    }

    public static String toApi(Long id) {
        return id == null ? null : id.toString();
    }

    private static Long parse(String value, ErrorCode onError) {
        if (value == null || !FORMAT.matcher(value).matches()) {
            throw new ApiException(onError);
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            // 19자리가 Long 범위를 넘는 경우
            throw new ApiException(onError);
        }
    }
}
