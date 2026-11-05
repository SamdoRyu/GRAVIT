package com.samdoryu.backend.auth.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** {@link InstructorWriteGuard}를 사무실 API에 건다. */
@Configuration
public class InstructorWriteGuardConfig implements WebMvcConfigurer {

    private final InstructorWriteGuard instructorWriteGuard;

    public InstructorWriteGuardConfig(InstructorWriteGuard instructorWriteGuard) {
        this.instructorWriteGuard = instructorWriteGuard;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(instructorWriteGuard).addPathPatterns("/api/workspaces/*/**");
    }
}
