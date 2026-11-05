package com.samdoryu.backend.instructor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemRequest;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * #61 FR-LIB-02 — 목록은 target(계약 순서) → name 순이고 만든 강사를 담는다.
 * #60 FR-LIB-01 — 등록은 세션 사용자가 만든 강사, 수정은 만든 강사를 그대로 두고 네 칸 · 수정 시각만 바꾼다. 저장소는 가짜.
 * 쓰기 역할은 {@code ConventionLibraryEditorAuthorizationTest}.
 */
class ConventionLibraryServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    private final ConventionLibraryItemRepository repository = mock(ConventionLibraryItemRepository.class);
    private final AppUserService appUserService = mock(AppUserService.class);
    private final ConventionLibraryService service = new ConventionLibraryService(repository, appUserService);
    private final AppUser teacher = withId(AppUser.github(9001L, "teacher", "강사", null), 7L);

    private static <T> T withId(T entity, long id) {
        ReflectionTestUtils.setField(entity, "id", id);
        return entity;
    }

    private ConventionLibraryItem item(long id, ConventionTarget target, String name) {
        return withId(new ConventionLibraryItem(target, name, "본문", null, teacher, T0), id);
    }

    @Test
    void sortsByTheContractTargetOrderThenName() {
        // DB 문자열 순이면 ISSUE_BODY < PR_TITLE < … 이지만 계약 순서는 branch_name → commit_message → pr_title → … 이다
        given(repository.findAllWithAuthor()).willReturn(List.of(
                item(1, ConventionTarget.PR_TEMPLATE, "PR 템플릿"),
                item(2, ConventionTarget.ISSUE_BODY, "이슈 본문"),
                item(3, ConventionTarget.PR_TITLE, "제목 B"),
                item(4, ConventionTarget.BRANCH_NAME, "브랜치"),
                item(5, ConventionTarget.PR_TITLE, "제목 A"),
                item(6, ConventionTarget.COMMIT_MESSAGE, "커밋")));

        List<ConventionLibraryItemDto> items = service.listAll();

        assertThat(items).extracting(ConventionLibraryItemDto::target, ConventionLibraryItemDto::name).containsExactly(
                tuple(ConventionTarget.BRANCH_NAME, "브랜치"),
                tuple(ConventionTarget.COMMIT_MESSAGE, "커밋"),
                tuple(ConventionTarget.PR_TITLE, "제목 A"),
                tuple(ConventionTarget.PR_TITLE, "제목 B"),
                tuple(ConventionTarget.ISSUE_BODY, "이슈 본문"),
                tuple(ConventionTarget.PR_TEMPLATE, "PR 템플릿"));
    }

    @Test
    void eachItemCarriesItsAuthor() {
        given(repository.findAllWithAuthor()).willReturn(List.of(item(1, ConventionTarget.BRANCH_NAME, "브랜치")));

        ConventionLibraryItemDto item = service.listAll().getFirst();

        assertThat(item.id()).isEqualTo("1");
        assertThat(item.author().userId()).isEqualTo("7");
        assertThat(item.author().githubLogin()).isEqualTo("teacher");
        assertThat(item.updatedAt()).isEqualTo(T0);
    }

    @Test
    void emptyLibraryIsAnEmptyList() {
        given(repository.findAllWithAuthor()).willReturn(List.of());

        assertThat(service.listAll()).isEmpty();
    }

    @Test
    void createStoresTheSessionUserAsAuthorAndStampsNow() {
        given(appUserService.require(7L)).willReturn(teacher);
        given(repository.save(any(ConventionLibraryItem.class)))
                .willAnswer(invocation -> withId(invocation.getArgument(0, ConventionLibraryItem.class), 11L));
        Instant before = Instant.now().truncatedTo(ChronoUnit.MICROS);

        ConventionLibraryItemDto created = service.create(7L, new ConventionLibraryItemRequest(
                ConventionTarget.COMMIT_MESSAGE, "커밋 메시지", "<type>: <설명>", null));

        assertThat(created.id()).isEqualTo("11");
        assertThat(created.target()).isEqualTo(ConventionTarget.COMMIT_MESSAGE);
        assertThat(created.name()).isEqualTo("커밋 메시지");
        assertThat(created.content()).isEqualTo("<type>: <설명>");
        assertThat(created.description()).isNull();
        assertThat(created.author().userId()).isEqualTo("7");
        assertThat(created.updatedAt()).isBetween(before, Instant.now());
        assertThat(created.updatedAt().getNano() % 1_000).isZero(); // DATETIME(6) — 마이크로초까지
    }

    @Test
    void updateReplacesTheFourFieldsAndKeepsTheOriginalAuthor() {
        // 다른 강사가 고쳐도 author는 만든 강사(teacher) 그대로다 — 수정한 사람은 Service에 넘기지도 않는다
        ConventionLibraryItem item = item(3, ConventionTarget.PR_TITLE, "PR 제목");
        given(repository.findById(3L)).willReturn(Optional.of(item));

        ConventionLibraryItemDto updated = service.update(3L, new ConventionLibraryItemRequest(
                ConventionTarget.PR_BODY, "PR 본문", "## 무엇을 · 왜", "템플릿 설명"));

        assertThat(updated.id()).isEqualTo("3");
        assertThat(updated.target()).isEqualTo(ConventionTarget.PR_BODY);
        assertThat(updated.name()).isEqualTo("PR 본문");
        assertThat(updated.content()).isEqualTo("## 무엇을 · 왜");
        assertThat(updated.description()).isEqualTo("템플릿 설명");
        assertThat(updated.author().userId()).isEqualTo("7");
        assertThat(updated.updatedAt()).isAfter(T0);
        assertThat(item.getUpdatedAt()).isEqualTo(updated.updatedAt());
        verifyNoInteractions(appUserService);
    }

    @Test
    void updatingAMissingItemIsNotFound() {
        given(repository.findById(404L)).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(404L, new ConventionLibraryItemRequest(
                ConventionTarget.PR_BODY, "PR 본문", "본문", null)))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }
}
