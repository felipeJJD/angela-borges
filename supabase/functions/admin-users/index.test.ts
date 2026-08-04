import { resetPassword } from "./index.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function adminClient(
  profileResult: Readonly<{ data: unknown; error: unknown }>,
): Readonly<{
  client: Parameters<typeof resetPassword>[1];
  updateCalls: () => number;
}> {
  let updates = 0;
  const client = {
    from(table: string) {
      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select(columns: string) {
          if (columns !== "role") {
            throw new Error(`Unexpected columns: ${columns}`);
          }
          return {
            eq(column: string, value: unknown) {
              if (column !== "id" || value !== USER_ID) {
                throw new Error("Unexpected profile scope");
              }
              return { single: () => Promise.resolve(profileResult) };
            },
          };
        },
      };
    },
    auth: {
      admin: {
        updateUserById() {
          updates += 1;
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  return {
    client: client as unknown as Parameters<typeof resetPassword>[1],
    updateCalls: () => updates,
  };
}

Deno.test("reset_password fails closed when the target profile query fails", async () => {
  const fixture = adminClient({
    data: null,
    error: { message: "db unavailable" },
  });

  const response = await resetPassword(
    { user_id: USER_ID, new_password: "synthetic-password" },
    fixture.client,
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "Could not verify target user role",
  });
  assertEquals(fixture.updateCalls(), 0);
});

Deno.test("reset_password fails closed when the target profile is absent", async () => {
  const fixture = adminClient({ data: null, error: null });

  const response = await resetPassword(
    { user_id: USER_ID, new_password: "synthetic-password" },
    fixture.client,
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "User not found" });
  assertEquals(fixture.updateCalls(), 0);
});

Deno.test("reset_password blocks every target role except aluna", async () => {
  for (
    const [role, message] of [
      ["admin", "Cannot reset password of an admin account"],
      ["coach", "Can only reset password of a student account"],
    ] as const
  ) {
    const fixture = adminClient({ data: { role }, error: null });

    const response = await resetPassword(
      { user_id: USER_ID, new_password: "synthetic-password" },
      fixture.client,
    );

    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: message });
    assertEquals(fixture.updateCalls(), 0);
  }
});

Deno.test("reset_password updates exactly one verified aluna", async () => {
  const fixture = adminClient({ data: { role: "aluna" }, error: null });

  const response = await resetPassword(
    { user_id: USER_ID, new_password: "synthetic-password" },
    fixture.client,
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { reset: true, user_id: USER_ID });
  assertEquals(fixture.updateCalls(), 1);
});
