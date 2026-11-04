package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 앱 사용자 — 다른 패키지(동기화)는 이 Service로 사용자를 찾거나 만든다. */
@Service
public class AppUserService {

    private final AppUserRepository appUserRepository;

    public AppUserService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    /**
     * 동기화가 콜라보레이터를 팀원으로 만들 때 — GitHub 사용자 ID로 찾고, 없으면 아직 로그인하지 않은 사람의 행도 만든다
     * (CONTRACTS.md 「10」 구현 기본값). 있으면 로그인 이름 · 사진을 맞춘다. 새 행의 표시 이름은 로그인 이름이다
     * (프로필 이름은 그 사람이 로그인할 때 맞춘다).
     */
    @Transactional
    public AppUser findOrCreateGithubUser(long githubUserId, String login, String avatarUrl) {
        return appUserRepository.findByGithubUserId(githubUserId)
                .map(user -> {
                    user.syncGithubIdentity(login, avatarUrl);
                    return user;
                })
                .orElseGet(() -> appUserRepository.save(AppUser.github(githubUserId, login, login, avatarUrl)));
    }
}
