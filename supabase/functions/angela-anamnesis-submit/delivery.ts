import {
  buildCanonicalWebhookBody,
  type CanonicalAnswers,
  createWebhookHeaders,
} from "./core.ts";
import { createDashboardDeliveryJwt } from "./delivery-jwt.ts";

const MAX_ACKNOWLEDGMENT_BYTES = 4096;
const MAX_DRAIN_BATCH = 25;

export type DashboardOutboxItem = Readonly<{
  id: string;
  submissionId: string;
  userId: string;
  idempotencyKey: string;
  correlationId: string;
  schemaVersion: string;
  payloadHash: string;
  attempts: number;
  payload: Readonly<Record<string, unknown>>;
}>;

export type DashboardDeliveryConfig = Readonly<{
  dashboardWebhookUrl: string;
  hmacSecret: string;
  deliveryJwtSecret: string;
  timeoutMs: number;
}>;

export type DashboardDeliveryResult = Readonly<{
  status: "accepted_pending" | "delivered" | "failed";
  retryable: boolean;
  attempts: number;
}>;

export type DashboardDeliveryPorts = Readonly<{
  resolveProfile(userId: string): Promise<
    Readonly<{
      fullName: string;
      email: string;
    }> | null
  >;
  post(
    request: Readonly<{
      url: string;
      headers: Readonly<Record<string, string>>;
      body: string;
      timeoutMs: number;
    }>,
  ): Promise<Readonly<{ status: number; body: string }>>;
  markDelivered(
    correlationId: string,
    expectedAttempt: number,
  ): Promise<boolean>;
  markRetry(
    correlationId: string,
    expectedAttempt: number,
    errorCode: string,
  ): Promise<"retry_wait" | "dead_letter" | null>;
}>;

export function deliveryHttpStatus(result: DashboardDeliveryResult): 200 | 202 {
  return result.status === "accepted_pending" ? 202 : 200;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function retryResult(
  status: "retry_wait" | "dead_letter" | null,
  attempts: number,
): DashboardDeliveryResult {
  const retryable = status !== "dead_letter";
  return {
    status: retryable ? "accepted_pending" : "failed",
    retryable,
    attempts,
  };
}

function isMatchingAcknowledgment(
  status: number,
  rawBody: string,
  correlationId: string,
): boolean {
  if (status < 200 || status >= 300) return false;
  if (new TextEncoder().encode(rawBody).byteLength > MAX_ACKNOWLEDGMENT_BYTES) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  return isRecord(parsed) && parsed.success === true &&
    parsed.correlation_id === correlationId;
}

function validateOutboxItem(item: DashboardOutboxItem): Readonly<{
  answers: CanonicalAnswers;
  submittedAt: string;
}> {
  const payload = item.payload;
  const answers = payload.answers;
  const submittedAt = payload.submitted_at;
  if (
    item.id !== item.submissionId ||
    item.id !== item.idempotencyKey ||
    item.id !== item.correlationId ||
    item.schemaVersion !== "angela-anamnesis.v1" ||
    !/^[0-9a-f]{64}$/.test(item.payloadHash) ||
    !Number.isInteger(item.attempts) ||
    item.attempts < 1 ||
    payload.user_id !== item.userId ||
    payload.schema_version !== item.schemaVersion ||
    payload.idempotency_key !== item.idempotencyKey ||
    payload.correlation_id !== item.correlationId ||
    payload.payload_hash !== item.payloadHash ||
    !isRecord(answers) ||
    typeof submittedAt !== "string"
  ) {
    throw new Error("ANGELA_OUTBOX_INVALID");
  }
  return { answers: answers as CanonicalAnswers, submittedAt };
}

async function markRetry(
  ports: DashboardDeliveryPorts,
  item: DashboardOutboxItem,
  errorCode: string,
): Promise<DashboardDeliveryResult> {
  try {
    return retryResult(
      await ports.markRetry(item.correlationId, item.attempts, errorCode),
      item.attempts,
    );
  } catch {
    return retryResult(null, item.attempts);
  }
}

export async function deliverDashboardOutboxItem(
  item: DashboardOutboxItem,
  config: DashboardDeliveryConfig,
  ports: DashboardDeliveryPorts,
  nowSeconds: number,
): Promise<DashboardDeliveryResult> {
  let snapshot: ReturnType<typeof validateOutboxItem>;
  let profile: Awaited<ReturnType<DashboardDeliveryPorts["resolveProfile"]>>;
  try {
    snapshot = validateOutboxItem(item);
    profile = await ports.resolveProfile(item.userId);
  } catch {
    return await markRetry(ports, item, "outbox_snapshot_invalid");
  }
  if (!profile?.fullName.trim() || !profile.email.trim()) {
    return await markRetry(ports, item, "profile_unavailable");
  }

  let rawBody: string;
  let headers: Readonly<Record<string, string>>;
  try {
    rawBody = buildCanonicalWebhookBody({
      userId: item.userId,
      idempotencyKey: item.idempotencyKey,
      correlationId: item.correlationId,
      schemaVersion: item.schemaVersion,
      submittedAt: snapshot.submittedAt,
      payloadHash: item.payloadHash,
      fullName: profile.fullName,
      email: profile.email,
      answers: snapshot.answers,
    }).raw;
    const deliveryJwt = await createDashboardDeliveryJwt({
      secret: config.deliveryJwtSecret,
      userId: item.userId,
      correlationId: item.correlationId,
      nowSeconds,
    });
    headers = await createWebhookHeaders({
      rawBody,
      hmacSecret: config.hmacSecret,
      timestamp: String(nowSeconds),
      correlationId: item.correlationId,
      authorization: `Bearer ${deliveryJwt}`,
    });
  } catch {
    return await markRetry(ports, item, "canonicalization_failed");
  }

  let response: Awaited<ReturnType<DashboardDeliveryPorts["post"]>>;
  try {
    response = await ports.post({
      url: config.dashboardWebhookUrl,
      headers,
      body: rawBody,
      timeoutMs: config.timeoutMs,
    });
  } catch {
    return await markRetry(ports, item, "dashboard_unavailable");
  }
  if (
    !isMatchingAcknowledgment(
      response.status,
      response.body,
      item.correlationId,
    )
  ) {
    const errorCode = response.status >= 200 && response.status < 300
      ? "dashboard_ack_invalid"
      : `dashboard_http_${response.status}`;
    return await markRetry(ports, item, errorCode);
  }

  try {
    if (await ports.markDelivered(item.correlationId, item.attempts)) {
      return { status: "delivered", retryable: false, attempts: item.attempts };
    }
  } catch {
    // The remote acknowledgment may have succeeded. A later status/replay
    // reconciles through the stable correlation id without duplicating work.
  }
  return {
    status: "accepted_pending",
    retryable: true,
    attempts: item.attempts,
  };
}

export async function drainDashboardOutbox(
  claimedItems: readonly DashboardOutboxItem[],
  config: DashboardDeliveryConfig,
  ports: DashboardDeliveryPorts,
  nowSeconds: number,
  requestedLimit = MAX_DRAIN_BATCH,
): Promise<readonly DashboardDeliveryResult[]> {
  const limit = Math.min(
    MAX_DRAIN_BATCH,
    Math.max(0, Math.trunc(requestedLimit)),
  );
  const results: DashboardDeliveryResult[] = [];
  for (const item of claimedItems.slice(0, limit)) {
    results.push(
      await deliverDashboardOutboxItem(item, config, ports, nowSeconds),
    );
  }
  return results;
}
