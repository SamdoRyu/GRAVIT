package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * GitHub 계정 → 그 사무실의 지금 팀원.
 * <ul>
 *   <li>실제 사무실: <b>GitHub 사용자 ID로만</b> 짝짓는다 — 로그인 이름은 바뀔 수 있어 연결 판정에 쓰지 않는다(「2」 · 「6」 식별자 원칙).</li>
 *   <li>시연 사무실: Seed 계정에 GitHub 사용자 ID가 없어 Seed 로그인 이름({@code seed-…})으로 짝짓는다. 권한 판정과는 무관하다.</li>
 * </ul>
 * 팀원이 아닌 계정은 빈 값 — 담당자로 넣지 않는다(「10」 구현 기본값).
 */
final class GithubMemberMatcher {

    private final WorkspaceKind kind;
    private final Map<Long, Member> byGithubUserId = new HashMap<>();
    private final Map<String, Member> bySeedLogin = new HashMap<>();

    GithubMemberMatcher(WorkspaceKind kind, List<Member> currentMembers) {
        this.kind = kind;
        for (Member member : currentMembers) {
            if (member.githubUserId() != null) {
                byGithubUserId.put(member.githubUserId(), member);
            } else if (member.getGithubLogin() != null) {
                bySeedLogin.put(member.getGithubLogin(), member);
            }
        }
    }

    Optional<Member> find(GithubUser user) {
        if (user == null) {
            return Optional.empty();
        }
        if (kind == WorkspaceKind.DEMO) {
            return Optional.ofNullable(user.login()).map(bySeedLogin::get);
        }
        return Optional.ofNullable(user.id()).map(byGithubUserId::get);
    }
}
