package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import java.io.Serializable;
import java.util.List;
import java.util.Map;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/**
 * 세션에 두는 로그인 사용자(CONTRACTS.md 「6」). 로그인(GitHub OAuth · 심사용)이 만들고 인가 서비스가 읽는다.
 * 강사 지정은 여기에 두지 않는다 — 요청마다 DB에서 확인한다.
 *
 * @param userId 내부 AppUser ID
 * @param githubUserId GitHub 사용자 ID. 심사용 계정은 null
 * @param memberships 사무실 ID → 로그인 때 정한 그 사무실의 역할과 팀원 ID(레포 관리자 · 참여자, 시연 사무실 등록)
 */
public record AppPrincipal(Long userId, AccountType accountType, Long githubUserId,
        Map<Long, Membership> memberships) implements Serializable {

    /** @param role {@link WorkspaceRole#REPO_ADMIN} 또는 {@link WorkspaceRole#PARTICIPANT} */
    public record Membership(WorkspaceRole role, Long memberId) implements Serializable {

        public Membership {
            if (!role.isTeamMember()) {
                throw new IllegalArgumentException("강사 역할은 세션에 두지 않는다");
            }
        }
    }

    public AppPrincipal {
        memberships = Map.copyOf(memberships);
    }

    /** 세션의 SecurityContext에 넣을 인증. 로그인 성공 처리와 테스트 로그인이 같은 모양을 쓴다. */
    public Authentication toAuthentication() {
        return UsernamePasswordAuthenticationToken.authenticated(this, null, List.of());
    }
}
