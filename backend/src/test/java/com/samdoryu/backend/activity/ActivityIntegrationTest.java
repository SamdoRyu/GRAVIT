package com.samdoryu.backend.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.activity.repository.ActivityConfirmationRepository;
import com.samdoryu.backend.activity.repository.ActivityRecordRepository;
import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
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
 * #173 FR-ACT-01~03 — 활동 기록 · 확인 · 수집 동의(CONTRACTS_API 「14」)와 그것이 Snapshot {@code activityNotes} · 회고 리포트
 * {@code activityDistribution}에 나오는 규칙을 실제 Security · MVC · MySQL로 본다.
 * 확인 전 활동은 사무실과 리포트에 없고(F8 ①), 팀 화면 어디에도 활동 시간이 없다(F8 ② · P6).
 * DTO ↔ 계약(①)은 {@code ActivityContractTest}.
 */
@SpringBootTest(properties = {
        "app.origin=" + ActivityIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + ActivityIntegrationTest.INSTRUCTOR_ID})
@AutoConfigureMockMvc
@Transactional
class ActivityIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-06T00:00:00Z");
    /** 계약 「14」 ActivityRecordDto 모양 — 값 종류만 본다(ActivityContractTest의 예시와 같은 모양). */
    private static final String CONTRACT_RECORD_SHAPE = "{\"id\":\"40\",\"authorMemberId\":\"12\",\"kind\":\"planning\","
            + "\"content\":\"정리\",\"durationMinutes\":90,\"status\":\"pending\",\"confirmedByMemberIds\":[\"13\"],"
            + "\"createdAt\":\"2026-11-06T02:00:00Z\"}";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired ActivityRecordRepository records;
    @Autowired ActivityConfirmationRepository confirmations;

    private Workspace ws;
    private Member alice;
    private Member bob;
    private Member carol;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession carolSession;
    private MockHttpSession instructorSession;
    private MockHttpSession daveSession;
    private String base;
    private String otherBase;

    /** 앨리스 · 캐럴은 수집 동의, 밥은 안 함. 데이브는 다른 사무실 팀원, 강사(9001)는 이 사무실에 지정. */
    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        AppUser daveUser = users.saveAndFlush(AppUser.github(1004L, "dave", "데이브", null));
        AppUser instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_ID, "teacher", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        Workspace otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, daveUser, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));

        alice = Member.collaborator(ws, aliceUser, 0, true, T0);
        alice.giveActivityConsent(T0);
        alice = members.saveAndFlush(alice);
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        carol = Member.collaborator(ws, carolUser, 2, false, T0);
        carol.giveActivityConsent(T0);
        carol = members.saveAndFlush(carol);
        Member dave = Member.collaborator(otherWs, daveUser, 0, true, T0);
        dave.giveActivityConsent(T0);
        dave = members.saveAndFlush(dave);
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_ID, aliceUser, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        carolSession = TestLogin.githubUser(carolUser.getId(), 1003L)
                .member(ws.getId(), carol.getId(), WorkspaceRole.PARTICIPANT).session();
        daveSession = TestLogin.githubUser(daveUser.getId(), 1004L)
                .member(otherWs.getId(), dave.getId(), WorkspaceRole.REPO_ADMIN).session();
        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_ID).session();
        base = "/api/workspaces/" + Ids.toApi(ws.getId());
        otherBase = "/api/workspaces/" + Ids.toApi(otherWs.getId());
    }

    private ResultActions write(MockHttpServletRequestBuilder builder, MockHttpSession session, String json)
            throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        builder.session(session).cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN);
        if (json != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mvc.perform(builder);
    }

    private ResultActions create(MockHttpSession session, String kind, String content, int minutes) throws Exception {
        return write(post(base + "/activities"), session,
                "{\"kind\":\"" + kind + "\",\"content\":\"" + content + "\",\"durationMinutes\":" + minutes + "}");
    }

    private String createId(MockHttpSession session, String kind, String content, int minutes) throws Exception {
        String body = create(session, kind, content, minutes).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ContractShape.readTree(body).get("id").asString();
    }

    private ResultActions confirm(MockHttpSession session, String workspaceBase, String activityId) throws Exception {
        return write(post(workspaceBase + "/activities/" + activityId + "/confirm"), session, null);
    }

    private JsonNode read(MockHttpServletRequestBuilder request) throws Exception {
        return ContractShape.readTree(mvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private static List<String> ids(JsonNode items) {
        List<String> ids = new ArrayList<>();
        items.forEach(item -> ids.add(item.get("id").asString()));
        return ids;
    }

    @Test
    void consentIsTheMembersOwnChoiceAndShowsInTheViewer() throws Exception {
        write(put(base + "/activity-consent"), bobSession, "{\"consented\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activityConsented").value(true));
        mvc.perform(get(base + "/snapshot").session(bobSession))
                .andExpect(jsonPath("$.viewer.activityConsented").value(true));

        write(put(base + "/activity-consent"), bobSession, "{\"consented\":false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activityConsented").value(false));
        mvc.perform(get(base + "/snapshot").session(bobSession))
                .andExpect(jsonPath("$.viewer.activityConsented").value(false));

        write(put(base + "/activity-consent"), instructorSession, "{\"consented\":true}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        write(put(base + "/activity-consent"), bobSession, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
    }

    /** 계약 ② — 새 활동은 pending, 확인자 없음. 응답 모양은 ActivityRecordDto. */
    @Test
    void aConsentedMemberWritesAPendingActivity() throws Exception {
        String body = create(aliceSession, "planning", "요구사항 정의서 정리", 90)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        JsonNode created = ContractShape.readTree(body);
        ContractShape.assertSameShape(ContractShape.readTree(CONTRACT_RECORD_SHAPE), created);
        ContractShape.assertCommonRules(created);
        assertThat(created.get("authorMemberId").asString()).isEqualTo(Ids.toApi(alice.getId()));
        assertThat(created.get("kind").asString()).isEqualTo("planning");
        assertThat(created.get("content").asString()).isEqualTo("요구사항 정의서 정리");
        assertThat(created.get("durationMinutes").asInt()).isEqualTo(90);
        assertThat(created.get("status").asString()).isEqualTo("pending");
        assertThat(created.get("confirmedByMemberIds").isEmpty()).isTrue();
    }

    @Test
    void writingNeedsConsentAndATeamMemberAndAValidBody() throws Exception {
        create(bobSession, "design", "시안 정리", 30)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        create(instructorSession, "design", "시안 정리", 30)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        for (String bad : new String[] {
                "{\"kind\":\"coding\",\"content\":\"a\",\"durationMinutes\":30}",
                "{\"kind\":\"design\",\"content\":\"   \",\"durationMinutes\":30}",
                "{\"kind\":\"design\",\"content\":\"" + "a".repeat(501) + "\",\"durationMinutes\":30}",
                "{\"kind\":\"design\",\"content\":\"a\",\"durationMinutes\":0}",
                "{\"kind\":\"design\",\"content\":\"a\",\"durationMinutes\":1441}",
                "{\"kind\":\"design\",\"content\":\"a\"}"}) {
            write(post(base + "/activities"), aliceSession, bad)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        assertThat(records.count()).isZero();
    }

    /** FR-ACT-02 — 작성자가 아닌 팀원 1명 이상이 확인하면 confirmed. 같은 사람이 다시 확인해도 그대로. */
    @Test
    void anotherMemberConfirmsAndConfirmingTwiceChangesNothing() throws Exception {
        String id = createId(aliceSession, "research", "경쟁 서비스 조사", 60);

        confirm(bobSession, base, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.confirmedByMemberIds[0]").value(Ids.toApi(bob.getId())));
        confirm(bobSession, base, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmedByMemberIds.length()").value(1));
        // 수집 동의는 쓰는 사람의 조건이다 — 확인하는 팀원(밥)은 동의하지 않아도 된다
        confirm(carolSession, base, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmedByMemberIds[1]").value(Ids.toApi(carol.getId())));
        assertThat(confirmations.count()).isEqualTo(2);
    }

    @Test
    void theAuthorAndInstructorsCannotConfirmAndOtherWorkspacesAreHidden() throws Exception {
        String id = createId(aliceSession, "design", "로고 시안", 45);

        confirm(aliceSession, base, id)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        confirm(instructorSession, base, id)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 다른 사무실 팀원이 자기 사무실 경로에 이 활동 ID를 넣어도 존재를 모른다(IDOR)
        confirm(daveSession, otherBase, id)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        confirm(bobSession, base, "999999")
                .andExpect(status().isNotFound());
        assertThat(confirmations.count()).isZero();
    }

    @Test
    void listIsNewestFirstWithStatusFilterAndPages() throws Exception {
        String first = createId(aliceSession, "planning", "기획 1", 30);
        String second = createId(carolSession, "presentation", "발표 연습", 40);
        String third = createId(aliceSession, "mentor_question", "멘토에게 질문", 20);
        confirm(bobSession, base, second).andExpect(status().isOk());

        assertThat(ids(read(get(base + "/activities").session(bobSession)).get("items")))
                .containsExactly(third, second, first);
        assertThat(ids(read(get(base + "/activities?status=confirmed").session(bobSession)).get("items")))
                .containsExactly(second);
        assertThat(ids(read(get(base + "/activities?status=pending").session(bobSession)).get("items")))
                .containsExactly(third, first);

        JsonNode page = read(get(base + "/activities?page=1&size=2").session(instructorSession));
        assertThat(ids(page.get("items"))).containsExactly(first);
        assertThat(page.get("page").asInt()).isEqualTo(1);
        assertThat(page.get("size").asInt()).isEqualTo(2);
        assertThat(page.get("totalItems").asLong()).isEqualTo(3);
        assertThat(page.get("totalPages").asInt()).isEqualTo(2);

        for (String bad : new String[] {"?status=done", "?size=0", "?size=101", "?page=-1"}) {
            mvc.perform(get(base + "/activities" + bad).session(bobSession))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        // 다른 사무실 목록에는 없다
        assertThat(read(get(otherBase + "/activities").session(daveSession)).get("items").isEmpty()).isTrue();
    }

    /** F8 ① · ② — 사무실 메모지는 확인된 활동만, 첫 확인 시각으로. 시간 · 내용은 Snapshot 어디에도 없다. */
    @Test
    void snapshotNotesShowOnlyConfirmedActivitiesWithoutTimeOrContent() throws Exception {
        mvc.perform(get(base + "/snapshot").session(aliceSession)).andExpect(jsonPath("$.activityNotes").value(empty()));
        String pending = createId(aliceSession, "planning", "아직 확인 안 됨", 30);
        String confirmed = createId(aliceSession, "design", "확인된 시안", 50);
        confirm(bobSession, base, confirmed).andExpect(status().isOk());
        confirm(carolSession, base, confirmed).andExpect(status().isOk());

        String body = mvc.perform(get(base + "/snapshot").session(instructorSession)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        JsonNode notes = ContractShape.readTree(body).get("activityNotes");
        assertThat(ids(notes)).containsExactly(confirmed).doesNotContain(pending);
        JsonNode note = notes.get(0);
        assertThat(note.propertyNames()).containsExactlyInAnyOrder("id", "authorMemberId", "kind", "confirmedAt");
        assertThat(note.get("authorMemberId").asString()).isEqualTo(Ids.toApi(alice.getId()));
        assertThat(note.get("kind").asString()).isEqualTo("design");
        String firstConfirmedAt = confirmations.findAll().stream().map(c -> c.getConfirmedAt()).min(Instant::compareTo)
                .orElseThrow().toString();
        assertThat(Instant.parse(note.get("confirmedAt").asString())).isEqualTo(Instant.parse(firstConfirmedAt));
        ContractShape.assertCommonRules(notes);
        assertThat(body).doesNotContain("durationMinutes").doesNotContain("확인된 시안").doesNotContain("아직 확인 안 됨");
    }

    /** FR-ACT-03 — 리포트 분포는 본인의 확인된 활동만 유형별 분 합계. 확인 전 · 다른 사람 것은 빠진다. */
    @Test
    void reportDistributionCountsOnlyMyConfirmedActivities() throws Exception {
        String planA = createId(aliceSession, "planning", "기획 1", 30);
        String planB = createId(aliceSession, "planning", "기획 2", 60);
        String research = createId(aliceSession, "research", "조사", 25);
        createId(aliceSession, "design", "확인 안 된 시안", 100);
        String carols = createId(carolSession, "planning", "캐럴 기획", 500);
        for (String id : List.of(planA, planB, research)) {
            confirm(bobSession, base, id).andExpect(status().isOk());
        }
        confirm(aliceSession, base, carols).andExpect(status().isOk());

        String reportBody = write(post(base + "/members/" + Ids.toApi(alice.getId()) + "/reports"), aliceSession,
                "{\"kind\":\"final\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();

        JsonNode report = ContractShape.readTree(reportBody);
        JsonNode distribution = report.get("activityDistribution");
        assertThat(distribution.size()).isEqualTo(2);
        assertThat(distribution.get(0).get("kind").asString()).isEqualTo("planning");
        assertThat(distribution.get(0).get("totalMinutes").asInt()).isEqualTo(90);
        assertThat(distribution.get(1).get("kind").asString()).isEqualTo("research");
        assertThat(distribution.get(1).get("totalMinutes").asInt()).isEqualTo(25);

        String markdown = mvc.perform(get(base + "/members/" + Ids.toApi(alice.getId()) + "/reports/"
                        + report.get("id").asString() + "/markdown").session(aliceSession))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(markdown).contains("## 활동 분포\n\n- 기획: 90분\n- 자료조사: 25분\n");
    }
}
