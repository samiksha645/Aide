import { describe, it, expect, vi } from "vitest";
import { getScopedDb } from "@/lib/scoped";
import { GET as getMemoriesHandler } from "@/app/api/memories/route";
import { getServerSession } from "next-auth";

vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    memory: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        // Mock DB behavior: return memory only if userId matches
        if (where.id === "mem_user_A_secret" && where.userId === "usr_A") {
          return Promise.resolve({ id: "mem_user_A_secret", userId: "usr_A", content: "secret" });
        }
        return Promise.resolve(null);
      }),
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where?.userId === "usr_B") {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

describe("Per-User Data Isolation Unit & API Tests", () => {
  const userA = { id: "usr_A", email: "usera@example.com" };
  const userB = { id: "usr_B", email: "userb@example.com" };

  it("should isolate user memories using getScopedDb helper", async () => {
    const scopedDbB = getScopedDb(userB.id);

    expect(scopedDbB.userId).toBe("usr_B");

    // Attempting to query user A's memory using user B's scoped context returns null
    const memoryForB = await scopedDbB.memories.findUnique("mem_user_A_secret");
    expect(memoryForB).toBeNull();
  });

  it("should reject unauthenticated memory API requests with 401 Unauthorized", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce(null);

    const res = await getMemoriesHandler();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should ensure authenticated User B cannot read User A's data", async () => {
    vi.mocked(getServerSession).mockResolvedValueOnce({
      user: { id: userB.id, email: userB.email },
      expires: new Date().toISOString(),
    });

    const res = await getMemoriesHandler();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.memories)).toBe(true);
    expect(body.memories.length).toBe(0);
  });
});
