export const PERSONAL_KEYS = ["birth_date", "height_cm", "weight_kg"] as const;

export const NUTRITION_KEYS = [
  "nutrition_goal",
  "meal_routine",
  "dietary_restrictions",
  "nutrition_challenge",
  "health_history",
  "sleep_quality",
  "water_intake",
  "emotional_eating",
  "meal_preparation",
  "planned_supplements",
  "sweet_craving_times",
  "disliked_foods",
  "food_budget",
] as const;

export const TRAINING_KEYS = [
  "training_experience_level",
  "training_days_per_week",
  "training_location",
  "injuries_or_limitations",
  "preferred_exercises",
  "conditioning_level",
  "training_background",
  "training_barrier",
  "training_focus_areas",
] as const;

const ALL_KEYS = [
  ...PERSONAL_KEYS,
  ...NUTRITION_KEYS,
  ...TRAINING_KEYS,
] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CanonicalAnswer = string | number | readonly string[];
export type CanonicalAnswers = Readonly<Record<string, CanonicalAnswer>>;

export type CanonicalWebhookInput = Readonly<{
  userId: string;
  idempotencyKey: string;
  correlationId: string;
  schemaVersion: string;
  submittedAt: string;
  payloadHash: string;
  fullName: string;
  email: string;
  answers: CanonicalAnswers;
}>;

export type CanonicalWebhookBody = Readonly<{
  source: "angela_app";
  quiz_type: "completo";
  user_id: string;
  idempotency_key: string;
  correlation_id: string;
  schema_version: "angela-anamnesis.v1";
  submitted_at: string;
  payload_hash: string;
  user_profile: Readonly<{
    full_name: string;
    email: string;
    birth_date: CanonicalAnswer;
    height_cm: CanonicalAnswer;
    weight_kg: CanonicalAnswer;
  }>;
  anamnese_nutricional: CanonicalAnswers;
  anamnese_treino: CanonicalAnswers;
  quiz_responses: CanonicalAnswers;
}>;

function cloneAnswer(answer: CanonicalAnswer): CanonicalAnswer {
  return Array.isArray(answer) ? [...answer] : answer;
}

function pickAnswers(
  answers: CanonicalAnswers,
  keys: readonly string[],
): Record<string, CanonicalAnswer> {
  return Object.fromEntries(
    keys.map((key) => [key, cloneAnswer(answers[key])]),
  );
}

function assertCanonicalInput(input: CanonicalWebhookInput): void {
  if (input.schemaVersion !== "angela-anamnesis.v1") {
    throw new Error("Unsupported anamnesis schema version");
  }
  if (
    !UUID_PATTERN.test(input.userId) ||
    !UUID_PATTERN.test(input.correlationId) ||
    input.idempotencyKey !== input.correlationId
  ) {
    throw new Error("Invalid anamnesis submission identity");
  }
  if (!/^[0-9a-f]{64}$/.test(input.payloadHash)) {
    throw new Error("Invalid anamnesis payload hash");
  }
  if (!Number.isFinite(Date.parse(input.submittedAt))) {
    throw new Error("Invalid anamnesis submitted_at");
  }
  if (!input.fullName.trim() || !input.email.trim()) {
    throw new Error("Server-resolved profile is incomplete");
  }

  const actualKeys = Object.keys(input.answers);
  if (
    actualKeys.length !== ALL_KEYS.length ||
    ALL_KEYS.some((key) =>
      !Object.prototype.hasOwnProperty.call(input.answers, key)
    ) ||
    actualKeys.some((key) => !(ALL_KEYS as readonly string[]).includes(key))
  ) {
    throw new Error("Anamnesis answers must contain the exact v1 key set");
  }
}

export function buildCanonicalWebhookBody(
  input: CanonicalWebhookInput,
): Readonly<{ value: CanonicalWebhookBody; raw: string }> {
  assertCanonicalInput(input);

  const quizResponses = pickAnswers(input.answers, ALL_KEYS);
  const value: CanonicalWebhookBody = {
    source: "angela_app",
    quiz_type: "completo",
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    correlation_id: input.correlationId,
    schema_version: "angela-anamnesis.v1",
    submitted_at: input.submittedAt,
    payload_hash: input.payloadHash,
    user_profile: {
      full_name: input.fullName,
      email: input.email,
      birth_date: cloneAnswer(input.answers.birth_date),
      height_cm: cloneAnswer(input.answers.height_cm),
      weight_kg: cloneAnswer(input.answers.weight_kg),
    },
    anamnese_nutricional: pickAnswers(input.answers, NUTRITION_KEYS),
    anamnese_treino: pickAnswers(input.answers, TRAINING_KEYS),
    quiz_responses: quizResponses,
  };

  return { value, raw: JSON.stringify(value) };
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hmacSha256Hex(
  rawBody: string,
  hmacSecret: string,
): Promise<string> {
  if (!hmacSecret) throw new Error("HMAC secret is required");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(hmacSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
}

export type WebhookHeaderInput = Readonly<{
  rawBody: string;
  hmacSecret: string;
  timestamp: string;
  correlationId: string;
  authorization: string;
}>;

export async function createWebhookHeaders(
  input: WebhookHeaderInput,
): Promise<Readonly<Record<string, string>>> {
  if (!UUID_PATTERN.test(input.correlationId)) {
    throw new Error("Invalid correlation id");
  }
  if (!Number.isFinite(Date.parse(input.timestamp))) {
    throw new Error("Invalid webhook timestamp");
  }
  if (!input.authorization.startsWith("Bearer ")) {
    throw new Error("A user Bearer authorization header is required");
  }

  return {
    "content-type": "application/json",
    "x-webhook-signature": await hmacSha256Hex(input.rawBody, input.hmacSecret),
    "x-webhook-timestamp": input.timestamp,
    "x-correlation-id": input.correlationId,
    authorization: input.authorization,
  };
}
