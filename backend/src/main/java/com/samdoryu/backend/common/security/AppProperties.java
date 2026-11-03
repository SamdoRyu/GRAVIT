package com.samdoryu.backend.common.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param origin 쓰기 요청을 받는 허용 출처({@code APP_ORIGIN}, NFR-05). 예: {@code http://localhost:5173}
 */
@ConfigurationProperties("app")
public record AppProperties(String origin) {
}
