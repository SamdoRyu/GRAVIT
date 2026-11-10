package com.samdoryu.backend.meeting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** #315 — 원본 도움 요청이 영구 삭제된 안건: 행은 남고 원본 연결 · 원문 제목만 사라진다. 결정 전이면 거둔다. */
class AgendaItemDetachDeletedHelpRequestTest {

    private static final Instant T0 = Instant.parse("2026-11-10T01:00:00Z");

    private Workspace workspace;
    private Member alice;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = AppUser.github(1001L, "alice", "앨리스", null);
        workspace = Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0);
        alice = Member.collaborator(workspace, aliceUser, 0, true, T0);
    }

    private AgendaItem helpAgenda() {
        return AgendaItem.forHelpRequest(workspace, 40L, "세션이 자꾸 끊겨요", alice, T0);
    }

    @Test
    void confirmedItemIsWithdrawnAndLosesItsSourceAndTitle() {
        AgendaItem item = helpAgenda();

        item.detachDeletedHelpRequest();

        assertThat(item.getStatus()).isEqualTo(AgendaStatus.WITHDRAWN);
        assertThat(item.getSourceHelpRequestId()).isNull();
        assertThat(item.getTitle()).isEqualTo(AgendaItem.DELETED_HELP_REQUEST_TITLE);
    }

    /** 결정 기록은 지우지 않는다 — 상태 · 결론 · 배운 점 · 회의는 그대로, 원본 연결과 원문 제목만. */
    @Test
    void discussedItemKeepsItsDecision() {
        AgendaItem item = helpAgenda();
        Meeting meeting = new Meeting(workspace, List.of(alice), T0);
        item.decide("쿠키 SameSite를 Lax로", "세션 쿠키 속성", null, null, null, meeting, alice, T0.plusSeconds(60));

        item.detachDeletedHelpRequest();

        assertThat(item.getStatus()).isEqualTo(AgendaStatus.DISCUSSED);
        assertThat(item.getConclusion()).isEqualTo("쿠키 SameSite를 Lax로");
        assertThat(item.getLearning()).isEqualTo("세션 쿠키 속성");
        assertThat(item.getMeeting()).isSameAs(meeting);
        assertThat(item.getSourceHelpRequestId()).isNull();
        assertThat(item.getTitle()).isEqualTo(AgendaItem.DELETED_HELP_REQUEST_TITLE);
    }

    @Test
    void withdrawnItemStaysWithdrawn() {
        AgendaItem item = helpAgenda();
        item.withdraw();

        item.detachDeletedHelpRequest();

        assertThat(item.getStatus()).isEqualTo(AgendaStatus.WITHDRAWN);
        assertThat(item.getSourceHelpRequestId()).isNull();
    }

    @Test
    void onlyHelpRequestItemsCanBeDetached() {
        AgendaItem learning = AgendaItem.withoutSource(workspace, AgendaKind.LEARNING, "배운 점", null, null, null,
                alice, T0);

        assertThatThrownBy(learning::detachDeletedHelpRequest).isInstanceOf(IllegalStateException.class);
    }
}
