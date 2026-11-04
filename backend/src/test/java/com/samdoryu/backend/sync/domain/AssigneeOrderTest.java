package com.samdoryu.backend.sync.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** 대표 담당자 순서(CONTRACTS.md 「3」) — GitHub 사용자 ID 오름차순, ID 없는 Seed 팀원은 뒤에 memberId 순. */
class AssigneeOrderTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Workspace WS = Workspace.demo("시연", T0);

    private static Member real(long memberId, long githubUserId) {
        Member m = Member.collaborator(WS, AppUser.github(githubUserId, "u" + githubUserId, "u", null), 0, false, T0);
        ReflectionTestUtils.setField(m, "id", memberId);
        return m;
    }

    private static Member seed(long memberId) {
        Member m = Member.demoSeed(WS, "seed-" + memberId, "s", null, 0);
        ReflectionTestUtils.setField(m, "id", memberId);
        return m;
    }

    @Test
    void smallestGithubUserIdFirstThenSeedMembersByMemberId() {
        Member bigGithubId = real(1, 9_000_000_000L);
        Member smallGithubId = real(2, 1001);
        Member seedLater = seed(5);
        Member seedEarlier = seed(4);

        List<Member> sorted = AssigneeOrder.sort(List.of(seedLater, bigGithubId, seedEarlier, smallGithubId));

        assertThat(sorted).containsExactly(smallGithubId, bigGithubId, seedEarlier, seedLater);
    }

    @Test
    void comparesGithubIdsNumericallyNotAsText() {
        Member nine = real(1, 9);
        Member ten = real(2, 10);

        assertThat(AssigneeOrder.sort(List.of(ten, nine))).containsExactly(nine, ten);
    }

    @Test
    void emptyStaysEmpty() {
        assertThat(AssigneeOrder.sort(List.of())).isEmpty();
    }
}
