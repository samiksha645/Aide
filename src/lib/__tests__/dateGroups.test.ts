import { describe, it, expect } from "vitest";
import { getGroupLabel } from "@/lib/dateGroups";

// Local-time "now": 1 Oct 2026, 00:30 (just after midnight — the edge case)
const nowEarly = new Date(2026, 9, 1, 0, 30);
const nowNoon = new Date(2026, 9, 1, 12, 0);

describe("getGroupLabel", () => {
  it("puts a chat created moments ago under Today", () => {
    expect(getGroupLabel(new Date(2026, 9, 1, 12, 0).toISOString(), nowNoon)).toBe("Today");
  });

  it("puts a chat created just after local midnight under Today", () => {
    expect(getGroupLabel(new Date(2026, 9, 1, 0, 5).toISOString(), nowEarly)).toBe("Today");
  });

  it("puts late yesterday under Yesterday", () => {
    expect(getGroupLabel(new Date(2026, 8, 30, 23, 59).toISOString(), nowEarly)).toBe("Yesterday");
  });

  it("buckets 2-7 days ago as Previous 7 days", () => {
    expect(getGroupLabel(new Date(2026, 8, 29, 10).toISOString(), nowNoon)).toBe("Previous 7 days");
    expect(getGroupLabel(new Date(2026, 8, 24, 10).toISOString(), nowNoon)).toBe("Previous 7 days");
  });

  it("buckets 8+ days ago as Older", () => {
    expect(getGroupLabel(new Date(2026, 8, 23, 10).toISOString(), nowNoon)).toBe("Older");
  });

  it("treats timestamps slightly in the future (clock skew) as Today", () => {
    expect(getGroupLabel(new Date(2026, 9, 1, 12, 5).toISOString(), nowNoon)).toBe("Today");
  });

  it("treats missing or invalid timestamps as Today, not Older", () => {
    expect(getGroupLabel(undefined, nowNoon)).toBe("Today");
    expect(getGroupLabel("", nowNoon)).toBe("Today");
    expect(getGroupLabel("not-a-date", nowNoon)).toBe("Today");
  });

  it("reads naive SQLite timestamps as UTC", () => {
    const utc = new Date(Date.UTC(2026, 9, 1, 8, 6, 37));
    const pad = (n: number) => String(n).padStart(2, "0");
    const naive = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())} ${pad(
      utc.getUTCHours()
    )}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
    expect(getGroupLabel(naive, utc)).toBe("Today");
  });
});
