package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.help.dto.HelpCommentCreateRequest;
import com.samdoryu.backend.help.dto.HelpRequestCloseRequest;
import com.samdoryu.backend.help.dto.HelpRequestCreateRequest;
import com.samdoryu.backend.help.dto.HelpRequestToAgendaRequest;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemRequest;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.dto.AgendaItemCreateRequest;
import com.samdoryu.backend.meeting.dto.DecisionRequest;
import com.samdoryu.backend.meeting.dto.InstructorFeedbackCreateRequest;
import com.samdoryu.backend.report.dto.FollowUpQuestionCreateRequest;
import com.samdoryu.backend.workspace.dto.OpenWorkspaceRequest;
import com.samdoryu.backend.workspace.dto.TeamSettingsUpdateRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/**
 * #175 — 길이 1자부터인 글 필드는 공백 문자만인 값을 거부한다(CONTRACTS.md 「5」). 앞뒤 공백이 있는 값은 그대로 받고,
 * {@code null}을 받는 필드의 {@code null}은 검사하지 않는다. 검증 실패는 전역 처리에서 {@code 400 invalid}가 된다.
 */
class BlankTextFieldsTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private static final List<String> BLANKS = List.of(" ", "   ", "\n", " \t\r\n ");
    private static final LocalDate DAY = LocalDate.of(2026, 11, 6);

    /** 글 필드 하나에 값을 넣어 요청을 만든다 — 나머지 필드는 맞는 값. */
    private static final List<Function<String, Object>> REQUIRED_TEXT = List.of(
            text -> new HelpRequestCreateRequest(text, null),
            text -> new HelpCommentCreateRequest(text),
            text -> new HelpRequestCloseRequest(null, text),
            text -> new HelpRequestToAgendaRequest(text),
            text -> new AgendaItemCreateRequest(AgendaKind.OTHER, null, text, null, null, null),
            text -> new DecisionRequest(text, null, null, null, null, null),
            text -> new InstructorFeedbackCreateRequest(text),
            text -> new FollowUpQuestionCreateRequest(text),
            text -> new ConventionLibraryItemRequest(ConventionTarget.PR_TITLE, text, "본문", null),
            text -> new ConventionLibraryItemRequest(ConventionTarget.PR_TITLE, "이름", text, null));

    private static final List<Function<String, Object>> NULLABLE_PATH = List.of(
            path -> new OpenWorkspaceRequest("1", DAY, DAY, path, true),
            path -> new TeamSettingsUpdateRequest(DAY, DAY, path, 48, 48));

    @Test
    void requiredTextRejectsWhitespaceOnly() {
        for (Function<String, Object> request : REQUIRED_TEXT) {
            for (String blank : BLANKS) {
                assertThat(VALIDATOR.validate(request.apply(blank))).as("%s %s", request.apply(blank), blank)
                        .hasSize(1);
            }
            assertThat(VALIDATOR.validate(request.apply(""))).hasSize(1);
            assertThat(VALIDATOR.validate(request.apply(null))).hasSize(1);
            assertThat(VALIDATOR.validate(request.apply("  앞뒤 공백은 그대로  "))).isEmpty();
        }
    }

    @Test
    void nullablePathRejectsWhitespaceOnlyButAcceptsNull() {
        for (Function<String, Object> request : NULLABLE_PATH) {
            for (String blank : BLANKS) {
                assertThat(VALIDATOR.validate(request.apply(blank))).hasSize(1);
            }
            assertThat(VALIDATOR.validate(request.apply(""))).hasSize(1);
            assertThat(VALIDATOR.validate(request.apply(null))).isEmpty();
            assertThat(VALIDATOR.validate(request.apply(" docs/spec.md "))).isEmpty();
            assertThat(VALIDATOR.validate(request.apply("a".repeat(301)))).hasSize(1);
        }
    }
}
