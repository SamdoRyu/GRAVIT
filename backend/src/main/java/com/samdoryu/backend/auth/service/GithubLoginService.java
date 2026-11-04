package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.github.dto.GithubLoginProfile;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * GitHub 로그인 성공 뒤 앱 사용자를 정한다(FR-AUTH-01). 사용자는 GitHub 사용자 ID로 찾는다 — 로그인 이름이 바뀌어도 같은 사람.
 * 없으면 만들고(동기화가 먼저 만든 행이면 그 행을 쓴다), 있으면 표시 값(로그인 이름 · 이름 · 사진)을 GitHub 값으로 맞춘다.
 */
@Service
public class GithubLoginService {

    private final AppUserRepository appUserRepository;

    public GithubLoginService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /**
     * @return 세션에 둘 로그인 사용자. 사무실별 역할(레포 관리자 · 참여자)은 #65가 레포 권한으로 채운다 — 그 전까지는 비어 있다
     */
    @Transactional
    public AppPrincipal login(GithubLoginProfile profile) {
        AppUser user = appUserRepository.findByGithubUserId(profile.githubUserId())
                .map(existing -> {
                    existing.updateGithubProfile(profile.login(), profile.displayName(), profile.avatarUrl());
                    return existing;
                })
                .orElseGet(() -> appUserRepository.save(AppUser.github(profile.githubUserId(), profile.login(),
                        profile.displayName(), profile.avatarUrl())));
        return new AppPrincipal(user.getId(), AccountType.GITHUB, user.getGithubUserId(), Map.of());
    }
}
