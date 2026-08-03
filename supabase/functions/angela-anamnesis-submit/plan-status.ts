import { createDashboardPlanStatusJwt } from "./delivery-jwt.ts";

export const ANGELA_PLAN_STATUS_SCHEMA_VERSION =
  "angela-plan-status.v1" as const;
export const ANGELA_PLAN_STATUS_PATH = "/api/angela-plan/v1/status" as const;
export const ANGELA_PLAN_STATUS_MAX_RESPONSE_BYTES = 4_096 as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AngelaPlanPipelineFailureCode =
  | "plan_generation_failed"
  | "plan_publication_failed";

export type AngelaPlanPipelineStatus =
  | Readonly<{ state: "building" }>
  | Readonly<{ state: "published" }>
  | Readonly<{
    state: "failed";
    code: AngelaPlanPipelineFailureCode;
    retryable: false;
  }>;

export type AngelaPlanStatusEnvelope = Readonly<{
  schema_version: typeof ANGELA_PLAN_STATUS_SCHEMA_VERSION;
  pipeline: AngelaPlanPipelineStatus;
}>;

export type AngelaPlanStatusConfig = Readonly<{
  dashboardStatusUrl: string;
  statusJwtSecret: string;
  timeoutMs: number;
}>;

export type AngelaPlanStatusRequest = Readonly<{
  url: string;
  method: "POST";
  redirect: "error";
  headers: Readonly<{
    accept: "application/json";
    authorization: string;
    "content-type": "application/json";
  }>;
  body: string;
  timeoutMs: number;
}>;

export type AngelaPlanStatusPorts = Readonly<{
  resolveOwnedSubmission(
    userId: string,
    idempotencyKey: string,
  ): Promise<Readonly<{ data: unknown; error: boolean }>>;
  post(request: AngelaPlanStatusRequest): Promise<
    Readonly<{
      status: number;
      contentType: string | null;
      body: string;
    }>
  >;
}>;

export type AngelaPlanStatusResult =
  | Readonly<{ httpStatus: 200; body: AngelaPlanStatusEnvelope }>
  | Readonly<{
    httpStatus: 404;
    body: Readonly<{ error: "status_not_found" }>;
  }>
  | Readonly<{
    httpStatus: 503;
    body: Readonly<{ error: "status_unavailable" }>;
  }>;

type QueryAngelaPlanStatusInput = Readonly<{
  userId: string;
  idempotencyKey: string;
  nowSeconds: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const compare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;
  const actual = Object.keys(value).sort(compare);
  const wanted = [...expected].sort(compare);
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

export function parseAngelaPlanStatusBrowserRequest(
  value: unknown,
): Readonly<{ idempotencyKey: string }> | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["action", "idempotency_key"]) ||
    value.action !== "plan_status" ||
    typeof value.idempotency_key !== "string" ||
    !UUID_PATTERN.test(value.idempotency_key)
  ) {
    return null;
  }
  return { idempotencyKey: value.idempotency_key };
}

function statusUnavailable(): AngelaPlanStatusResult {
  return { httpStatus: 503, body: { error: "status_unavailable" } };
}

function statusNotFound(): AngelaPlanStatusResult {
  return { httpStatus: 404, body: { error: "status_not_found" } };
}

function validTarget(config: AngelaPlanStatusConfig): boolean {
  let target: URL;
  try {
    target = new URL(config.dashboardStatusUrl);
  } catch {
    return false;
  }
  return target.protocol === "https:" &&
    target.pathname === ANGELA_PLAN_STATUS_PATH &&
    !target.username &&
    !target.password &&
    !target.search &&
    !target.hash &&
    Boolean(config.statusJwtSecret) &&
    Number.isSafeInteger(config.timeoutMs) &&
    config.timeoutMs > 0;
}

function isOwnedSubmission(
  value: unknown,
  userId: string,
  idempotencyKey: string,
): boolean {
  return isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "user_id",
      "idempotency_key",
      "correlation_id",
    ]) &&
    value.id === idempotencyKey &&
    value.user_id === userId &&
    value.idempotency_key === idempotencyKey &&
    value.correlation_id === idempotencyKey;
}

function parseEnvelope(body: string): AngelaPlanStatusEnvelope | null {
  if (
    new TextEncoder().encode(body).byteLength >
      ANGELA_PLAN_STATUS_MAX_RESPONSE_BYTES
  ) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return null;
  }
  if (
    !isRecord(decoded) ||
    !hasExactKeys(decoded, ["schema_version", "pipeline"]) ||
    decoded.schema_version !== ANGELA_PLAN_STATUS_SCHEMA_VERSION ||
    !isRecord(decoded.pipeline)
  ) {
    return null;
  }
  const pipeline = decoded.pipeline;
  if (
    (pipeline.state === "building" || pipeline.state === "published") &&
    hasExactKeys(pipeline, ["state"])
  ) {
    return {
      schema_version: ANGELA_PLAN_STATUS_SCHEMA_VERSION,
      pipeline: { state: pipeline.state },
    };
  }
  if (
    pipeline.state === "failed" &&
    hasExactKeys(pipeline, ["state", "code", "retryable"]) &&
    (pipeline.code === "plan_generation_failed" ||
      pipeline.code === "plan_publication_failed") &&
    pipeline.retryable === false
  ) {
    return {
      schema_version: ANGELA_PLAN_STATUS_SCHEMA_VERSION,
      pipeline: {
        state: "failed",
        code: pipeline.code,
        retryable: false,
      },
    };
  }
  return null;
}

export async function queryAngelaPlanStatus(
  input: QueryAngelaPlanStatusInput,
  config: AngelaPlanStatusConfig,
  ports: AngelaPlanStatusPorts,
): Promise<AngelaPlanStatusResult> {
  if (
    !UUID_PATTERN.test(input.userId) ||
    !UUID_PATTERN.test(input.idempotencyKey)
  ) {
    return statusNotFound();
  }
  if (
    !validTarget(config) ||
    !Number.isSafeInteger(input.nowSeconds) ||
    input.nowSeconds < 0
  ) {
    return statusUnavailable();
  }

  let ownership: Readonly<{ data: unknown; error: boolean }>;
  try {
    ownership = await ports.resolveOwnedSubmission(
      input.userId,
      input.idempotencyKey,
    );
  } catch {
    return statusUnavailable();
  }
  if (ownership.error) return statusUnavailable();
  if (!isOwnedSubmission(ownership.data, input.userId, input.idempotencyKey)) {
    return statusNotFound();
  }

  try {
    const token = await createDashboardPlanStatusJwt({
      secret: config.statusJwtSecret,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      nowSeconds: input.nowSeconds,
    });
    const response = await ports.post({
      url: config.dashboardStatusUrl,
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotency_key: input.idempotencyKey }),
      timeoutMs: config.timeoutMs,
    });
    if (
      response.status !== 200 ||
      !/^application\/json(?:\s*;|$)/i.test(response.contentType ?? "")
    ) {
      return statusUnavailable();
    }
    const envelope = parseEnvelope(response.body);
    return envelope ? { httpStatus: 200, body: envelope } : statusUnavailable();
  } catch {
    return statusUnavailable();
  }
}
