export const EXPECTED_ANGELA_SUPABASE_URL =
  "https://roovdrcksjfinxhbuxxo.supabase.co" as const;
export const ANGELA_DASHBOARD_PATH = "/api/anamnese/from-app" as const;

export type AngelaEdgeEnvironment = "production" | "development";

export type AngelaEdgeConfig = Readonly<{
  environment: AngelaEdgeEnvironment;
  supabaseUrl: typeof EXPECTED_ANGELA_SUPABASE_URL;
  serviceRoleKey: string;
  dashboardWebhookUrl: string;
  dashboardExpectedOrigin: string;
  hmacSecret: string;
  deliveryJwtSecret: string;
  frontendAllowedOrigins: readonly string[];
  outboxDrainToken: string;
}>;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function invalidConfig(): never {
  throw new Error("ANGELA_EDGE_CONFIG_INVALID");
}

function required(source: EnvironmentSource, key: string): string {
  const value = source[key]?.trim();
  return value ? value : invalidConfig();
}

function parseExactOrigin(
  raw: string,
  environment: AngelaEdgeEnvironment,
): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalidConfig();
  }
  if (
    raw !== url.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return invalidConfig();
  }

  if (url.protocol === "https:") return url.origin;
  const isExplicitLocalDevelopment = environment === "development" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.port !== "";
  return isExplicitLocalDevelopment ? url.origin : invalidConfig();
}

export function resolveAngelaEdgeConfig(
  source: EnvironmentSource,
): AngelaEdgeConfig {
  const environmentValue = required(source, "ANGELA_ENVIRONMENT");
  if (environmentValue !== "production" && environmentValue !== "development") {
    return invalidConfig();
  }
  const environment = environmentValue as AngelaEdgeEnvironment;

  const supabaseUrl = required(source, "ANGELA_SUPABASE_URL");
  if (supabaseUrl !== EXPECTED_ANGELA_SUPABASE_URL) return invalidConfig();

  const dashboardExpectedOrigin = parseExactOrigin(
    required(source, "ANGELA_DASHBOARD_EXPECTED_ORIGIN"),
    "production",
  );
  const dashboardWebhookUrl = required(source, "ANGELA_DASHBOARD_WEBHOOK_URL");
  let dashboardUrl: URL;
  try {
    dashboardUrl = new URL(dashboardWebhookUrl);
  } catch {
    return invalidConfig();
  }
  if (
    dashboardUrl.protocol !== "https:" ||
    dashboardUrl.origin !== dashboardExpectedOrigin ||
    dashboardUrl.pathname !== ANGELA_DASHBOARD_PATH ||
    dashboardUrl.username ||
    dashboardUrl.password ||
    dashboardUrl.search ||
    dashboardUrl.hash
  ) {
    return invalidConfig();
  }

  const frontendAllowedOrigins = required(
    source,
    "ANGELA_FRONTEND_ALLOWED_ORIGINS",
  ).split(",").map((origin) => parseExactOrigin(origin.trim(), environment));
  if (
    frontendAllowedOrigins.length === 0 ||
    new Set(frontendAllowedOrigins).size !== frontendAllowedOrigins.length
  ) {
    return invalidConfig();
  }

  return {
    environment,
    supabaseUrl: EXPECTED_ANGELA_SUPABASE_URL,
    serviceRoleKey: required(source, "ANGELA_SUPABASE_SERVICE_ROLE_KEY"),
    dashboardWebhookUrl,
    dashboardExpectedOrigin,
    hmacSecret: required(source, "ANGELA_WEBHOOK_HMAC_SECRET"),
    deliveryJwtSecret: required(
      source,
      "ANGELA_DASHBOARD_DELIVERY_JWT_SECRET",
    ),
    frontendAllowedOrigins,
    outboxDrainToken: required(source, "ANGELA_OUTBOX_DRAIN_TOKEN"),
  };
}
