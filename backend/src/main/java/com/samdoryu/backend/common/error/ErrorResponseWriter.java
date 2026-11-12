package com.samdoryu.backend.common.error;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** MVC 밖(Security 필터 · 핸들러)에서 {@link GlobalExceptionHandler}와 같은 에러 JSON을 쓴다. */
@Component
public class ErrorResponseWriter {

    private final JsonMapper jsonMapper;

    public ErrorResponseWriter(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    public void write(HttpServletResponse response, HttpStatus status, ErrorCode errorCode) throws IOException {
        write(response, status, errorCode, errorCode.defaultMessage());
    }

    /** code는 그대로, 화면에 보일 문구만 상황에 맞게 바꿀 때. */
    public void write(HttpServletResponse response, HttpStatus status, ErrorCode errorCode, String message)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        jsonMapper.writeValue(response.getOutputStream(), ErrorResponse.of(errorCode, message));
    }
}
