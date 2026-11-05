package com.samdoryu.backend.instructor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #61 FR-LIB-02 — 공용 컨벤션 라이브러리 읽기. 실제 Security · MVC · MySQL(CONTRACTS_API 「17」).
 * 로그인한 사람 전부(학생 · 강사 · 심사용 계정)가 사무실과 상관없이 읽는다. 세션이 없으면 {@code 401}.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + ConventionLibraryIntegrationTest.INSTRUCTOR_GITHUB_ID)
@AutoConfigureMockMvc
@Transactional
class ConventionLibraryIntegrationTest {

    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired ConventionLibraryItemRepository library;

    private AppUser teacher;
    private AppUser student;

    @BeforeEach
    void setUp() {
        teacher = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "teacher", "강사", null));
        student = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.PR_TEMPLATE, "PR 템플릿", "## 무엇을", null,
                teacher, T0));
        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.BRANCH_NAME, "브랜치 이름",
                "<type>/<이슈번호>-<설명>", "Git 전략", teacher, T0.plusSeconds(60)));
        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.ISSUE_BODY, "이슈 본문", "### 문제", null,
                teacher, T0));
    }

    @Test
    void aStudentWithoutAnyWorkspaceReadsTheWholeLibraryInOrder() throws Exception {
        MockHttpSession session = TestLogin.githubUser(student.getId(), 1001L).session();

        String body = mvc.perform(get("/api/convention-library").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].target").value(contains("branch_name", "issue_body", "pr_template")))
                .andExpect(jsonPath("$[0].name").value("브랜치 이름"))
                .andExpect(jsonPath("$[0].content").value("<type>/<이슈번호>-<설명>"))
                .andExpect(jsonPath("$[0].description").value("Git 전략"))
                .andExpect(jsonPath("$[0].author.userId").value(Ids.toApi(teacher.getId())))
                .andExpect(jsonPath("$[0].author.githubLogin").value("teacher"))
                .andExpect(jsonPath("$[0].updatedAt").value("2026-11-05T03:01:00Z"))
                .andReturn().getResponse().getContentAsString();

        // 계약 ② — 「17」 ConventionLibraryItemDto · 「1」 UserRef 필드 그대로
        JsonNode first = ContractShape.readTree(body).get(0);
        assertThat(first.propertyNames()).containsExactlyInAnyOrder(
                "id", "target", "name", "content", "description", "author", "updatedAt");
        assertThat(first.get("author").propertyNames()).containsExactlyInAnyOrder(
                "userId", "githubLogin", "displayName", "avatarUrl");
        ContractShape.assertCommonRules(ContractShape.readTree(body));
    }

    @Test
    void instructorsAndReviewAccountsReadItToo() throws Exception {
        // 사무실 지정이 없는 허용 목록 강사 — 라이브러리는 사무실 밖이다
        mvc.perform(get("/api/convention-library")
                        .session(TestLogin.githubUser(teacher.getId(), INSTRUCTOR_GITHUB_ID).session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
        // 심사용 ROLE-04 계정도 조회는 한다(쓰기는 #60에서 막는다)
        mvc.perform(get("/api/convention-library").session(TestLogin.reviewUser(97L).session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void withoutASessionIsUnauthorized() throws Exception {
        mvc.perform(get("/api/convention-library"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
    }
}
