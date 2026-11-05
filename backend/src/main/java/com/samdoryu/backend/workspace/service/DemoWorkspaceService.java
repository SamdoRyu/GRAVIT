package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.github.seed.SeedGithubReader;
import com.samdoryu.backend.sync.service.SyncService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시연 사무실(CONTRACTS.md 「2」 Workspace {@code DEMO} · P15) — Seed로 채우고 GitHub를 부르지 않는다.
 * 서버에 하나만 둔다(가장 먼저 만든 것). 심사용 계정이 처음 로그인할 때 없으면 만들고 바로 Seed로 채운다 — 맡을 Seed 팀원이
 * 로그인 전에 있어야 한다.
 */
@Slf4j
@Service
public class DemoWorkspaceService {

    static final String DISPLAY_NAME = "시연 사무실";
    /** 시연 사무실 프로젝트 기간 — 만든 날(한국 시간)부터 14일 [구현 기본값]. */
    static final int PROJECT_DAYS = 14;
    private static final ZoneId DATE_ZONE = ZoneId.of("Asia/Seoul");

    private final WorkspaceRepository workspaceRepository;
    private final TeamSettingsRepository teamSettingsRepository;
    private final MemberRepository memberRepository;
    private final SyncService syncService;

    public DemoWorkspaceService(WorkspaceRepository workspaceRepository, TeamSettingsRepository teamSettingsRepository,
            MemberRepository memberRepository, SyncService syncService) {
        this.workspaceRepository = workspaceRepository;
        this.teamSettingsRepository = teamSettingsRepository;
        this.memberRepository = memberRepository;
        this.syncService = syncService;
    }

    /** 시연 사무실 ID — 없으면 비어 있다. 여럿이면 가장 먼저 만든 것. */
    @Transactional(readOnly = true)
    public Optional<Long> findDemoWorkspaceId() {
        return workspaceRepository.findByKind(WorkspaceKind.DEMO).stream().map(Workspace::getId).min(Long::compare);
    }

    /** 시연 사무실 ID — 없으면 만들고 Seed로 채운다(이 스레드에서 바로). */
    @Transactional
    public Long ensureDemoWorkspace(Instant now) {
        return findDemoWorkspaceId().orElseGet(() -> create(now));
    }

    /** 시연 사무실의 지금 Seed 팀원 — 심사용 계정이 그 팀원으로 행동한다. Seed 팀원은 앱 사용자가 없다. */
    @Transactional(readOnly = true)
    public Optional<Long> currentSeedMemberId(Long demoWorkspaceId, String seedLogin) {
        return memberRepository.findByWorkspaceIdAndRemovedAtIsNull(demoWorkspaceId).stream()
                .filter(member -> member.getUser() == null && seedLogin.equalsIgnoreCase(member.getGithubLogin()))
                .map(Member::getId)
                .findFirst();
    }

    private Long create(Instant now) {
        Workspace workspace = workspaceRepository.save(Workspace.demo(DISPLAY_NAME, now));
        LocalDate today = LocalDate.ofInstant(now, DATE_ZONE);
        teamSettingsRepository.save(new TeamSettings(workspace, today, today.plusDays(PROJECT_DAYS - 1),
                SeedGithubReader.SPEC_PATH));
        log.info("시연 사무실을 만들었다: workspace={}", workspace.getId());
        syncService.syncNow(workspace.getId());
        return workspace.getId();
    }
}
