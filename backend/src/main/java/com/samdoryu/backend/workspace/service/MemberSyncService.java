package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 콜라보레이터 목록으로 팀원(Member)을 맞춘다(#71 · FR-GH-04 · CONTRACTS.md 「2」 소유와 변경 주체).
 * <ul>
 *   <li>지금 팀원: GitHub 칸(로그인 이름 · 사진 · 레포 관리자 여부 · {@code syncedAt})만 맞춘다. <b>책상 자리 · 활동 기록 수집
 *       동의는 덮어쓰지 않는다.</b></li>
 *   <li>새 콜라보레이터: 팀원 행을 만들고 빈 책상 중 가장 작은 번호(0~7)를 준다. 8자리가 다 찼으면 자리 없이 들어온다.</li>
 *   <li>빠진 팀원(콜라보레이터 목록에 없음): 행은 남기고 {@code removedAt}을 남기고 책상을 비운다.</li>
 *   <li>빠졌다가 다시 콜라보레이터가 됨: 다시 들어온 것이므로 빈 책상을 새로 받는다 [구현 기본값 — #71].</li>
 *   <li>서버 설정 허용 목록의 강사 계정은 콜라보레이터여도 팀원이 아니다(P1) — 이미 팀원 행이 있으면 빠진 것으로 둔다.</li>
 * </ul>
 * 짝짓기는 실제 사무실이면 사용자(GitHub 사용자 ID로 찾은 AppUser), 시연 사무실이면 Seed 로그인 이름이다.
 */
@Service
public class MemberSyncService {

    private final WorkspaceService workspaceService;
    private final MemberRepository memberRepository;
    private final AppProperties appProperties;

    public MemberSyncService(WorkspaceService workspaceService, MemberRepository memberRepository,
            AppProperties appProperties) {
        this.workspaceService = workspaceService;
        this.memberRepository = memberRepository;
        this.appProperties = appProperties;
    }

    /**
     * 콜라보레이터 한 명.
     *
     * @param user 실제 사무실의 사용자. 시연 사무실의 Seed 계정이면 null
     * @param login 로그인 이름 — 시연 사무실에서는 짝짓기 키(Seed 로그인)
     */
    public record Collaborator(AppUser user, String login, String avatarUrl, boolean repoAdmin) {

        public Collaborator {
            Objects.requireNonNull(login);
        }

        Object key() {
            return user != null ? user.getId() : login;
        }
    }

    private static Object keyOf(Member member) {
        return member.getUser() != null ? member.getUser().getId() : member.getGithubLogin();
    }

    @Transactional
    public void syncCollaborators(Long workspaceId, List<Collaborator> collaborators, Instant now) {
        Workspace workspace = workspaceService.requireWorkspace(workspaceId);
        Map<Object, Collaborator> wanted = new HashMap<>();
        for (Collaborator collaborator : collaborators) {
            if (!isAllowlistedInstructor(collaborator)) {
                wanted.putIfAbsent(collaborator.key(), collaborator);
            }
        }
        Map<Object, Member> existing = new HashMap<>();
        for (Member member : memberRepository.findByWorkspaceId(workspaceId)) {
            existing.put(keyOf(member), member);
        }

        // 1. 빠진 팀원 — 책상을 먼저 비우고 DB에 반영해야 새 팀원이 그 자리를 받을 때 (사무실, 책상) 유일 제약에 걸리지 않는다
        for (Map.Entry<Object, Member> entry : existing.entrySet()) {
            Member member = entry.getValue();
            if (!wanted.containsKey(entry.getKey()) && !member.isRemoved()) {
                member.remove(now);
            }
        }
        memberRepository.flush();

        // 2. 지금 팀원 갱신 · 돌아온 팀원 · 새 팀원 — 책상은 남은 빈 자리를 작은 번호부터
        Set<Integer> takenDesks = new HashSet<>();
        for (Member member : existing.values()) {
            if (!member.isRemoved() && member.getDeskIndex() != null) {
                takenDesks.add(member.getDeskIndex());
            }
        }
        List<Collaborator> ordered = new ArrayList<>(wanted.values());
        ordered.sort((a, b) -> a.login().compareTo(b.login()));
        for (Collaborator collaborator : ordered) {
            Member member = existing.get(collaborator.key());
            if (member == null) {
                Member created = collaborator.user() != null
                        ? Member.collaborator(workspace, collaborator.user(), nextFreeDesk(takenDesks),
                                collaborator.repoAdmin(), now)
                        : Member.demoSeed(workspace, collaborator.login(), collaborator.login(),
                                collaborator.avatarUrl(), nextFreeDesk(takenDesks));
                created.syncGithubFields(collaborator.login(), created.getDisplayName(), collaborator.avatarUrl(),
                        collaborator.repoAdmin(), now);
                memberRepository.save(created);
                continue;
            }
            if (member.isRemoved()) {
                member.rejoin(nextFreeDesk(takenDesks));
            }
            String displayName = collaborator.user() != null
                    ? collaborator.user().getDisplayName() : member.getDisplayName();
            member.syncGithubFields(collaborator.login(), displayName, collaborator.avatarUrl(),
                    collaborator.repoAdmin(), now);
        }
    }

    private boolean isAllowlistedInstructor(Collaborator collaborator) {
        return collaborator.user() != null && appProperties.isAllowlistedInstructor(collaborator.user().getGithubUserId());
    }

    /** 빈 책상 중 가장 작은 번호를 잡는다. 8자리가 다 찼으면 null. */
    private static Integer nextFreeDesk(Set<Integer> takenDesks) {
        for (int desk = Member.MIN_DESK_INDEX; desk <= Member.MAX_DESK_INDEX; desk++) {
            if (takenDesks.add(desk)) {
                return desk;
            }
        }
        return null;
    }
}
