package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 서버 설정({@code REVIEW_ACCOUNTS})의 심사용 계정 하나 — 시연 사무실 접근 대상(CONTRACTS.md 「2」 · P15)과 로그인 정보.
 * 형식: {@code 아이디:역할:Seed팀원:bcrypt해시}를 {@code ;}(또는 줄바꿈)로 잇는다.
 * <ul>
 *   <li>역할: {@code participant} · {@code repo_admin} · {@code instructor}(CONTRACTS_API 「1」 WorkspaceRole 값)</li>
 *   <li>Seed팀원: 참여자 · 레포 관리자는 시연 사무실의 Seed 팀원 로그인 이름(예: {@code seed-lee}) — 그 팀원으로 행동한다.
 *       강사는 팀원이 아니라 비운다</li>
 *   <li>비밀번호는 bcrypt 해시만 받는다(평문 금지). 해시 · 비밀번호는 저장소에 커밋하지 않는다</li>
 * </ul>
 * 해석 오류 메시지에는 해시를 싣지 않는다(몇 번째 항목인지와 아이디만).
 *
 * @param seedLogin 강사는 null
 */
public record ReviewAccountSpec(String username, WorkspaceRole role, String seedLogin, String passwordHash) {

    private static final Pattern USERNAME = Pattern.compile("[A-Za-z0-9._-]{3,64}");
    private static final Pattern BCRYPT = Pattern.compile("\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}");

    public ReviewAccountSpec {
        Objects.requireNonNull(username);
        Objects.requireNonNull(role);
        Objects.requireNonNull(passwordHash);
    }

    /** 해시가 실리지 않게 직접 쓴다. */
    @Override
    public String toString() {
        return "ReviewAccountSpec(username=" + username + ", role=" + role.value() + ", seedLogin=" + seedLogin + ")";
    }

    /**
     * @param config {@code REVIEW_ACCOUNTS} 값. 비어 있으면 계정이 없다
     * @throws IllegalStateException 형식이 틀림 — 서버가 켜지지 않게 한다
     */
    public static List<ReviewAccountSpec> parse(String config) {
        List<ReviewAccountSpec> specs = new ArrayList<>();
        if (config == null || config.isBlank()) {
            return specs;
        }
        Set<String> usernames = new HashSet<>();
        int index = 0;
        for (String entry : config.split("[;\\r\\n]+")) {
            if (entry.isBlank()) {
                continue;
            }
            index++;
            ReviewAccountSpec spec = parseEntry(entry.trim(), index);
            if (!usernames.add(spec.username())) {
                throw invalid(index, spec.username(), "아이디가 겹친다");
            }
            specs.add(spec);
        }
        return specs;
    }

    private static ReviewAccountSpec parseEntry(String entry, int index) {
        String[] fields = entry.split(":", -1);
        if (fields.length != 4) {
            throw invalid(index, null, "아이디:역할:Seed팀원:bcrypt해시 네 칸이어야 한다");
        }
        String username = fields[0].trim();
        if (!USERNAME.matcher(username).matches()) {
            throw invalid(index, null, "아이디는 영문 · 숫자 · . _ - 3~64자");
        }
        WorkspaceRole role = role(fields[1].trim(), index, username);
        String seedLogin = fields[2].trim().isEmpty() ? null : fields[2].trim();
        if (role.isTeamMember() && seedLogin == null) {
            throw invalid(index, username, "참여자 · 레포 관리자는 맡을 Seed 팀원이 필요하다");
        }
        if (!role.isTeamMember() && seedLogin != null) {
            throw invalid(index, username, "강사는 팀원이 아니라 Seed 팀원 칸을 비운다");
        }
        String hash = fields[3].trim();
        if (!BCRYPT.matcher(hash).matches()) {
            throw invalid(index, username, "비밀번호는 bcrypt 해시여야 한다");
        }
        return new ReviewAccountSpec(username, role, seedLogin, hash);
    }

    private static WorkspaceRole role(String value, int index, String username) {
        for (WorkspaceRole role : WorkspaceRole.values()) {
            if (role.value().equals(value)) {
                return role;
            }
        }
        throw invalid(index, username, "역할은 participant · repo_admin · instructor");
    }

    private static IllegalStateException invalid(int index, String username, String reason) {
        return new IllegalStateException("REVIEW_ACCOUNTS " + index + "번째 항목"
                + (username == null ? "" : "(" + username + ")") + ": " + reason);
    }
}
