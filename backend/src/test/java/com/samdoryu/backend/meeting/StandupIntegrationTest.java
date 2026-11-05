package com.samdoryu.backend.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * #35 스탠드업 — 실제 Security · MVC · MySQL(CONTRACTS_API 「12」). 테스트마다 트랜잭션을 되돌린다.
 * "오늘"은 한국 시간 달력 날짜라 서버 시계 기준으로 만든다.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/meeting/standup.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + StandupIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + StandupIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class StandupIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant PAST = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired StandupRepository standups;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository taskAssignees;
    @Autowired SubmissionRepository submissions;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Member bobElsewhere;
    private LocalDate today;
    private MockHttpSession aliceSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, PAST));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, bobUser, PAST));
        // 밥이 먼저 팀원이 된다 — memberId 순서가 저장 순서와 다르게
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, PAST));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, PAST));
        bobElsewhere = members.saveAndFlush(Member.collaborator(otherWs, bobUser, 0, true, PAST));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, PAST));
        today = LocalDate.now(Standup.DATE_ZONE);

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/standups";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions save(Workspace workspace, MockHttpSession session, String date, String body)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(put(base(workspace) + "/" + date + "/mine").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(String yesterday, String blockers) {
        return "{\"yesterday\":\"" + yesterday + "\",\"blockers\":"
                + (blockers == null ? "null" : "\"" + blockers + "\"") + "}";
    }

    private Standup saved(Member member, LocalDate date) {
        em.flush();
        em.clear();
        return standups.findByWorkspaceIdAndMemberIdAndDate(ws.getId(), member.getId(), date).orElseThrow();
    }

    /** 없으면 만들고, 다시 쓰면 같은 행을 고친다(하루 하나). */
    @Test
    void memberWritesTodayThenRewritesSameRow() throws Exception {
        String response = save(ws, aliceSession, today.toString(), body("로그인 세션 붙임", "로그아웃 뒤에도 세션이 남아요"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.date").value(today.toString()))
                .andExpect(jsonPath("$.yesterday").value("로그인 세션 붙임"))
                .andExpect(jsonPath("$.blockers").value("로그아웃 뒤에도 세션이 남아요"))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "standup.json"), actual);
        ContractShape.assertCommonRules(actual);
        String id = actual.get("id").asString();

        save(ws, aliceSession, today.toString(), body("", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.yesterday").value(""))
                .andExpect(jsonPath("$.blockers").value(nullValue()));

        assertThat(standups.count()).isEqualTo(1);
        assertThat(saved(alice, today).getYesterday()).isEmpty();
    }

    @Test
    void pastDateIsAllowedFutureIs400() throws Exception {
        save(ws, aliceSession, today.minusDays(3).toString(), body("지난 주 기록", null)).andExpect(status().isOk());
        save(ws, aliceSession, today.plusDays(1).toString(), body("내일", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));

        assertThat(standups.count()).isEqualTo(1);
    }

    /** 그날 쓴 팀원 것만, memberId 순. 다른 날 · 다른 사무실 것은 빠진다. 강사도 읽는다. */
    @Test
    void listByDateInMemberOrder() throws Exception {
        standups.saveAndFlush(new Standup(ws, alice, today, "앨리스", null, PAST));
        standups.saveAndFlush(new Standup(ws, bob, today, "밥", "막힘", PAST));
        standups.saveAndFlush(new Standup(ws, bob, today.minusDays(1), "어제의 밥", null, PAST));
        standups.saveAndFlush(new Standup(otherWs, bobElsewhere, today, "다른 사무실", null, PAST));

        mvc.perform(get(base(ws)).param("date", today.toString()).session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].memberId").value(Ids.toApi(bob.getId())))
                .andExpect(jsonPath("$[1].memberId").value(Ids.toApi(alice.getId())));
        mvc.perform(get(base(ws)).param("date", today.minusDays(7).toString()).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void dateMissingOrMalformedIs400() throws Exception {
        mvc.perform(get(base(ws)).session(aliceSession)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        mvc.perform(get(base(ws)).param("date", "2026/11/05").session(aliceSession))
                .andExpect(status().isBadRequest());
        save(ws, aliceSession, "11-05", body("형식", null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        save(ws, aliceSession, today.toString(), "{\"blockers\":null}").andExpect(status().isBadRequest());
        save(ws, aliceSession, today.toString(), body("a".repeat(2001), null)).andExpect(status().isBadRequest());

        assertThat(standups.count()).isZero();
    }

    @Test
    void instructorCannotWrite() throws Exception {
        save(ws, instructorSession, today.toString(), body("강사", null))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(standups.count()).isZero();
    }

    /** 내 사무실이 아닌 사무실 경로는 존재를 숨긴다. */
    @Test
    void workspaceWithoutAccessIs404() throws Exception {
        save(otherWs, aliceSession, today.toString(), body("남의 사무실", null)).andExpect(status().isNotFound());
        mvc.perform(get(base(otherWs)).param("date", today.toString()).session(aliceSession))
                .andExpect(status().isNotFound());
    }

    /** "막힌 것" → 도움 요청: 화면이 쓴 스탠드업 ID를 fromStandupId로 넘긴다. */
    @Test
    void blockersBecomeHelpRequestFromThisStandup() throws Exception {
        String standupId = ContractShape.readTree(save(ws, aliceSession, today.toString(), body("배포", "CI가 실패해요"))
                .andReturn().getResponse().getContentAsString()).get("id").asString();

        String token = csrfToken();
        mvc.perform(post("/api/workspaces/" + Ids.toApi(ws.getId()) + "/help-requests").session(aliceSession)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"CI가 실패해요\",\"fromStandupId\":\"" + standupId + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fromStandupId").value(standupId));
    }

    // ---- #34 "어제 한 일" 미리 채우기 -----------------------------------------------------------------

    /** 2026-11-05의 전날 = 한국 시간 11월 4일 = UTC 11-03T15:00 이상 11-04T15:00 미만. */
    private static final LocalDate PREFILL_DATE = LocalDate.parse("2026-11-05");
    private static final Instant LONG_AGO = Instant.parse("2026-11-01T00:00:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    private Task issue(int number, Instant closedAt) {
        return tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(number).title("이슈 " + number)
                .state(TaskState.CLOSED).closedReason(TaskClosedReason.COMPLETED).labelsJson("[]")
                .githubCreatedAt(LONG_AGO).githubUpdatedAt(closedAt).closedAt(closedAt).stateChangedAt(closedAt)
                .syncedAt(closedAt).build());
    }

    private Submission pr(int number, Member author, long authorGithubId, Instant createdAt, Instant mergedAt,
            String reviewsJson) {
        return submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(number).title("PR " + number)
                .authorGithubUserId(authorGithubId).authorMember(author)
                .state(mergedAt == null ? SubmissionState.OPEN : SubmissionState.MERGED).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson(reviewsJson).labelsJson("[]").githubCreatedAt(createdAt)
                .githubUpdatedAt(createdAt).mergedAt(mergedAt).closedAt(mergedAt).stateChangedAt(createdAt)
                .syncedAt(createdAt).build());
    }

    private static String review(long githubUserId, String login, String submittedAt) {
        return "{\"reviewerGithubUserId\":" + githubUserId + ",\"reviewerGithubLogin\":\"" + login
                + "\",\"state\":\"approved\",\"submittedAt\":\"" + submittedAt + "\"}";
    }

    /** 내가 연 PR · 머지된 내 PR · 내가 제출한 리뷰 · 내가 담당자인 이슈의 닫힘 — 전날 한국 시간 하루 안만, 시각 순. */
    @Test
    void prefillCollectsMyGithubActivityOfThePreviousKstDay() throws Exception {
        pr(15, alice, 1001L, Instant.parse("2026-11-04T03:00:00Z"), null, "[]");
        pr(16, alice, 1001L, LONG_AGO, Instant.parse("2026-11-04T14:59:59Z"), "[]"); // 한국 시간 11-04 23:59:59
        pr(17, bob, 1002L, Instant.parse("2026-11-04T01:00:00Z"), null, "[" // 밥의 PR — 밥이 연 것은 빠진다
                + review(1001L, "alice", "2026-11-04T06:30:00Z") + ","
                + review(1001L, "alice", "2026-11-03T14:59:00Z") + "," // 한국 시간 11-03 — 빠진다
                + review(1002L, "bob", "2026-11-04T07:00:00Z") + "]");
        pr(18, alice, 1001L, Instant.parse("2026-11-04T15:00:00Z"), null, "[]"); // 한국 시간 11-05 00:00 — 빠진다
        taskAssignees.saveAndFlush(new TaskAssignee(issue(12, Instant.parse("2026-11-04T09:00:00Z")), alice, LONG_AGO));
        taskAssignees.saveAndFlush(new TaskAssignee(issue(13, Instant.parse("2026-11-04T10:00:00Z")), bob, LONG_AGO));
        em.clear();

        String response = mvc.perform(get(base(ws) + "/" + PREFILL_DATE + "/mine/prefill").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.date").value("2026-11-05"))
                .andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[0].kind").value("pr_opened"))
                .andExpect(jsonPath("$.items[0].githubNumber").value(15))
                .andExpect(jsonPath("$.items[0].title").value("PR 15"))
                .andExpect(jsonPath("$.items[1].kind").value("review_submitted"))
                .andExpect(jsonPath("$.items[1].githubNumber").value(17))
                .andExpect(jsonPath("$.items[2].kind").value("issue_closed"))
                .andExpect(jsonPath("$.items[2].githubNumber").value(12))
                .andExpect(jsonPath("$.items[3].kind").value("pr_merged"))
                .andExpect(jsonPath("$.items[3].githubNumber").value(16))
                .andExpect(jsonPath("$.items[3].occurredAt").value("2026-11-04T14:59:59Z"))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "standup-prefill.json"), actual);
        ContractShape.assertCommonRules(actual);
    }

    @Test
    void prefillWithoutActivityIsEmpty() throws Exception {
        mvc.perform(get(base(ws) + "/" + PREFILL_DATE + "/mine/prefill").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void prefillIsForTeamMembersWithAValidDate() throws Exception {
        mvc.perform(get(base(ws) + "/" + PREFILL_DATE + "/mine/prefill").session(instructorSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        mvc.perform(get(base(ws) + "/11-05/mine/prefill").session(aliceSession))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        mvc.perform(get(base(otherWs) + "/" + PREFILL_DATE + "/mine/prefill").session(aliceSession))
                .andExpect(status().isNotFound());
    }
}
