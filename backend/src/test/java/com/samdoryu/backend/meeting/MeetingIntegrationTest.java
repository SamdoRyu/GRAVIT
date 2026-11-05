package com.samdoryu.backend.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * #36 회의 시작 · 종료 — 실제 Security · MVC · MySQL(CONTRACTS_API 「10」, CONTRACTS.md 「6」 검사 순서).
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/meeting/meeting.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + MeetingIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + MeetingIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class MeetingIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    /** 끝내는 시각은 서버의 지금이라 끝낼 회의는 과거에 시작한다 — DB CHECK {@code ended_at >= started_at}. */
    private static final Instant STARTED = Instant.now().minus(Duration.ofHours(1));

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired MeetingRepository meetings;
    @Autowired AgendaItemRepository agendaItems;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Member carol;
    private Member aliceElsewhere;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        carol = Member.collaborator(ws, carolUser, 2, false, T0);
        carol.remove(T0);
        carol = members.saveAndFlush(carol);
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), aliceElsewhere.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/meetings";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions write(String path, MockHttpSession session, String body) throws Exception {
        String token = csrfToken();
        return mvc.perform(post(path).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions start(Workspace workspace, MockHttpSession session, Member... attendees) throws Exception {
        String ids = String.join(",", Arrays.stream(attendees)
                .map(member -> "\"" + Ids.toApi(member.getId()) + "\"").toList());
        return write(base(workspace), session, "{\"attendeeMemberIds\":[" + ids + "]}");
    }

    private ResultActions end(Workspace workspace, Meeting meeting, MockHttpSession session, String notesJson)
            throws Exception {
        return write(base(workspace) + "/" + Ids.toApi(meeting.getId()) + "/end", session, "{\"notes\":" + notesJson + "}");
    }

    private Meeting ongoingMeeting(Workspace workspace, List<Member> attendees) {
        return meetings.saveAndFlush(new Meeting(workspace, attendees, STARTED));
    }

    // ---- 시작 ------------------------------------------------------------------------------------

    @Test
    void memberStartsMeeting() throws Exception {
        String response = start(ws, bobSession, bob, alice, bob)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ongoing"))
                .andExpect(jsonPath("$.startedAt").isString())
                .andExpect(jsonPath("$.endedAt").value(nullValue()))
                // id 오름차순, 같은 참석자는 한 번
                .andExpect(jsonPath("$.attendeeMemberIds").value(contains(Ids.toApi(alice.getId()),
                        Ids.toApi(bob.getId()))))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.discussedAgendaItemIds").value(empty()))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "meeting.json"), actual);
        ContractShape.assertCommonRules(actual);
        em.flush();
        em.clear();
        assertThat(meetings.findByIdAndWorkspaceId(Ids.fromPath(actual.get("id").asString()), ws.getId())
                .orElseThrow().isOngoing()).isTrue();
    }

    @Test
    void attendeesMayBeEmpty() throws Exception {
        start(ws, aliceSession).andExpect(status().isCreated())
                .andExpect(jsonPath("$.attendeeMemberIds").value(empty()));
    }

    @Test
    void secondOngoingMeetingIs409() throws Exception {
        ongoingMeeting(ws, List.of(alice));

        start(ws, bobSession, bob).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        assertThat(meetings.count()).isEqualTo(1);
    }

    /** 다른 사무실은 따로 센다 — 다른 사무실에 진행 중 회의가 있어도 시작할 수 있다. */
    @Test
    void ongoingMeetingOfAnotherWorkspaceDoesNotBlock() throws Exception {
        ongoingMeeting(otherWs, List.of(aliceElsewhere));

        start(ws, aliceSession, alice).andExpect(status().isCreated());
    }

    /** 「10」 — 참석자가 지금 팀원이 아님(다른 사무실 · 빠진 팀원 · 없는 ID) · ID 형식 오류는 400. 회의를 만들지 않는다. */
    @Test
    void attendeeWhoIsNotACurrentMemberIs400() throws Exception {
        start(ws, aliceSession, alice, aliceElsewhere).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        start(ws, aliceSession, carol).andExpect(status().isBadRequest());
        write(base(ws), aliceSession, "{\"attendeeMemberIds\":[\"999999\"]}").andExpect(status().isBadRequest());
        write(base(ws), aliceSession, "{\"attendeeMemberIds\":[\"abc\"]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        write(base(ws), aliceSession, "{}").andExpect(status().isBadRequest());
        assertThat(meetings.count()).isZero();
    }

    @Test
    void instructorCannotStartOrEnd() throws Exception {
        start(ws, instructorSession).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        Meeting meeting = ongoingMeeting(ws, List.of(alice));
        end(ws, meeting, instructorSession, "null").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(meetings.count()).isEqualTo(1);
    }

    // ---- 종료 ------------------------------------------------------------------------------------

    /** 시작한 사람이 아니어도 끝낼 수 있다. 끝나면 다룬 안건이 보이고, 새 회의를 시작할 수 있다. */
    @Test
    void memberEndsMeetingThenANewOneCanStart() throws Exception {
        Meeting meeting = ongoingMeeting(ws, List.of(alice, bob));
        AgendaItem discussed = agendaItems.saveAndFlush(
                AgendaItem.withoutSource(ws, AgendaKind.OTHER, "회고 일정", null, null, null, alice, STARTED));
        // 결정 기록 API는 #37 몫이라 DB로 준비한다
        em.createNativeQuery("update agenda_item set status = 'DISCUSSED', conclusion = '정함', "
                        + "decided_at = ?1, decided_by_member_id = ?2, meeting_id = ?3 where id = ?4")
                .setParameter(1, STARTED.plusSeconds(60)).setParameter(2, alice.getId())
                .setParameter(3, meeting.getId()).setParameter(4, discussed.getId()).executeUpdate();
        em.clear();

        String response = end(ws, meeting, bobSession, "\"실패 응답은 계약대로\"")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Ids.toApi(meeting.getId())))
                .andExpect(jsonPath("$.status").value("ended"))
                .andExpect(jsonPath("$.endedAt").isString())
                .andExpect(jsonPath("$.notes").value("실패 응답은 계약대로"))
                .andExpect(jsonPath("$.discussedAgendaItemIds").value(contains(Ids.toApi(discussed.getId()))))
                .andReturn().getResponse().getContentAsString();
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "meeting.json"),
                ContractShape.readTree(response));

        start(ws, aliceSession, alice).andExpect(status().isCreated());
    }

    @Test
    void endingWithoutNotesIsAllowed() throws Exception {
        Meeting meeting = ongoingMeeting(ws, List.of());

        end(ws, meeting, aliceSession, "null").andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value(nullValue()));
    }

    @Test
    void endingAnEndedMeetingIs409() throws Exception {
        Meeting meeting = ongoingMeeting(ws, List.of(alice));
        end(ws, meeting, aliceSession, "null").andExpect(status().isOk());

        end(ws, meeting, aliceSession, "\"다시\"").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
    }

    @Test
    void notesOver5000CharsIs400() throws Exception {
        Meeting meeting = ongoingMeeting(ws, List.of(alice));

        end(ws, meeting, aliceSession, "\"" + "a".repeat(5001) + "\"").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        em.flush();
        em.clear();
        assertThat(meetings.findById(meeting.getId()).orElseThrow().isOngoing()).isTrue();
    }

    /** IDOR — 다른 사무실의 회의를 내 사무실 경로로 끝내면 404. */
    @Test
    void endingMeetingOfAnotherWorkspaceIs404() throws Exception {
        Meeting elsewhere = ongoingMeeting(otherWs, List.of(aliceElsewhere));

        end(ws, elsewhere, aliceSession, "null").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        em.flush();
        em.clear();
        assertThat(meetings.findById(elsewhere.getId()).orElseThrow().isOngoing()).isTrue();
    }
}
