package com.samdoryu.backend.auth.repository;

import com.samdoryu.backend.auth.domain.AppUser;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByGithubUserId(Long githubUserId);

    List<AppUser> findByGithubUserIdIn(Collection<Long> githubUserIds);
}
