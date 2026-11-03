package com.samdoryu.backend.common.security;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param origin 쓰기 요청을 받는 허용 출처({@code APP_ORIGIN}, NFR-05). 예: {@code http://localhost:5173}
 * @param instructorGithubUserIds 승인된 강사 계정의 GitHub 사용자 ID 허용 목록({@code INSTRUCTOR_GITHUB_USER_IDS}, P1).
 *        로그인 이름이 아니다. 비면 강사가 없다
 */
@ConfigurationProperties("app")
public record AppProperties(String origin, Set<Long> instructorGithubUserIds) {

    public AppProperties {
        instructorGithubUserIds = instructorGithubUserIds == null ? Set.of() : Set.copyOf(instructorGithubUserIds);
    }
}
