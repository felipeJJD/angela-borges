export const ANGELA_ACCOUNT_ID =
  "6637f3b0-2e52-4b2d-86e7-6a35f3dd1613" as const;

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
const SINGLE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  nutrition_goal: ["weight_loss", "muscle_gain", "general_health"],
  nutrition_challenge: [
    "sweets",
    "anxiety_compulsion",
    "alcohol",
    "overeating",
    "meal_planning",
  ],
  sleep_quality: ["excellent", "good", "fair", "poor"],
  water_intake: ["under_1l", "1_to_1_5l", "1_75_to_2l", "over_2l"],
  emotional_eating: ["never", "rarely", "often", "always"],
  meal_preparation: [
    "self",
    "family",
    "eats_out",
    "delivery",
    "household_help",
  ],
  food_budget: ["up_to_200", "200_to_400", "400_to_600", "over_600"],
  training_experience_level: [
    "beginner",
    "basic",
    "intermediate",
    "experienced",
  ],
  training_days_per_week: ["1_2_days", "3_4_days", "5_6_days", "every_day"],
  training_location: ["gym", "home_equipment", "outdoors", "mixed"],
  conditioning_level: ["very_low", "low", "medium", "good"],
  training_background: [
    "never_consistent",
    "school_sports",
    "gym_months",
    "diverse_experience",
  ],
  training_barrier: ["time", "motivation", "knowledge", "fatigue"],
};
const MULTI_RULES: Readonly<
  Record<
    string,
    Readonly<{
      options: readonly string[];
      exclusiveOption?: string;
      maxSelections?: number;
    }>
  >
> = {
  meal_routine: {
    options: [
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "dinner",
      "supper",
      "late_night_snack",
    ],
  },
  dietary_restrictions: {
    options: [
      "none",
      "lactose_intolerance",
      "gluten_intolerance",
      "other_allergies",
    ],
    exclusiveOption: "none",
  },
  health_history: {
    options: ["diabetes", "hypertension", "high_cholesterol", "none"],
    exclusiveOption: "none",
  },
  planned_supplements: {
    options: [
      "none",
      "whey_protein",
      "creatine",
      "pre_workout",
      "omega_3",
      "multivitamin",
    ],
    exclusiveOption: "none",
  },
  sweet_craving_times: {
    options: [
      "none",
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "dinner",
      "supper",
    ],
    exclusiveOption: "none",
  },
  disliked_foods: {
    options: [
      "none",
      "kale",
      "eggplant",
      "cucumber",
      "tomato",
      "onion",
      "garlic",
      "pepper",
      "carrot",
      "broccoli",
      "zucchini",
      "mushrooms",
      "peanuts",
      "fish",
      "shrimp",
      "octopus",
      "squid",
      "egg",
      "cheese",
      "milk",
      "yogurt",
      "whole_grain_bread",
    ],
    exclusiveOption: "none",
  },
  preferred_exercises: {
    options: ["strength", "aerobic", "functional", "varied"],
    maxSelections: 2,
  },
  training_focus_areas: {
    options: ["glutes", "legs", "arms", "back", "shoulders", "chest"],
    maxSelections: 2,
  },
};
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
  account_id: typeof ANGELA_ACCOUNT_ID;
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

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  return value;
}

export async function computeAnamnesisPayloadHash(
  schemaVersion: string,
  quizResponses: Readonly<Record<string, unknown>>,
): Promise<string> {
  const canonical = JSON.stringify(canonicalizeJson({
    quiz_responses: quizResponses,
    schema_version: schemaVersion,
  }));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return toHex(digest);
}

function pickAnswers(
  answers: CanonicalAnswers,
  keys: readonly string[],
): Record<string, CanonicalAnswer> {
  return Object.fromEntries(
    keys.map((key) => [key, cloneAnswer(answers[key])]),
  );
}

function invalidAnswers(): never {
  throw new Error("Invalid anamnesis answers");
}

export function assertValidCompleteAnamnesisAnswers(
  answers: Readonly<Record<string, unknown>>,
  referenceDate: string,
): asserts answers is CanonicalAnswers {
  const actualKeys = Object.keys(answers);
  if (
    actualKeys.length !== ALL_KEYS.length ||
    ALL_KEYS.some((key) =>
      !Object.prototype.hasOwnProperty.call(answers, key)
    ) ||
    actualKeys.some((key) => !(ALL_KEYS as readonly string[]).includes(key))
  ) {
    invalidAnswers();
  }

  const birthDate = answers.birth_date;
  if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    invalidAnswers();
  }
  const parsedBirthDate = new Date(`${birthDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedBirthDate.getTime()) ||
    parsedBirthDate.toISOString().slice(0, 10) !== birthDate ||
    birthDate > referenceDate
  ) {
    invalidAnswers();
  }

  const height = answers.height_cm;
  if (
    !Number.isInteger(height) || (height as number) < 120 ||
    (height as number) > 220
  ) {
    invalidAnswers();
  }
  const weight = answers.weight_kg;
  if (
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight < 35 ||
    weight > 300
  ) {
    invalidAnswers();
  }

  const limitations = answers.injuries_or_limitations;
  if (
    typeof limitations !== "string" ||
    limitations.trim().length < 2 ||
    limitations.trim().length > 500
  ) {
    invalidAnswers();
  }

  for (const [key, options] of Object.entries(SINGLE_OPTIONS)) {
    const value = answers[key];
    if (typeof value !== "string" || !options.includes(value)) invalidAnswers();
  }

  for (const [key, rules] of Object.entries(MULTI_RULES)) {
    const value = answers[key];
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((item) =>
        typeof item !== "string" || !rules.options.includes(item)
      ) ||
      new Set(value).size !== value.length ||
      (rules.maxSelections !== undefined &&
        value.length > rules.maxSelections) ||
      (rules.exclusiveOption !== undefined &&
        value.includes(rules.exclusiveOption) &&
        value.length > 1)
    ) {
      invalidAnswers();
    }
  }
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

  assertValidCompleteAnamnesisAnswers(
    input.answers,
    new Date(input.submittedAt).toISOString().slice(0, 10),
  );
}

export function buildCanonicalWebhookBody(
  input: CanonicalWebhookInput,
): Readonly<{ value: CanonicalWebhookBody; raw: string }> {
  assertCanonicalInput(input);

  const quizResponses = pickAnswers(input.answers, ALL_KEYS);
  const value: CanonicalWebhookBody = {
    source: "angela_app",
    account_id: ANGELA_ACCOUNT_ID,
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
  if (
    !/^\d{1,10}$/.test(input.timestamp) ||
    !Number.isSafeInteger(Number(input.timestamp)) ||
    Number(input.timestamp) <= 0
  ) {
    throw new Error("Invalid webhook timestamp");
  }
  if (!input.authorization.startsWith("Bearer ")) {
    throw new Error("A delivery Bearer authorization header is required");
  }

  return {
    "content-type": "application/json",
    "x-webhook-signature": await hmacSha256Hex(
      `${input.timestamp}.${input.rawBody}`,
      input.hmacSecret,
    ),
    "x-webhook-timestamp": input.timestamp,
    "x-correlation-id": input.correlationId,
    authorization: input.authorization,
  };
}
