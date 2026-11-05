package com.samdoryu.backend.github.app;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * GitHub App으로 인증하는 짧은 JWT(RS256) — 설치 토큰을 받을 때만 쓴다(GitHub 문서 "Generating a JWT for a GitHub App").
 * 새 의존성 없이 JDK 서명으로 만든다. 개인 키는 PKCS#8({@code BEGIN PRIVATE KEY})과 GitHub가 내려 주는
 * PKCS#1({@code BEGIN RSA PRIVATE KEY})을 모두 읽는다. 키 · JWT 값을 로그에 남기지 않는다.
 */
final class GithubAppJwt {

    /** 서버 시계가 조금 빨라도 거절되지 않게 발급 시각을 앞당긴다. */
    static final Duration CLOCK_SKEW = Duration.ofSeconds(60);
    /** GitHub 상한(10분)보다 짧게. */
    static final Duration LIFETIME = Duration.ofMinutes(9);

    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();
    /** PKCS#8 안에서 RSA 알고리즘을 가리키는 AlgorithmIdentifier(rsaEncryption OID + NULL). */
    private static final byte[] RSA_ALGORITHM = {
            0x30, 0x0d, 0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xf7, 0x0d, 0x01, 0x01, 0x01,
            0x05, 0x00};

    private GithubAppJwt() {
    }

    static String create(long appId, PrivateKey key, Instant now) {
        String header = URL.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = URL.encodeToString(("{\"iat\":" + now.minus(CLOCK_SKEW).getEpochSecond()
                + ",\"exp\":" + now.plus(LIFETIME).getEpochSecond() + ",\"iss\":\"" + appId + "\"}")
                .getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + payload;
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(key);
            signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            return signingInput + "." + URL.encodeToString(signature.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("GitHub App JWT 서명 실패", e);
        }
    }

    /** PEM 문자열에서 RSA 개인 키를 읽는다. */
    static PrivateKey parsePrivateKey(String pem) {
        boolean pkcs1 = pem.contains("BEGIN RSA PRIVATE KEY");
        String base64 = pem.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
        byte[] der = Base64.getDecoder().decode(base64);
        try {
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs1 ? wrapPkcs1(der) : der));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("GitHub App 개인 키를 읽지 못함", e);
        }
    }

    /** PKCS#1 RSAPrivateKey를 PKCS#8 PrivateKeyInfo로 감싼다: SEQUENCE { 0, rsaEncryption, OCTET STRING(pkcs1) }. */
    static byte[] wrapPkcs1(byte[] pkcs1) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.writeBytes(new byte[] {0x02, 0x01, 0x00});
        body.writeBytes(RSA_ALGORITHM);
        body.write(0x04);
        body.writeBytes(derLength(pkcs1.length));
        body.writeBytes(pkcs1);
        byte[] content = body.toByteArray();
        ByteArrayOutputStream sequence = new ByteArrayOutputStream();
        sequence.write(0x30);
        sequence.writeBytes(derLength(content.length));
        sequence.writeBytes(content);
        return sequence.toByteArray();
    }

    private static byte[] derLength(int length) {
        if (length < 0x80) {
            return new byte[] {(byte) length};
        }
        if (length < 0x100) {
            return new byte[] {(byte) 0x81, (byte) length};
        }
        if (length < 0x10000) {
            return new byte[] {(byte) 0x82, (byte) (length >> 8), (byte) length};
        }
        return new byte[] {(byte) 0x83, (byte) (length >> 16), (byte) (length >> 8), (byte) length};
    }
}
