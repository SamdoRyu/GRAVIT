package com.samdoryu.backend.sync.domain;

import com.samdoryu.backend.workspace.domain.Member;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;

/**
 * 대표 담당자 순서(CONTRACTS.md 「3」 대표 담당자 · 「10」 구현 기본값) — 규칙은 여기 한 곳에만 둔다.
 * 그 사무실 팀원인 담당자 중 GitHub 사용자 ID(숫자)가 가장 작은 사람이 첫 번째. GitHub 사용자 ID가 없는 시연 Seed 팀원은
 * 뒤에, 그 안에서는 {@code memberId} 순. 서버가 {@code assigneeMemberIds}를 이 순서로 보내고 화면은 첫 번째를 대표로 쓴다.
 */
public final class AssigneeOrder {

    public static final Comparator<Member> REPRESENTATIVE_FIRST = Comparator
            .comparing(Member::githubUserId, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Member::getId, Comparator.nullsLast(Comparator.naturalOrder()));

    private AssigneeOrder() {
    }

    public static List<Member> sort(Collection<Member> assignees) {
        return assignees.stream().sorted(REPRESENTATIVE_FIRST).toList();
    }
}
