package com.samdoryu.backend.github;

import jakarta.servlet.http.HttpSession;
import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;

/**
 * 로그인한 사용자의 GitHub 토큰 — <b>서버 세션(HttpSession)에만</b> 둔다(#68 결정). 브라우저 · DB · 로그 · 응답에 내보내지 않고,
 * 로그아웃 · 세션 만료 때 세션과 함께 사라진다(NFR-04 · CONTRACTS.md 「6」 토큰은 서버에만).
 * {@link #toString()}은 값을 가린다 — 세션 덤프 · 로그에 실수로 찍혀도 드러나지 않는다.
 * <p>
 * 레포 선택 화면({@code GET /api/repositories})과 사무실 열기({@code POST /api/workspaces})가 로그인 뒤에도 GitHub를
 * 실시간으로 읽는 데 쓴다. GitHub App 설치 토큰(서버가 혼자 읽는 동기화)과는 별개다.
 */
public final class GithubUserToken implements Serializable {

    static final String SESSION_ATTRIBUTE = GithubUserToken.class.getName();

    private final String value;

    private GithubUserToken(String value) {
        this.value = Objects.requireNonNull(value);
    }

    /** 로그인 성공 처리가 부른다 — 세션 ID가 새로 발급된 뒤의 세션에 둔다. */
    public static void store(HttpSession session, String accessToken) {
        session.setAttribute(SESSION_ATTRIBUTE, new GithubUserToken(accessToken));
    }

    /**
     * 이 세션의 토큰을 지운다 — 로그인 성공 처리(GitHub · 심사용 모두)가 맨 먼저 부른다. 세션 ID만 바뀌고 속성은 남으므로
     * 로그아웃 없이 다른 로그인으로 바뀌면 이전 사용자의 토큰이 남는다(#250). 세션이 없으면 할 일이 없다.
     */
    public static void clear(HttpSession session) {
        if (session != null) {
            session.removeAttribute(SESSION_ATTRIBUTE);
        }
    }

    /** 이 세션의 토큰. GitHub로 로그인하지 않은 세션(심사용 계정 등)이면 빈 값. */
    public static Optional<String> from(HttpSession session) {
        if (session == null) {
            return Optional.empty();
        }
        return session.getAttribute(SESSION_ATTRIBUTE) instanceof GithubUserToken token
                ? Optional.of(token.value) : Optional.empty();
    }

    @Override
    public String toString() {
        return "GithubUserToken[***]";
    }
}
