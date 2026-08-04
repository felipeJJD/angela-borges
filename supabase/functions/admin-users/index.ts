import { createClient } from "jsr:@supabase/supabase-js@2";

// ──────────────────────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return corsResponse({ error: message }, status);
}

// ──────────────────────────────────────────────────────────────────────────────
// Env vars (injected by Supabase edge runtime)
// ──────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function createServiceRoleClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

type AdminClient = ReturnType<typeof createServiceRoleClient>;

// ──────────────────────────────────────────────────────────────────────────────
// Input validators
// ──────────────────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: unknown): string | null {
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) return null;
  return email.trim().toLowerCase();
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 6) return null;
  return password;
}

function validateUserId(userId: unknown): string | null {
  // UUID v4 format
  if (
    typeof userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    return null;
  }
  return userId;
}

function validateTeam(team: unknown): number | null {
  const t = Number(team);
  if (!Number.isInteger(t) || t < 1 || t > 3) return null;
  return t;
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth: validate caller JWT → verify admin role
// ──────────────────────────────────────────────────────────────────────────────
async function requireAdmin(
  authHeader: string | null,
): Promise<{ userId: string } | Response> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("Missing or invalid Authorization header", 401);
  }

  const token = authHeader.replace("Bearer ", "");

  // Validate JWT with anon client (respects Supabase JWT verification)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userError } = await anonClient.auth.getUser();

  if (userError || !user) {
    console.warn({
      event: "auth_failed",
      reason: userError?.message ?? "no user",
    });
    return errorResponse("Unauthorized", 401);
  }

  // Verify admin role via service role client (bypasses RLS for the check)
  const adminClient = createServiceRoleClient();

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    console.warn({
      event: "forbidden",
      user_id: user.id,
      role: profile?.role ?? "unknown",
    });
    return errorResponse("Forbidden: admin role required", 403);
  }

  return { userId: user.id };
}

// ──────────────────────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────────────────────

async function createStudent(
  body: Record<string, unknown>,
  adminClient: AdminClient,
): Promise<Response> {
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);
  const fullName = body.full_name;

  if (!email) return errorResponse("Invalid or missing email", 400);
  if (!password) {
    return errorResponse("Password must be at least 6 characters", 400);
  }
  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return errorResponse("full_name is required", 400);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName.trim(),
      role: "aluna",
    },
  });

  if (error) {
    console.error({ event: "create_student_failed", error: error.message });
    // Surface recognizable errors (e.g. duplicate email) as 422
    const status = error.message.toLowerCase().includes("already") ? 422 : 500;
    return errorResponse(error.message, status);
  }

  console.info({
    event: "student_created",
    user_id: data.user.id,
    email: data.user.email,
  });

  return corsResponse({ id: data.user.id, email: data.user.email }, 201);
}

async function deleteStudent(
  body: Record<string, unknown>,
  adminClient: AdminClient,
): Promise<Response> {
  const userId = validateUserId(body.user_id);
  if (!userId) {
    return errorResponse("Invalid or missing user_id (UUID expected)", 400);
  }

  // Safety: never delete an admin
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error({
      event: "delete_student_profile_fetch_failed",
      user_id: userId,
      error: profileError.message,
    });
    return errorResponse("Could not verify target user role", 500);
  }

  if (!profile) {
    return errorResponse("User not found", 404);
  }

  if (profile.role === "admin") {
    console.warn({ event: "delete_admin_blocked", user_id: userId });
    return errorResponse("Cannot delete an admin user", 403);
  }

  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    console.error({
      event: "delete_student_failed",
      user_id: userId,
      error: error.message,
    });
    return errorResponse(error.message, 500);
  }

  console.info({ event: "student_deleted", user_id: userId });
  return corsResponse({ deleted: true, user_id: userId });
}

export async function resetPassword(
  body: Record<string, unknown>,
  adminClient: AdminClient,
): Promise<Response> {
  const userId = validateUserId(body.user_id);
  const newPassword = validatePassword(body.new_password);

  if (!userId) {
    return errorResponse("Invalid or missing user_id (UUID expected)", 400);
  }
  if (!newPassword) {
    return errorResponse("new_password must be at least 6 characters", 400);
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (targetProfileError) {
    console.error({
      event: "reset_password_profile_fetch_failed",
      user_id: userId,
      error: targetProfileError.message,
    });
    return errorResponse("Could not verify target user role", 500);
  }
  if (!targetProfile) {
    return errorResponse("User not found", 404);
  }
  const targetRole = (targetProfile as { role?: unknown }).role;
  if (targetRole === "admin") {
    return errorResponse("Cannot reset password of an admin account", 403);
  }
  if (targetRole !== "aluna") {
    console.warn({
      event: "reset_password_role_blocked",
      user_id: userId,
      role: typeof targetRole === "string" ? targetRole : "unknown",
    });
    return errorResponse("Can only reset password of a student account", 403);
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    console.error({
      event: "reset_password_failed",
      user_id: userId,
      error: error.message,
    });
    return errorResponse(error.message, 500);
  }

  console.info({ event: "password_reset", user_id: userId });
  return corsResponse({ reset: true, user_id: userId });
}

async function setTeam(
  body: Record<string, unknown>,
  adminClient: AdminClient,
): Promise<Response> {
  const userId = validateUserId(body.user_id);
  const team = validateTeam(body.team);

  if (!userId) {
    return errorResponse("Invalid or missing user_id (UUID expected)", 400);
  }
  if (team === null) {
    return errorResponse("team must be an integer between 1 and 3", 400);
  }

  const { error } = await adminClient
    .from("profiles")
    .update({ current_team: team })
    .eq("id", userId);

  if (error) {
    console.error({
      event: "set_team_failed",
      user_id: userId,
      team,
      error: error.message,
    });
    return errorResponse(error.message, 500);
  }

  console.info({ event: "team_set", user_id: userId, team });
  return corsResponse({ updated: true, user_id: userId, team });
}

async function listStudents(
  adminClient: AdminClient,
): Promise<Response> {
  // 1. Fetch all profiles with role='aluna'
  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, full_name, current_team, created_at")
    .eq("role", "aluna")
    .order("created_at", { ascending: false });

  if (profilesError) {
    console.error({
      event: "list_students_profiles_failed",
      error: profilesError.message,
    });
    return errorResponse(profilesError.message, 500);
  }

  if (!profiles || profiles.length === 0) {
    return corsResponse([]);
  }

  const studentIds = profiles.map((p) => p.id);

  // 2. Fetch auth users (paginated) — collect email by id
  const emailMap: Record<string, string> = {};
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: { users }, error: usersError } = await adminClient.auth.admin
      .listUsers({ page, perPage });

    if (usersError) {
      console.error({
        event: "list_students_auth_failed",
        page,
        error: usersError.message,
      });
      // Non-fatal: continue without emails rather than crashing entire list
      break;
    }

    for (const u of users) {
      if (studentIds.includes(u.id)) {
        emailMap[u.id] = u.email ?? "";
      }
    }

    // Supabase returns empty array when no more pages
    if (users.length < perPage) break;
    page++;
  }

  // 3. Last check-in date per student
  const { data: checkins, error: checkinsError } = await adminClient
    .from("daily_checkins")
    .select("user_id, done_on")
    .in("user_id", studentIds)
    .order("done_on", { ascending: false });

  const lastCheckinMap: Record<string, string | null> = {};
  if (!checkinsError && checkins) {
    for (const c of checkins) {
      // First occurrence per user_id = most recent (already ordered desc)
      if (!(c.user_id in lastCheckinMap)) {
        lastCheckinMap[c.user_id] = c.done_on;
      }
    }
  } else if (checkinsError) {
    console.warn({
      event: "list_students_checkins_warn",
      error: checkinsError.message,
    });
  }

  // 4. Workout completions count per student
  const { data: completions, error: completionsError } = await adminClient
    .from("workout_completions")
    .select("user_id")
    .in("user_id", studentIds);

  const completionsCountMap: Record<string, number> = {};
  if (!completionsError && completions) {
    for (const c of completions) {
      completionsCountMap[c.user_id] = (completionsCountMap[c.user_id] ?? 0) +
        1;
    }
  } else if (completionsError) {
    console.warn({
      event: "list_students_completions_warn",
      error: completionsError.message,
    });
  }

  // 5. Assemble response
  const students = profiles.map((p) => ({
    id: p.id,
    email: emailMap[p.id] ?? null,
    full_name: p.full_name,
    current_team: p.current_team,
    created_at: p.created_at,
    last_checkin: lastCheckinMap[p.id] ?? null,
    workouts_completed: completionsCountMap[p.id] ?? 0,
  }));

  console.info({ event: "students_listed", count: students.length });
  return corsResponse(students);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────────────
export async function handleAdminUsersRequest(req: Request): Promise<Response> {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Auth check
  const authResult = await requireAdmin(req.headers.get("Authorization"));
  if (authResult instanceof Response) return authResult;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const action = body.action;
  if (typeof action !== "string" || !action) {
    return errorResponse("Missing required field: action", 400);
  }

  // Service role client for all admin operations
  const adminClient = createServiceRoleClient();

  console.info({
    event: "admin_action",
    action,
    caller_id: authResult.userId,
  });

  switch (action) {
    case "create_student":
      return await createStudent(body, adminClient);

    case "delete_student":
      return await deleteStudent(body, adminClient);

    case "reset_password":
      return await resetPassword(body, adminClient);

    case "set_team":
      return await setTeam(body, adminClient);

    case "list_students":
      return await listStudents(adminClient);

    default:
      return errorResponse(`Unknown action: ${action}`, 400);
  }
}

if (import.meta.main) {
  Deno.serve(handleAdminUsersRequest);
}
