package com.samdoryu.backend.common.contract;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;

/**
 * 계약 테스트 ② — 실제 HTTP 응답 ↔ contract/examples/common/error-response.json (CONTRACTS.md 「9」).
 * Security 필터가 쓰는 401 응답이 MVC 밖에서 만들어져도 예시와 같은 모양인지 본다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ErrorResponseShapeContractTest {

    @Autowired
    MockMvc mvc;

    @Test
    void unauthorizedResponseMatchesExampleShape() throws Exception {
        String body = mvc.perform(get("/api/workspaces/1/snapshot"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        JsonNode actual = ContractShape.readTree(body);
        ContractShape.assertSameShape(ContractShape.readExample("common", "error-response.json"), actual);
        ContractShape.assertCommonRules(actual);
    }
}
