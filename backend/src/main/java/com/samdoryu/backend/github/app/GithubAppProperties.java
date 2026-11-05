package com.samdoryu.backend.github.app;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * GitHub App 자격 증명 위치(환경 변수 가이드) — 서버가 혼자 레포를 읽는 동기화에 쓴다.
 *
 * @param id GitHub App ID({@code GITHUB_APP_ID})
 * @param privateKeyPath App 개인 키 파일({@code GITHUB_APP_PRIVATE_KEY_PATH}) — {@code secrets/}에만 두고 커밋하지 않는다
 */
@ConfigurationProperties("app.github-app")
public record GithubAppProperties(Long id, String privateKeyPath) {

    public boolean configured() {
        return id != null && privateKeyPath != null && !privateKeyPath.isBlank();
    }
}
