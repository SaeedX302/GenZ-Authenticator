/**
 * sync-encryption.test.ts — Unit tests for SyncEncryption engine
 *
 * Tests cover:
 *  1. Base64url encode/decode round-trip
 *  2. Encrypt → Decrypt round-trip (requires Argon2 sandbox)
 *  3. Wrong password detection (GCM auth tag mismatch)
 *  4. Tampered ciphertext detection
 *  5. Missing password rejection
 *  6. Unsupported version rejection
 */

import "mocha";
import * as chai from "chai";
import { expect } from "chai";

import {
  SyncEncryption,
  toBase64Url,
  fromBase64Url,
  PAYLOAD_VERSION,
} from "../models/sync-encryption";

chai.use(require("sinon-chai"));
mocha.setup("bdd");

// ── Base64url helpers ──

describe("Base64url helpers", () => {
  it("round-trip: encode then decode preserves bytes", () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const encoded = toBase64Url(original.buffer);
    const decoded = fromBase64Url(encoded);
    expect(Array.from(decoded)).to.deep.equal(Array.from(original));
  });

  it("output contains no +, /, or = characters", () => {
    // Use bytes that would produce +, /, = in standard base64
    const data = new Uint8Array([251, 239, 190, 63, 191, 62]);
    const encoded = toBase64Url(data.buffer);
    expect(encoded).to.not.match(/[+/=]/);
  });

  it("empty buffer produces empty string", () => {
    const encoded = toBase64Url(new ArrayBuffer(0));
    expect(encoded).to.equal("");
    const decoded = fromBase64Url("");
    expect(decoded.length).to.equal(0);
  });
});

// ── SyncEncryption (requires browser env with Argon2 sandbox) ──

describe("SyncEncryption", () => {
  const engine = new SyncEncryption();
  const testPassword = "test-master-P@ssw0rd!";
  const testPlaintext = JSON.stringify({
    "uuid-1": {
      issuer: "GitHub",
      account: "user@test.com",
      secret: "JBSWY3DPEHPK3PXP",
    },
    "uuid-2": {
      issuer: "AWS",
      account: "admin",
      secret: "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ",
    },
  });

  it("encrypt returns valid SyncPayload structure", async () => {
    const payload = await engine.encrypt(testPlaintext, testPassword);
    expect(payload).to.have.property("v", PAYLOAD_VERSION);
    expect(payload).to.have.property("salt").that.is.a("string");
    expect(payload).to.have.property("nonce").that.is.a("string");
    expect(payload).to.have.property("data").that.is.a("string");

    // salt = 16 bytes, nonce = 12 bytes
    expect(fromBase64Url(payload.salt).length).to.equal(16);
    expect(fromBase64Url(payload.nonce).length).to.equal(12);
  });

  it("encrypt → decrypt round-trip preserves plaintext", async () => {
    const payload = await engine.encrypt(testPlaintext, testPassword);
    const decrypted = await engine.decrypt(payload, testPassword);
    expect(decrypted).to.equal(testPlaintext);
  });

  it("two encryptions of same data produce different payloads", async () => {
    const p1 = await engine.encrypt(testPlaintext, testPassword);
    const p2 = await engine.encrypt(testPlaintext, testPassword);
    // Different salt and nonce each time
    expect(p1.salt).to.not.equal(p2.salt);
    expect(p1.nonce).to.not.equal(p2.nonce);
    expect(p1.data).to.not.equal(p2.data);
  });

  it("wrong password throws on decrypt", async () => {
    const payload = await engine.encrypt(testPlaintext, testPassword);
    try {
      await engine.decrypt(payload, "wrong-password");
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).to.include(
        "wrong password or data tampered"
      );
    }
  });

  it("tampered ciphertext throws on decrypt", async () => {
    const payload = await engine.encrypt(testPlaintext, testPassword);
    // Flip a byte in the ciphertext
    const dataBytes = fromBase64Url(payload.data);
    dataBytes[0] ^= 0xff;
    const tampered: SyncPayload = {
      ...payload,
      data: toBase64Url(dataBytes.buffer),
    };
    try {
      await engine.decrypt(tampered, testPassword);
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).to.include(
        "wrong password or data tampered"
      );
    }
  });

  it("empty password throws on encrypt", async () => {
    try {
      await engine.encrypt(testPlaintext, "");
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).to.include("requires a master password");
    }
  });

  it("unsupported version throws on decrypt", async () => {
    const payload = await engine.encrypt(testPlaintext, testPassword);
    const bad = { ...payload, v: 99 as never };
    try {
      await engine.decrypt(bad, testPassword);
      expect.fail("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).to.include(
        "Unsupported sync payload version"
      );
    }
  });
});
