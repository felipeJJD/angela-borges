import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  buildCanonicalWebhookBody,
  type CanonicalAnswers,
  createWebhookHeaders,
} from "./core.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info",
  "access-control-max-age": "86400",
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DELIVERY_TIMEOUT_MS = 8_000;

type EdgeConfig = Readonly<{
  supabaseUrl: string;
  serviceRoleKey: string;
  dashboardWebhookUrl: string;
  hmacSecret: string;
}>;

type SubmitRequest = Readonly<{
  draftId: string;
  schemaVersion: "angela-anamnesis.v1";
  expectedRevision: number;
  idempotencyKey: string;
}>;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.length === 1 && isRecord(value[0]) ? value[0] : null;
  }
  return isRecord(value) ? value : null;
}

function loadConfig(): EdgeConfig {
  const supabaseUrl = Deno.env.get("ANGELA_SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey =
    Deno.env.get("ANGELA_SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const dashboardWebhookUrl =
    Deno.env.get("ANGELA_DASHBOARD_WEBHOOK_URL")?.trim() ?? "";
  const hmacSecret = Deno.env.get("ANGELA_WEBHOOK_HMAC_SECRET") ?? "";

  if (!supabaseUrl || !serviceRoleKey || !dashboardWebhookUrl || !hmacSecret) {
    throw new Error("ANGELA_EDGE_CONFIG_MISSING");
  }
  const dashboardUrl = new URL(dashboardWebhookUrl);
  if (
    dashboardUrl.protocol !== "https:" || dashboardUrl.username ||
    dashboardUrl.password
  ) {
    throw new Error("ANGELA_DASHBOARD_URL_INVALID");
  }
  return { supabaseUrl, serviceRoleKey, dashboardWebhookUrl, hmacSecret };
}

function parseSubmitRequest(value: unknown): SubmitRequest {
  if (!isRecord(value)) throw new Error("INVALID_REQUEST");
  const draftId = value.draft_id;
  const schemaVersion = value.schema_version;
  const expectedRevision = value.expected_revision;
  const idempotencyKey = value.idempotency_key;

  if (
    typeof draftId !== "string" ||
    !UUID_PATTERN.test(draftId) ||
    schemaVersion !== "angela-anamnesis.v1" ||
    !Number.isInteger(expectedRevision) ||
    (expectedRevision as number) < 0 ||
    idempotencyKey !== draftId
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return {
    draftId,
    schemaVersion,
    expectedRevision: expectedRevision as number,
    idempotencyKey: draftId,
  };
}

function browserDraft(
  submission: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: submission.id,
    user_id: submission.user_id,
    schema_version: submission.schema_version,
    revision: submission.revision,
    status: submission.status,
    answers: submission.answers,
    created_at: submission.created_at,
    updated_at: submission.updated_at,
    submitted_at: submission.submitted_at,
    idempotency_key: submission.idempotency_key,
  };
}

function isValidSubmission(
  submission: Record<string, unknown>,
  userId: string,
  request: SubmitRequest,
): boolean {
  return (
    submission.id === request.draftId &&
    submission.user_id === userId &&
    submission.schema_version === request.schemaVersion &&
    submission.status === "submitted" &&
    submission.idempotency_key === request.idempotencyKey &&
    submission.correlation_id === request.idempotencyKey &&
    typeof submission.revision === "number" &&
    Number.isInteger(submission.revision) &&
    isRecord(submission.answers) &&
    typeof submission.submitted_at === "string" &&
    typeof submission.payload_hash === "string"
  );
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(300, Math.max(5, 5 * 2 ** Math.max(0, attempt - 1)));
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return jsonResponse({ error: "unauthorized" }, 401);

  let config: EdgeConfig;
  let submitRequest: SubmitRequest;
  try {
    config = loadConfig();
    submitRequest = parseSubmitRequest(await request.json());
  } catch (error) {
    const status = error instanceof Error && error.message.startsWith("ANGELA_")
      ? 503
      : 400;
    return jsonResponse({
      error: status === 503 ? "service_unavailable" : "invalid_request",
    }, status);
  }

  const callerClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "unauthorized" }, 401);

  const { data: submitData, error: submitError } = await callerClient.rpc(
    "submit_anamnesis_draft",
    {
      p_draft_id: submitRequest.draftId,
      p_schema_version: submitRequest.schemaVersion,
      p_expected_revision: submitRequest.expectedRevision,
      p_idempotency_key: submitRequest.idempotencyKey,
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
    );
  }

  const submission = oneRow(submitData);
  if (!submission || !isValidSubmission(submission, user.id, submitRequest)) {
    return jsonResponse({ error: "invalid_submission_result" }, 502);
  }
  const draft = browserDraft(submission);
  const correlationId = submitRequest.idempotencyKey;

  const { data: outboxData, error: outboxError } = await adminClient.rpc(
    "claim_dashboard_outbox",
    { p_correlation_id: correlationId, p_lease_seconds: 20 },
  );
  if (outboxError) {
    return jsonResponse(
      { draft, delivery: { status: "accepted_pending", retryable: true } },
      202,
    );
  }

  const outbox = oneRow(outboxData);
  if (!outbox) {
    const { data: statusData } = await adminClient
      .from("dashboard_outbox")
      .select("status, attempts, next_attempt_at, delivered_at")
      .eq("correlation_id", correlationId)
      .maybeSingle();
    if (statusData?.status === "delivered") {
      return jsonResponse(
        { draft, delivery: { status: "delivered", replayed: true } },
        200,
      );
    }
    return jsonResponse(
      {
        draft,
        delivery: {
          status: "accepted_pending",
          retryable: statusData?.status !== "dead_letter",
        },
      },
      statusData?.status === "dead_letter" ? 503 : 202,
    );
  }

  const attempt = typeof outbox.attempts === "number" ? outbox.attempts : 0;
  const failDelivery = async (errorCode: string): Promise<Response> => {
    const { data: retryStatus } = await adminClient.rpc(
      "mark_dashboard_outbox_retry",
      {
        p_correlation_id: correlationId,
        p_expected_attempt: attempt,
        p_error_code: errorCode,
        p_retry_after_seconds: retryDelaySeconds(attempt),
      },
    );
    const retryable = retryStatus !== "dead_letter";
    return jsonResponse(
      {
        draft,
        delivery: {
          status: retryable ? "accepted_pending" : "failed",
          retryable,
        },
      },
      retryable ? 202 : 503,
    );
  };

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  const { data: authUserData, error: authUserError } = await adminClient.auth
    .admin.getUserById(user.id);
  const email = authUserData.user?.email ?? "";
  if (
    profileError ||
    authUserError ||
    !profile ||
    profile.id !== user.id ||
    typeof profile.full_name !== "string" ||
    !profile.full_name.trim() ||
    !email
  ) {
    return await failDelivery("profile_unavailable");
  }

  let canonical: ReturnType<typeof buildCanonicalWebhookBody>;
  let headers: Readonly<Record<string, string>>;
  try {
    canonical = buildCanonicalWebhookBody({
      userId: user.id,
      idempotencyKey: correlationId,
      correlationId,
      schemaVersion: String(submission.schema_version),
      submittedAt: String(submission.submitted_at),
      payloadHash: String(submission.payload_hash),
      fullName: profile.full_name,
      email,
      answers: submission.answers as CanonicalAnswers,
    });
    headers = await createWebhookHeaders({
      rawBody: canonical.raw,
      hmacSecret: config.hmacSecret,
      timestamp: new Date().toISOString(),
      correlationId,
      authorization,
    });
  } catch {
    return await failDelivery("canonicalization_failed");
  }

  try {
    const dashboardResponse = await fetch(config.dashboardWebhookUrl, {
      method: "POST",
      headers,
      body: canonical.raw,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    try {
      await dashboardResponse.body?.cancel();
    } catch {
      // The status is authoritative; an unread response body is never logged.
    }

    if (!dashboardResponse.ok) {
      return await failDelivery(`dashboard_http_${dashboardResponse.status}`);
    }

    const { data: markedDelivered, error: markError } = await adminClient.rpc(
      "mark_dashboard_outbox_delivered",
      {
        p_correlation_id: correlationId,
        p_expected_attempt: attempt,
      },
    );
    if (markError || markedDelivered !== true) {
      return jsonResponse(
        {
          draft,
          delivery: { status: "accepted_pending", retryable: true },
        },
        202,
      );
    }
    return jsonResponse({
      draft,
      delivery: { status: "delivered", attempts: attempt },
    }, 200);
  } catch (error) {
    const errorCode =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "dashboard_timeout"
        : "dashboard_network_error";
    return await failDelivery(errorCode);
  }
});
