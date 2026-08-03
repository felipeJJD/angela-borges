import { ANGELA_ACCOUNT_ID } from "./core.ts";

export const ANGELA_DELIVERY_JWT_ISSUER = "angela-anamnesis-edge" as const;
export const ANGELA_DELIVERY_JWT_AUDIENCE =
  "nexus-dashboard-angela-intake" as const;
export const ANGELA_DELIVERY_JWT_MAX_TTL_SECONDS = 120 as const;
export const ANGELA_PLAN_STATUS_JWT_AUDIENCE =
  "nexus-dashboard-angela-plan-status" as const;
export const ANGELA_PLAN_STATUS_JWT_MAX_TTL_SECONDS = 120 as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DashboardDeliveryJwtClaims = Readonly<{
  iss: typeof ANGELA_DELIVERY_JWT_ISSUER;
  aud: typeof ANGELA_DELIVERY_JWT_AUDIENCE;
  sub: string;
  jti: string;
  account_id: typeof ANGELA_ACCOUNT_ID;
  source: "angela_app";
  iat: number;
  exp: number;
}>;

type CreateDashboardDeliveryJwtInput = Readonly<{
  secret: string;
  userId: string;
  correlationId: string;
  nowSeconds: number;
  ttlSeconds?: number;
}>;

type VerifyDashboardDeliveryJwtInput = Readonly<{
  token: string;
  secret: string;
  nowSeconds: number;
  expectedUserId: string;
  expectedCorrelationId: string;
}>;

export type DashboardPlanStatusJwtClaims = Readonly<{
  iss: typeof ANGELA_DELIVERY_JWT_ISSUER;
  aud: typeof ANGELA_PLAN_STATUS_JWT_AUDIENCE;
  sub: string;
  jti: string;
  account_id: typeof ANGELA_ACCOUNT_ID;
  source: "angela_app";
  iat: number;
  exp: number;
}>;

type CreateDashboardPlanStatusJwtInput = Readonly<{
  secret: string;
  userId: string;
  idempotencyKey: string;
  nowSeconds: number;
  ttlSeconds?: number;
}>;

type VerifyDashboardPlanStatusJwtInput = Readonly<{
  token: string;
  secret: string;
  nowSeconds: number;
  expectedUserId: string;
  expectedIdempotencyKey: string;
}>;

function invalidJwt(): never {
  throw new Error("ANGELA_DELIVERY_JWT_INVALID");
}

function invalidPlanStatusJwt(): never {
  throw new Error("ANGELA_PLAN_STATUS_JWT_INVALID");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return invalidJwt();
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  } catch {
    return invalidJwt();
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacSha256(secret: string, value: string): Promise<Uint8Array> {
  if (!secret) return invalidJwt();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const actual = Object.keys(value).sort(compare);
  const expected = [...expectedKeys].sort(compare);
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function assertIdentity(userId: string, correlationId: string): void {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(correlationId)) {
    invalidJwt();
  }
}

export async function createDashboardDeliveryJwt(
  input: CreateDashboardDeliveryJwtInput,
): Promise<string> {
  const ttlSeconds = input.ttlSeconds ?? 60;
  assertIdentity(input.userId, input.correlationId);
  if (
    !Number.isSafeInteger(input.nowSeconds) ||
    input.nowSeconds < 0 ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > ANGELA_DELIVERY_JWT_MAX_TTL_SECONDS
  ) {
    invalidJwt();
  }

  const header = { alg: "HS256", typ: "JWT" } as const;
  const claims: DashboardDeliveryJwtClaims = {
    iss: ANGELA_DELIVERY_JWT_ISSUER,
    aud: ANGELA_DELIVERY_JWT_AUDIENCE,
    sub: input.userId,
    jti: input.correlationId,
    account_id: ANGELA_ACCOUNT_ID,
    source: "angela_app",
    iat: input.nowSeconds,
    exp: input.nowSeconds + ttlSeconds,
  };
  const encoder = new TextEncoder();
  const signingInput = `${
    base64UrlEncode(encoder.encode(JSON.stringify(header)))
  }.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;
  const signature = await hmacSha256(input.secret, signingInput);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function verifyDashboardDeliveryJwt(
  input: VerifyDashboardDeliveryJwtInput,
): Promise<DashboardDeliveryJwtClaims> {
  assertIdentity(input.expectedUserId, input.expectedCorrelationId);
  if (!Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0) {
    invalidJwt();
  }
  const segments = input.token.split(".");
  if (segments.length !== 3) invalidJwt();

  const signingInput = `${segments[0]}.${segments[1]}`;
  const expectedSignature = await hmacSha256(input.secret, signingInput);
  const suppliedSignature = base64UrlDecode(segments[2]);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) invalidJwt();

  let header: unknown;
  let claims: unknown;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    header = JSON.parse(decoder.decode(base64UrlDecode(segments[0])));
    claims = JSON.parse(decoder.decode(base64UrlDecode(segments[1])));
  } catch {
    return invalidJwt();
  }
  if (
    typeof header !== "object" ||
    header === null ||
    Array.isArray(header) ||
    !hasExactKeys(header as Record<string, unknown>, ["alg", "typ"]) ||
    (header as Record<string, unknown>).alg !== "HS256" ||
    (header as Record<string, unknown>).typ !== "JWT"
  ) {
    invalidJwt();
  }
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
    invalidJwt();
  }
  const value = claims as Record<string, unknown>;
  if (
    !hasExactKeys(value, [
      "iss",
      "aud",
      "sub",
      "jti",
      "account_id",
      "source",
      "iat",
      "exp",
    ]) ||
    value.iss !== ANGELA_DELIVERY_JWT_ISSUER ||
    value.aud !== ANGELA_DELIVERY_JWT_AUDIENCE ||
    value.sub !== input.expectedUserId ||
    value.jti !== input.expectedCorrelationId ||
    value.account_id !== ANGELA_ACCOUNT_ID ||
    value.source !== "angela_app" ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp) ||
    (value.iat as number) > input.nowSeconds + 5 ||
    input.nowSeconds >= (value.exp as number) ||
    (value.exp as number) <= (value.iat as number) ||
    (value.exp as number) - (value.iat as number) >
      ANGELA_DELIVERY_JWT_MAX_TTL_SECONDS
  ) {
    invalidJwt();
  }
  return value as DashboardDeliveryJwtClaims;
}

export async function createDashboardPlanStatusJwt(
  input: CreateDashboardPlanStatusJwtInput,
): Promise<string> {
  try {
    const ttlSeconds = input.ttlSeconds ?? 60;
    assertIdentity(input.userId, input.idempotencyKey);
    if (
      !input.secret ||
      !Number.isSafeInteger(input.nowSeconds) ||
      input.nowSeconds < 0 ||
      !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds < 1 ||
      ttlSeconds > ANGELA_PLAN_STATUS_JWT_MAX_TTL_SECONDS
    ) {
      return invalidPlanStatusJwt();
    }

    const header = { alg: "HS256", typ: "JWT" } as const;
    const claims: DashboardPlanStatusJwtClaims = {
      iss: ANGELA_DELIVERY_JWT_ISSUER,
      aud: ANGELA_PLAN_STATUS_JWT_AUDIENCE,
      sub: input.userId,
      jti: input.idempotencyKey,
      account_id: ANGELA_ACCOUNT_ID,
      source: "angela_app",
      iat: input.nowSeconds,
      exp: input.nowSeconds + ttlSeconds,
    };
    const encoder = new TextEncoder();
    const signingInput = `${
      base64UrlEncode(encoder.encode(JSON.stringify(header)))
    }.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;
    const signature = await hmacSha256(input.secret, signingInput);
    return `${signingInput}.${base64UrlEncode(signature)}`;
  } catch {
    return invalidPlanStatusJwt();
  }
}

export async function verifyDashboardPlanStatusJwt(
  input: VerifyDashboardPlanStatusJwtInput,
): Promise<DashboardPlanStatusJwtClaims> {
  try {
    assertIdentity(input.expectedUserId, input.expectedIdempotencyKey);
    if (!Number.isSafeInteger(input.nowSeconds) || input.nowSeconds < 0) {
      return invalidPlanStatusJwt();
    }
    const segments = input.token.split(".");
    if (segments.length !== 3) return invalidPlanStatusJwt();

    const signingInput = `${segments[0]}.${segments[1]}`;
    const expectedSignature = await hmacSha256(input.secret, signingInput);
    const suppliedSignature = base64UrlDecode(segments[2]);
    if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
      return invalidPlanStatusJwt();
    }

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const header: unknown = JSON.parse(
      decoder.decode(base64UrlDecode(segments[0])),
    );
    const claims: unknown = JSON.parse(
      decoder.decode(base64UrlDecode(segments[1])),
    );
    if (
      typeof header !== "object" ||
      header === null ||
      Array.isArray(header) ||
      !hasExactKeys(header as Record<string, unknown>, ["alg", "typ"]) ||
      (header as Record<string, unknown>).alg !== "HS256" ||
      (header as Record<string, unknown>).typ !== "JWT"
    ) {
      return invalidPlanStatusJwt();
    }
    if (
      typeof claims !== "object" || claims === null || Array.isArray(claims)
    ) {
      return invalidPlanStatusJwt();
    }
    const value = claims as Record<string, unknown>;
    if (
      !hasExactKeys(value, [
        "iss",
        "aud",
        "sub",
        "jti",
        "account_id",
        "source",
        "iat",
        "exp",
      ]) ||
      value.iss !== ANGELA_DELIVERY_JWT_ISSUER ||
      value.aud !== ANGELA_PLAN_STATUS_JWT_AUDIENCE ||
      value.sub !== input.expectedUserId ||
      value.jti !== input.expectedIdempotencyKey ||
      value.account_id !== ANGELA_ACCOUNT_ID ||
      value.source !== "angela_app" ||
      !Number.isSafeInteger(value.iat) ||
      !Number.isSafeInteger(value.exp) ||
      (value.iat as number) > input.nowSeconds + 5 ||
      input.nowSeconds >= (value.exp as number) ||
      (value.exp as number) <= (value.iat as number) ||
      (value.exp as number) - (value.iat as number) >
        ANGELA_PLAN_STATUS_JWT_MAX_TTL_SECONDS
    ) {
      return invalidPlanStatusJwt();
    }
    return value as DashboardPlanStatusJwtClaims;
  } catch {
    return invalidPlanStatusJwt();
  }
}
