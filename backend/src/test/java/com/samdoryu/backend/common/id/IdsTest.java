package com.samdoryu.backend.common.id;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class IdsTest {

    @Test
    void parsesDecimalIds() {
        assertThat(Ids.fromPath("42")).isEqualTo(42L);
        assertThat(Ids.fromBody("1")).isEqualTo(1L);
        assertThat(Ids.fromPath("9223372036854775807")).isEqualTo(Long.MAX_VALUE);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"0", "01", "-1", "+1", " 1", "1.0", "abc", "t_1", "9223372036854775808", "99999999999999999999"})
    void rejectsMalformedPathIdAsNotFound(String value) {
        assertThatThrownBy(() -> Ids.fromPath(value))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"0", "01", "-1", "abc", "9223372036854775808"})
    void rejectsMalformedBodyIdAsInvalid(String value) {
        assertThatThrownBy(() -> Ids.fromBody(value))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID));
    }

    @Test
    void formatsIdsAsDecimalStrings() {
        assertThat(Ids.toApi(42L)).isEqualTo("42");
        assertThat(Ids.toApi(null)).isNull();
    }
}
