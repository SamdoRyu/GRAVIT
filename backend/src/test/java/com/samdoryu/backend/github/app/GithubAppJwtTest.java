package com.samdoryu.backend.github.app;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/** GitHub App JWT — 키 두 형식(PKCS#8 · GitHub가 주는 PKCS#1) 읽기와 RS256 서명 · 클레임(테스트마다 새로 만든 키). */
class GithubAppJwtTest {

    static KeyPair newKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    static String pkcs8Pem(PrivateKey key) {
        return "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(key.getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
    }

    /** 2048비트 키의 PKCS#8 머리(26바이트)를 떼면 PKCS#1 — GitHub가 내려 주는 형식. */
    static String pkcs1Pem(PrivateKey key) {
        byte[] pkcs8 = key.getEncoded();
        byte[] pkcs1 = Arrays.copyOfRange(pkcs8, 26, pkcs8.length);
        return "-----BEGIN RSA PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(pkcs1)
                + "\n-----END RSA PRIVATE KEY-----\n";
    }

    @Test
    void readsBothKeyFormats() throws Exception {
        KeyPair pair = newKeyPair();

        assertThat(GithubAppJwt.parsePrivateKey(pkcs8Pem(pair.getPrivate())).getEncoded())
                .isEqualTo(pair.getPrivate().getEncoded());
        assertThat(GithubAppJwt.parsePrivateKey(pkcs1Pem(pair.getPrivate())).getEncoded())
                .isEqualTo(pair.getPrivate().getEncoded());
    }

    @Test
    void signsAnRs256JwtWithTheAppIdAndAShortLifetime() throws Exception {
        KeyPair pair = newKeyPair();
        Instant now = Instant.parse("2026-11-05T03:00:00Z");

        String jwt = GithubAppJwt.create(123456L, pair.getPrivate(), now);

        String[] parts = jwt.split("\\.");
        assertThat(parts).hasSize(3);
        Base64.Decoder decoder = Base64.getUrlDecoder();
        assertThat(new String(decoder.decode(parts[0]), StandardCharsets.UTF_8)).contains("\"alg\":\"RS256\"");
        String payload = new String(decoder.decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(payload).contains("\"iss\":\"123456\"",
                "\"iat\":" + now.minusSeconds(60).getEpochSecond(),
                "\"exp\":" + now.plusSeconds(540).getEpochSecond());
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(pair.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verifier.verify(decoder.decode(parts[2]))).isTrue();
    }
}
