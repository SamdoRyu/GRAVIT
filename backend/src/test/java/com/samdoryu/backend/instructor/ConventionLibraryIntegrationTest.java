package com.samdoryu.backend.instructor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * 공용 컨벤션 라이브러리 — 실제 Security · MVC · MySQL(CONTRACTS_API 「17」). 사무실 경로 밖이다.
 * <ul>
 *   <li>#61 FR-LIB-02 읽기: 로그인한 사람 전부(학생 · 강사 · 심사용 계정)가 사무실과 상관없이 읽는다. 세션이 없으면 {@code 401}.</li>
 *   <li>#60 FR-LIB-01 등록 · 수정: 지정이 있는 GitHub 계정 강사만 {@code 201} · {@code 200}. 심사용 ROLE-04 계정 · 학생 · 지정이 없거나
 *       해제된 강사는 {@code 403 forbidden_role}이고 거부 뒤 라이브러리 내용이 그대로다(CONTRACTS.md 「9」 계약 테스트).</li>
 * </ul>
 */
@SpringBootTest(properties = {
        "app.origin=" + ConventionLibraryIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + ConventionLibraryIntegrationTest.INSTRUCTOR_GITHUB_ID + ","
                + ConventionLibraryIntegrationTest.OTHER_INSTRUCTOR_GITHUB_ID + ","
                + ConventionLibraryIntegrationTest.UNASSIGNED_INSTRUCTOR_GITHUB_ID + ","
                + ConventionLibraryIntegrationTest.RELEASED_INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class ConventionLibraryIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    static final long OTHER_INSTRUCTOR_GITHUB_ID = 9002L;
    static final long UNASSIGNED_INSTRUCTOR_GITHUB_ID = 9003L;
    static final long RELEASED_INSTRUCTOR_GITHUB_ID = 9004L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String PATH = "/api/convention-library";
    private static final String VALID_BODY = "{\"target\":\"commit_message\",\"name\":\"커밋 메시지\","
            + "\"content\":\"<type>: <설명>\",\"description\":null}";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired ConventionLibraryItemRepository library;

    private AppUser teacher;
    private ConventionLibraryItem branchItem;
    private MockHttpSession teacherSession;
    private MockHttpSession otherTeacherSession;
    private MockHttpSession studentSession;
    private MockHttpSession unassignedTeacherSession;
    private MockHttpSession releasedTeacherSession;
    private MockHttpSession reviewSession;

    @BeforeEach
    void setUp() {
        teacher = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "teacher", "강사", null));
        AppUser otherTeacher = users.saveAndFlush(AppUser.github(OTHER_INSTRUCTOR_GITHUB_ID, "teacher2", "강사2", null));
        AppUser unassignedTeacher = users.saveAndFlush(
                AppUser.github(UNASSIGNED_INSTRUCTOR_GITHUB_ID, "teacher3", "강사3", null));
        AppUser releasedTeacher = users.saveAndFlush(
                AppUser.github(RELEASED_INSTRUCTOR_GITHUB_ID, "teacher4", "강사4", null));
        AppUser student = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));

        // 강사 지정은 사무실 하나에 — 지정 · 해제는 요청마다 DB에서 읽는다
        Workspace ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, student, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, student, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, OTHER_INSTRUCTOR_GITHUB_ID, student, T0));
        InstructorAssignment released = new InstructorAssignment(ws, RELEASED_INSTRUCTOR_GITHUB_ID, student, T0);
        released.unassign(T0.plusSeconds(60));
        instructorAssignments.saveAndFlush(released);

        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.PR_TEMPLATE, "PR 템플릿", "## 무엇을", null,
                teacher, T0));
        branchItem = library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.BRANCH_NAME, "브랜치 이름",
                "<type>/<이슈번호>-<설명>", "Git 전략", teacher, T0.plusSeconds(60)));
        library.saveAndFlush(new ConventionLibraryItem(ConventionTarget.ISSUE_BODY, "이슈 본문", "### 문제", null,
                teacher, T0));

        teacherSession = TestLogin.githubUser(teacher.getId(), INSTRUCTOR_GITHUB_ID).session();
        otherTeacherSession = TestLogin.githubUser(otherTeacher.getId(), OTHER_INSTRUCTOR_GITHUB_ID).session();
        studentSession = TestLogin.githubUser(student.getId(), 1001L).session();
        unassignedTeacherSession = TestLogin.githubUser(unassignedTeacher.getId(), UNASSIGNED_INSTRUCTOR_GITHUB_ID)
                .session();
        releasedTeacherSession = TestLogin.githubUser(releasedTeacher.getId(), RELEASED_INSTRUCTOR_GITHUB_ID).session();
        reviewSession = TestLogin.reviewUser(97L).session();
    }

    private static String itemPath(ConventionLibraryItem item) {
        return PATH + "/" + Ids.toApi(item.getId());
    }

    /** CSRF 쿠키 → 헤더, 허용 출처(CONTRACTS.md 「6」). 세션이 null이면 로그인하지 않은 요청. */
    private ResultActions write(MockHttpServletRequestBuilder request, MockHttpSession session, String json)
            throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        if (session != null) {
            request.session(session);
        }
        return mvc.perform(request
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    /** 라이브러리 전체 — 항목 ID → 모든 칸. 거부 뒤 그대로인지 본다. */
    private Map<Long, List<Object>> snapshot() {
        return library.findAll().stream().collect(Collectors.toMap(ConventionLibraryItem::getId,
                i -> Arrays.asList(i.getTarget(), i.getName(), i.getContent(), i.getDescription(),
                        i.getAuthor().getId(), i.getUpdatedAt())));
    }

    private static void assertItemShape(JsonNode item) {
        // 계약 ② — 「17」 ConventionLibraryItemDto · 「1」 UserRef 필드 그대로
        assertThat(item.propertyNames()).containsExactlyInAnyOrder(
                "id", "target", "name", "content", "description", "author", "updatedAt");
        assertThat(item.get("author").propertyNames()).containsExactlyInAnyOrder(
                "userId", "githubLogin", "displayName", "avatarUrl");
    }

    // ---- #61 읽기 ----

    @Test
    void aStudentWithoutAnyWorkspaceReadsTheWholeLibraryInOrder() throws Exception {
        String body = mvc.perform(get(PATH).session(studentSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].target").value(contains("branch_name", "issue_body", "pr_template")))
                .andExpect(jsonPath("$[0].name").value("브랜치 이름"))
                .andExpect(jsonPath("$[0].content").value("<type>/<이슈번호>-<설명>"))
                .andExpect(jsonPath("$[0].description").value("Git 전략"))
                .andExpect(jsonPath("$[0].author.userId").value(Ids.toApi(teacher.getId())))
                .andExpect(jsonPath("$[0].author.githubLogin").value("teacher"))
                .andExpect(jsonPath("$[0].updatedAt").value("2026-11-05T03:01:00Z"))
                .andReturn().getResponse().getContentAsString();

        assertItemShape(ContractShape.readTree(body).get(0));
        ContractShape.assertCommonRules(ContractShape.readTree(body));
    }

    @Test
    void instructorsAndReviewAccountsReadItToo() throws Exception {
        // 사무실 지정이 없는 허용 목록 강사 — 라이브러리 읽기는 사무실 밖이다
        mvc.perform(get(PATH).session(unassignedTeacherSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
        // 심사용 ROLE-04 계정도 조회는 한다(쓰기는 403 — 아래)
        mvc.perform(get(PATH).session(reviewSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void withoutASessionIsUnauthorized() throws Exception {
        mvc.perform(get(PATH))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
        write(post(PATH), null, VALID_BODY)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
    }

    // ---- #60 등록 · 수정 ----

    @Test
    void anAssignedGithubInstructorCreatesAnItem() throws Exception {
        String body = write(post(PATH), teacherSession, VALID_BODY)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.target").value("commit_message"))
                .andExpect(jsonPath("$.name").value("커밋 메시지"))
                .andExpect(jsonPath("$.content").value("<type>: <설명>"))
                .andExpect(jsonPath("$.author.userId").value(Ids.toApi(teacher.getId())))
                .andExpect(jsonPath("$.author.githubLogin").value("teacher"))
                .andReturn().getResponse().getContentAsString();

        JsonNode created = ContractShape.readTree(body);
        assertItemShape(created);
        ContractShape.assertCommonRules(created);
        assertThat(created.get("description").isNull()).isTrue();

        // 다른 사람도 바로 읽는다 — commit_message는 branch_name 다음
        mvc.perform(get(PATH).session(studentSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].target")
                        .value(contains("branch_name", "commit_message", "issue_body", "pr_template")))
                .andExpect(jsonPath("$[1].id").value(created.get("id").asString()));
    }

    @Test
    void anotherInstructorEditsAnItemSomeoneElseCreated() throws Exception {
        // FR-LIB-01 — 다른 강사가 만든 항목도 고친다. author는 만든 강사 그대로, 수정 시각은 새로
        write(put(itemPath(branchItem)), otherTeacherSession, "{\"target\":\"pr_title\",\"name\":\"PR 제목 규칙\","
                + "\"content\":\"<type>(<scope>)?: <설명>\",\"description\":\"50자 이내\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Ids.toApi(branchItem.getId())))
                .andExpect(jsonPath("$.target").value("pr_title"))
                .andExpect(jsonPath("$.name").value("PR 제목 규칙"))
                .andExpect(jsonPath("$.content").value("<type>(<scope>)?: <설명>"))
                .andExpect(jsonPath("$.description").value("50자 이내"))
                .andExpect(jsonPath("$.author.userId").value(Ids.toApi(teacher.getId())))
                .andExpect(jsonPath("$.updatedAt").value(not("2026-11-05T03:01:00Z")));

        mvc.perform(get(PATH).session(reviewSession))
                .andExpect(jsonPath("$[*].target").value(contains("pr_title", "issue_body", "pr_template")));
    }

    @Test
    void reviewAccountsStudentsAndInstructorsWithoutACurrentAssignmentAreForbidden() throws Exception {
        Map<Long, List<Object>> before = snapshot();
        String change = "{\"target\":\"pr_body\",\"name\":\"바뀐 이름\",\"content\":\"바뀐 본문\",\"description\":null}";

        for (MockHttpSession session : List.of(reviewSession, studentSession, unassignedTeacherSession,
                releasedTeacherSession)) {
            write(post(PATH), session, VALID_BODY)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
            write(put(itemPath(branchItem)), session, change)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
            // 역할을 대상보다 먼저 본다 — 없는 항목이어도 403
            write(put(PATH + "/999999"), session, change)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        // 거부 뒤 라이브러리 내용이 그대로(CONTRACTS.md 「9」)
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void lengthsAndTargetsOutsideTheContractAreInvalid() throws Exception {
        Map<Long, List<Object>> before = snapshot();
        List<String> bodies = List.of(
                "{\"target\":\"label_name\",\"name\":\"a\",\"content\":\"a\",\"description\":null}",
                "{\"name\":\"a\",\"content\":\"a\",\"description\":null}",
                "{\"target\":\"pr_title\",\"name\":\"\",\"content\":\"a\",\"description\":null}",
                "{\"target\":\"pr_title\",\"name\":\"" + "a".repeat(101) + "\",\"content\":\"a\",\"description\":null}",
                "{\"target\":\"pr_title\",\"name\":\"a\",\"content\":\"\",\"description\":null}",
                "{\"target\":\"pr_title\",\"name\":\"a\",\"content\":\"" + "a".repeat(20001) + "\",\"description\":null}",
                "{\"target\":\"pr_title\",\"name\":\"a\",\"content\":\"a\",\"description\":\"" + "a".repeat(2001) + "\"}");

        for (String body : bodies) {
            write(post(PATH), teacherSession, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
            write(put(itemPath(branchItem)), teacherSession, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void theLongestContractValuesAreStored() throws Exception {
        // content는 MEDIUMTEXT, description은 TEXT, name은 VARCHAR(100) — 계약 최대 길이(한글)가 그대로 들어간다
        String name = "다".repeat(100);
        String content = "가".repeat(20000);
        String description = "나".repeat(2000);
        write(post(PATH), teacherSession, "{\"target\":\"pr_template\",\"name\":\"" + name
                + "\",\"content\":\"" + content + "\",\"description\":\"" + description + "\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.content").value(content))
                .andExpect(jsonPath("$.description").value(description));
    }

    @Test
    void editingAMissingItemIsNotFound() throws Exception {
        write(put(PATH + "/999999"), teacherSession, VALID_BODY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        write(put(PATH + "/abc"), teacherSession, VALID_BODY)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}
