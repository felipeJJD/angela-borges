import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  resolveAngelaEdgeConfig,
  resolveAngelaPlanStatusConfig,
} from "./config.ts";
import {
  assertValidCompleteAnamnesisAnswers,
  type CanonicalAnswers,
  computeAnamnesisPayloadHash,
} from "./core.ts";
import {
  type DashboardDeliveryConfig,
  type DashboardDeliveryPorts,
  type DashboardDeliveryResult,
  type DashboardOutboxItem,
  deliverDashboardOutboxItem,
  deliveryHttpStatus,
  drainDashboardOutbox,
} from "./delivery.ts";
import {
  parseAngelaPlanStatusBrowserRequest,
  queryAngelaPlanStatus,
} from "./plan-status.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ACKNOWLEDGMENT_BYTES = 4_096;

type Action = "submit" | "status" | "plan_status" | "drain";
type SubmitRequest = Readonly<{
  action: "submit";
  draftId: string;
  schemaVersion: "angela-anamnesis.v1";
  expectedRevision: number;
  idempotencyKey: string;
}>;
type StatusRequest = Readonly<{
  action: "status";
  idempotencyKey: string;
}>;
type PlanStatusRequest = Readonly<{
  action: "plan_status";
  idempotencyKey: string;
}>;
type DrainRequest = Readonly<{ action: "drain"; limit: number }>;
type ParsedRequest =
  | SubmitRequest
  | StatusRequest
  | PlanStatusRequest
  | DrainRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length === 1 && isRecord(value[0]) ? value[0] : null;
  }
  return isRecord(value) ? value : null;
}

function parseRequest(value: unknown): ParsedRequest {
  if (!isRecord(value)) throw new Error("INVALID_REQUEST");
  const action = value.action as Action;
  if (action === "plan_status") {
    const statusRequest = parseAngelaPlanStatusBrowserRequest(value);
    if (!statusRequest) throw new Error("INVALID_REQUEST");
    return { action, idempotencyKey: statusRequest.idempotencyKey };
  }
  if (action === "status") {
    if (
      typeof value.idempotency_key !== "string" ||
      !UUID_PATTERN.test(value.idempotency_key)
    ) {
      throw new Error("INVALID_REQUEST");
    }
    return { action, idempotencyKey: value.idempotency_key };
  }
  if (action === "drain") {
    const limit = value.limit ?? 10;
    if (!Number.isSafeInteger(limit) || (limit as number) < 1) {
      throw new Error("INVALID_REQUEST");
    }
    return { action, limit: Math.min(limit as number, 25) };
  }
  if (action !== "submit") throw new Error("INVALID_REQUEST");
  if (
    typeof value.draft_id !== "string" ||
    !UUID_PATTERN.test(value.draft_id) ||
    value.schema_version !== "angela-anamnesis.v1" ||
    !Number.isSafeInteger(value.expected_revision) ||
    (value.expected_revision as number) < 1 ||
    value.idempotency_key !== value.draft_id
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return {
    action,
    draftId: value.draft_id,
    schemaVersion: value.schema_version,
    expectedRevision: value.expected_revision as number,
    idempotencyKey: value.draft_id,
  };
}

function loadConfig() {
  const keys = [
    "ANGELA_ENVIRONMENT",
    "ANGELA_SUPABASE_URL",
    "ANGELA_SUPABASE_SERVICE_ROLE_KEY",
    "ANGELA_DASHBOARD_WEBHOOK_URL",
    "ANGELA_DASHBOARD_EXPECTED_ORIGIN",
    "ANGELA_WEBHOOK_HMAC_SECRET",
    "ANGELA_DASHBOARD_DELIVERY_JWT_SECRET",
    "ANGELA_FRONTEND_ALLOWED_ORIGINS",
    "ANGELA_OUTBOX_DRAIN_TOKEN",
  ] as const;
  return resolveAngelaEdgeConfig(
    Object.fromEntries(keys.map((key) => [key, Deno.env.get(key)])),
  );
}

function loadPlanStatusConfig(config: ReturnType<typeof loadConfig>) {
  const keys = [
    "ANGELA_DASHBOARD_STATUS_URL",
    "ANGELA_DASHBOARD_STATUS_JWT_SECRET",
    "SUPABASE_ANON_KEY",
  ] as const;
  return resolveAngelaPlanStatusConfig(
    Object.fromEntries(keys.map((key) => [key, Deno.env.get(key)])),
    config,
  );
}

function corsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[],
): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  allowedOrigins: readonly string[],
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin, allowedOrigins),
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function bearerToken(authorization: string): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (
    let index = 0;
    index < Math.max(leftBytes.length, rightBytes.length);
    index += 1
  ) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function browserDraft(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.user_id,
    schema_version: row.schema_version,
    revision: row.revision,
    status: row.status,
    answers: row.answers,
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at,
    idempotency_key: row.idempotency_key,
  };
}

function mapDeliveryStatus(value: unknown): DashboardDeliveryResult | null {
  const row = oneRow(value);
  if (!row) return null;
  if (
    (row.status !== "accepted_pending" && row.status !== "delivered" &&
      row.status !== "failed") ||
    typeof row.retryable !== "boolean" ||
    !Number.isSafeInteger(row.attempts) ||
    (row.attempts as number) < 0 ||
    (row.status === "accepted_pending" && row.retryable !== true) ||
    (row.status !== "accepted_pending" && row.retryable !== false)
  ) {
    return null;
  }
  return {
    status: row.status,
    retryable: row.retryable,
    attempts: row.attempts as number,
  };
}

function mapOutbox(value: unknown): DashboardOutboxItem | null {
  const row = oneRow(value);
  if (!row || !isRecord(row.payload)) return null;
  if (
    typeof row.id !== "string" ||
    typeof row.submission_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.idempotency_key !== "string" ||
    typeof row.correlation_id !== "string" ||
    typeof row.schema_version !== "string" ||
    typeof row.payload_hash !== "string" ||
    !Number.isSafeInteger(row.attempts)
  ) {
    return null;
  }
  return {
    id: row.id,
    submissionId: row.submission_id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    schemaVersion: row.schema_version,
    payloadHash: row.payload_hash,
    attempts: row.attempts as number,
    payload: row.payload,
  };
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ACKNOWLEDGMENT_BYTES) {
        await reader.cancel();
        return "x".repeat(MAX_ACKNOWLEDGMENT_BYTES + 1);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

type EdgeAdminClient = Readonly<{
  from(table: string): Readonly<{
    select(columns: string): Readonly<{
      eq(column: string, value: unknown): Readonly<{
        maybeSingle(): PromiseLike<Readonly<{ data: unknown; error: unknown }>>;
      }>;
    }>;
  }>;
  auth: Readonly<{
    admin: Readonly<{
      getUserById(userId: string): PromiseLike<
        Readonly<{
          data: Readonly<{
            user: Readonly<{ email?: string | null }> | null;
          }>;
          error: unknown;
        }>
      >;
    }>;
  }>;
  rpc(
    functionName: string,
    parameters: Readonly<Record<string, unknown>>,
  ): PromiseLike<Readonly<{ data: unknown; error: unknown }>>;
}>;

function createDeliveryPorts(
  adminClient: EdgeAdminClient,
): DashboardDeliveryPorts {
  return {
    async resolveProfile(userId) {
      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .maybeSingle();
      const { data: authData, error: authError } = await adminClient.auth.admin
        .getUserById(userId);
      if (
        profileError || authError || !isRecord(profile) ||
        profile.id !== userId ||
        typeof profile.full_name !== "string" || !profile.full_name.trim() ||
        !authData.user?.email
      ) {
        return null;
      }
      return { fullName: profile.full_name, email: authData.user.email };
    },
    async post(deliveryRequest) {
      const response = await fetch(deliveryRequest.url, {
        method: "POST",
        redirect: deliveryRequest.redirect,
        headers: deliveryRequest.headers,
        body: deliveryRequest.body,
        signal: AbortSignal.timeout(deliveryRequest.timeoutMs),
      });
      return { status: response.status, body: await readBoundedBody(response) };
    },
    async markDelivered(correlationId, expectedAttempt) {
      const { data, error } = await adminClient.rpc(
        "mark_dashboard_outbox_delivered",
        {
          p_correlation_id: correlationId,
          p_expected_attempt: expectedAttempt,
        },
      );
      return !error && data === true;
    },
    async markRetry(correlationId, expectedAttempt, errorCode) {
      const retryAfterSeconds = Math.min(
        300,
        Math.max(5, 5 * 2 ** Math.max(0, expectedAttempt - 1)),
      );
      const { data, error } = await adminClient.rpc(
        "mark_dashboard_outbox_retry",
        {
          p_correlation_id: correlationId,
          p_expected_attempt: expectedAttempt,
          p_error_code: errorCode,
          p_retry_after_seconds: retryAfterSeconds,
        },
      );
      return !error && (data === "retry_wait" || data === "dead_letter")
        ? data
        : null;
    },
  };
}

function deliveryConfig(
  config: ReturnType<typeof loadConfig>,
): DashboardDeliveryConfig {
  return {
    dashboardWebhookUrl: config.dashboardWebhookUrl,
    hmacSecret: config.hmacSecret,
    deliveryJwtSecret: config.deliveryJwtSecret,
    timeoutMs: DELIVERY_TIMEOUT_MS,
  };
}

async function authenticateUser(
  authorization: string,
  supabaseUrl: string,
  apiKey: string,
) {
  const token = bearerToken(authorization);
  if (!token) return null;
  const callerClient = createClient(supabaseUrl, apiKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await callerClient.auth.getUser(token);
  return error || !data.user ? null : { callerClient, user: data.user };
}

Deno.serve(async (request: Request): Promise<Response> => {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch {
    return new Response(JSON.stringify({ error: "service_unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }

  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    const allowed = origin !== null &&
      config.frontendAllowedOrigins.includes(origin);
    return new Response(null, {
      status: allowed ? 204 : 403,
      headers: corsHeaders(origin, config.frontendAllowedOrigins),
    });
  }
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "method_not_allowed" },
      405,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  let parsed: ParsedRequest;
  try {
    parsed = parseRequest(await request.json());
  } catch {
    return jsonResponse(
      { error: "invalid_request" },
      400,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  const authorization = request.headers.get("authorization") ?? "";

  if (parsed.action === "drain") {
    const adminClient = createClient(
      config.supabaseUrl,
      config.serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const ports = createDeliveryPorts(
      adminClient as unknown as EdgeAdminClient,
    );
    const token = bearerToken(authorization);
    if (!token || !constantTimeEqual(token, config.outboxDrainToken)) {
      return jsonResponse(
        { error: "unauthorized" },
        401,
        origin,
        config.frontendAllowedOrigins,
      );
    }
    const { data, error } = await adminClient.rpc(
      "claim_due_dashboard_outbox",
      { p_limit: parsed.limit, p_lease_seconds: 20 },
    );
    if (error || !Array.isArray(data)) {
      return jsonResponse(
        { error: "service_unavailable" },
        503,
        origin,
        config.frontendAllowedOrigins,
      );
    }
    const claimed = data.map(mapOutbox);
    if (claimed.some((item) => item === null)) {
      return jsonResponse(
        { error: "invalid_outbox_result" },
        502,
        origin,
        config.frontendAllowedOrigins,
      );
    }
    const results = await drainDashboardOutbox(
      claimed as DashboardOutboxItem[],
      deliveryConfig(config),
      ports,
      Math.floor(Date.now() / 1000),
      parsed.limit,
    );
    return jsonResponse(
      {
        claimed: results.length,
        delivered: results.filter((result) =>
          result.status === "delivered"
        ).length,
        pending: results.filter((result) =>
          result.status === "accepted_pending"
        ).length,
        failed: results.filter((result) => result.status === "failed").length,
      },
      200,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  if (!origin || !config.frontendAllowedOrigins.includes(origin)) {
    return jsonResponse(
      { error: "origin_not_allowed" },
      403,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  if (parsed.action === "plan_status") {
    let statusConfig: ReturnType<typeof loadPlanStatusConfig>;
    try {
      statusConfig = loadPlanStatusConfig(config);
    } catch {
      return jsonResponse(
        { error: "status_unavailable" },
        503,
        origin,
        config.frontendAllowedOrigins,
      );
    }
    const statusUser = await authenticateUser(
      authorization,
      config.supabaseUrl,
      statusConfig.supabaseAnonKey,
    );
    if (!statusUser) {
      return jsonResponse(
        { error: "unauthorized" },
        401,
        origin,
        config.frontendAllowedOrigins,
      );
    }
    const statusResult = await queryAngelaPlanStatus(
      {
        userId: statusUser.user.id,
        idempotencyKey: parsed.idempotencyKey,
        nowSeconds: Math.floor(Date.now() / 1000),
      },
      {
        dashboardStatusUrl: statusConfig.dashboardStatusUrl,
        statusJwtSecret: statusConfig.statusJwtSecret,
        timeoutMs: DELIVERY_TIMEOUT_MS,
      },
      {
        async resolveOwnedSubmission(userId, idempotencyKey) {
          const { data, error } = await statusUser.callerClient
            .from("anamnesis_submissions")
            .select("id, user_id, idempotency_key, correlation_id")
            .eq("user_id", userId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          return { data, error: Boolean(error) };
        },
        async post(statusRequest) {
          const response = await fetch(statusRequest.url, {
            method: statusRequest.method,
            redirect: statusRequest.redirect,
            headers: statusRequest.headers,
            body: statusRequest.body,
            signal: AbortSignal.timeout(statusRequest.timeoutMs),
          });
          return {
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: await readBoundedBody(response),
          };
        },
      },
    );
    return jsonResponse(
      statusResult.body,
      statusResult.httpStatus,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  const authenticated = await authenticateUser(
    authorization,
    config.supabaseUrl,
    config.serviceRoleKey,
  );
  if (!authenticated) {
    return jsonResponse(
      { error: "unauthorized" },
      401,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  if (parsed.action === "status") {
    const { data, error } = await authenticated.callerClient.rpc(
      "get_anamnesis_delivery_status",
      { p_idempotency_key: parsed.idempotencyKey },
    );
    const delivery = error ? null : mapDeliveryStatus(data);
    return delivery
      ? jsonResponse({ delivery }, 200, origin, config.frontendAllowedOrigins)
      : jsonResponse(
        { error: "delivery_status_unavailable" },
        error ? 503 : 404,
        origin,
        config.frontendAllowedOrigins,
      );
  }

  const adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ports = createDeliveryPorts(adminClient as unknown as EdgeAdminClient);

  const { data: draft, error: draftError } = await authenticated.callerClient
    .from("anamnesis_drafts")
    .select(
      "id, user_id, schema_version, revision, status, answers, created_at, updated_at, submitted_at, idempotency_key",
    )
    .eq("id", parsed.draftId)
    .eq("user_id", authenticated.user.id)
    .eq("schema_version", parsed.schemaVersion)
    .maybeSingle();
  if (
    draftError || !draft || draft.id !== parsed.draftId ||
    draft.user_id !== authenticated.user.id ||
    draft.schema_version !== parsed.schemaVersion ||
    draft.idempotency_key !== parsed.idempotencyKey ||
    !Number.isSafeInteger(draft.revision) ||
    (draft.status !== "draft" && draft.status !== "submitted") ||
    !isRecord(draft.answers)
  ) {
    return jsonResponse(
      { error: draftError ? "service_unavailable" : "revision_conflict" },
      draftError ? 503 : 409,
      origin,
      config.frontendAllowedOrigins,
    );
  }
  const draftRevision = draft.revision as number;
  const replayFromLostResponse = draft.status === "submitted" &&
    draftRevision === parsed.expectedRevision + 1;
  if (
    draftRevision !== parsed.expectedRevision && !replayFromLostResponse
  ) {
    return jsonResponse(
      { error: "revision_conflict" },
      409,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  const answers = draft.answers as CanonicalAnswers;
  let payloadHash: string;
  try {
    assertValidCompleteAnamnesisAnswers(
      answers,
      new Date().toISOString().slice(0, 10),
    );
    payloadHash = await computeAnamnesisPayloadHash(
      parsed.schemaVersion,
      answers,
    );
  } catch {
    return jsonResponse(
      { error: "submission_rejected" },
      422,
      origin,
      config.frontendAllowedOrigins,
    );
  }

  const { data: submitData, error: submitError } = await adminClient.rpc(
    "submit_anamnesis_draft",
    {
      p_user_id: authenticated.user.id,
      p_draft_id: parsed.draftId,
      p_schema_version: parsed.schemaVersion,
      p_expected_revision: draftRevision,
      p_expected_answers: answers,
      p_idempotency_key: parsed.idempotencyKey,
      p_payload_hash: payloadHash,
    },
  );
  if (submitError) {
    const status = submitError.code === "40001"
      ? 409
      : submitError.code === "42501"
      ? 403
      : 422;
    return jsonResponse(
      { error: status === 409 ? "revision_conflict" : "submission_rejected" },
      status,
      origin,
      config.frontendAllowedOrigins,
    );
  }
  const submission = oneRow(submitData);
  if (
    !submission || submission.id !== parsed.draftId ||
    submission.user_id !== authenticated.user.id ||
    submission.schema_version !== parsed.schemaVersion ||
    submission.status !== "submitted" ||
    submission.idempotency_key !== parsed.idempotencyKey ||
    submission.correlation_id !== parsed.idempotencyKey ||
    submission.payload_hash !== payloadHash ||
    !isRecord(submission.answers) ||
    await computeAnamnesisPayloadHash(
        parsed.schemaVersion,
        submission.answers,
      ) !==
      payloadHash
  ) {
    return jsonResponse(
      { error: "invalid_submission_result" },
      502,
      origin,
      config.frontendAllowedOrigins,
    );
  }
  const browserSubmission = browserDraft(submission);

  const { data: outboxData, error: outboxError } = await adminClient.rpc(
    "claim_dashboard_outbox",
    { p_correlation_id: parsed.idempotencyKey, p_lease_seconds: 20 },
  );
  const outbox = outboxError ? null : mapOutbox(outboxData);
  if (!outbox) {
    const { data: statusData, error: statusError } = await authenticated
      .callerClient.rpc("get_anamnesis_delivery_status", {
        p_idempotency_key: parsed.idempotencyKey,
      });
    const delivery = statusError ? null : mapDeliveryStatus(statusData);
    const fallback: DashboardDeliveryResult = delivery ?? {
      status: "accepted_pending",
      retryable: true,
      attempts: 0,
    };
    return jsonResponse(
      { draft: browserSubmission, delivery: fallback },
      deliveryHttpStatus(fallback),
      origin,
      config.frontendAllowedOrigins,
    );
  }

  const delivery = await deliverDashboardOutboxItem(
    outbox,
    deliveryConfig(config),
    ports,
    Math.floor(Date.now() / 1000),
  );
  return jsonResponse(
    { draft: browserSubmission, delivery },
    deliveryHttpStatus(delivery),
    origin,
    config.frontendAllowedOrigins,
  );
});
