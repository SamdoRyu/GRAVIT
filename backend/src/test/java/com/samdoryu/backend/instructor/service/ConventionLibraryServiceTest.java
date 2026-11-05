package com.samdoryu.backend.instructor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** #61 FR-LIB-02 — 목록은 target(계약 순서) → name 순이고 만든 강사를 담는다. 저장소는 가짜. */
class ConventionLibraryServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    private final ConventionLibraryItemRepository repository = mock(ConventionLibraryItemRepository.class);
    private final ConventionLibraryService service = new ConventionLibraryService(repository);
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
}
