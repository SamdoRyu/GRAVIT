package com.samdoryu.backend.github.app;

import com.samdoryu.backend.github.GithubHttp;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * 실제 사무실 GitHub 어댑터 등록(#69). App 설정({@code GITHUB_APP_ID} · {@code GITHUB_APP_PRIVATE_KEY_PATH})이 없어도
 * 서버는 뜬다 — 그때 실제 사무실 동기화는 {@code unavailable}로 기록된다(설치 토큰을 받을 때 실패).
 */
@Configuration
@EnableConfigurationProperties(GithubAppProperties.class)
public class GithubAppConfig {

    @Bean
    GithubAppReader githubAppReader(GithubAppProperties properties) {
        RestClient restClient = GithubHttp.build(GithubHttp.defaultBuilder());
        InstallationTokenProvider tokens = new InstallationTokenProvider(restClient, properties,
                InstallationTokenProvider.keyFileLoader(), Clock.systemUTC());
        return new GithubAppReader(restClient, tokens);
    }
}
