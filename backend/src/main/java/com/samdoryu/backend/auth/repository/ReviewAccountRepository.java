package com.samdoryu.backend.auth.repository;

import com.samdoryu.backend.auth.domain.ReviewAccount;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewAccountRepository extends JpaRepository<ReviewAccount, Long> {

    Optional<ReviewAccount> findByUsername(String username);

    Optional<ReviewAccount> findByUserId(Long userId);
}
