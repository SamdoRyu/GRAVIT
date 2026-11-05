package com.samdoryu.backend.github;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 사무실 종류로 어댑터를 고른다(CONTRACTS.md 「7」). 시연 사무실은 Seed 어댑터 — GitHub를 부르지 않는다.
 * 실제 사무실은 GitHub App 어댑터({@code github.app.GithubAppReader}) — App 설정이 없으면 동기화가 {@code unavailable}로 기록된다.
 */
@Component
public class GithubReaderSelector {

    private final Map<WorkspaceKind, GithubReader> readers = new EnumMap<>(WorkspaceKind.class);

    public GithubReaderSelector(List<GithubReader> readers) {
        for (GithubReader reader : readers) {
            if (this.readers.put(reader.kind(), reader) != null) {
                throw new IllegalStateException("사무실 종류 하나에 어댑터가 둘: " + reader.kind());
            }
        }
    }

    public GithubReader forKind(WorkspaceKind kind) {
        GithubReader reader = readers.get(kind);
        if (reader == null) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
        return reader;
    }
}
