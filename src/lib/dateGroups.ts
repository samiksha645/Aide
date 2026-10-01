export const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;
export type GroupLabel = (typeof GROUP_ORDER)[number];

/**
 * Parse a timestamp from the API. ISO strings with a zone ("...Z" / "+05:30")
 * parse as-is. Naive "YYYY-MM-DD HH:MM:SS" strings (SQLite CURRENT_TIMESTAMP)
 * are UTC, but JS would read them as local time, so normalise them first.
 */
function parseTimestamp(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return isNaN(value) ? null : new Date(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return isNaN(num) ? null : new Date(num);
    }
    // If string has date format without timezone offset, append 'Z' (UTC)
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
      const d = new Date(`${trimmed.replace(" ", "T")}Z`);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Calendar-day index in the user's local timezone (DST-safe). */
function localDayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * Date bucket used to group chats: compares local calendar days, not raw
 * timestamps. Missing/invalid or future timestamps (client/server clock skew,
 * freshly created chats) count as "Today" rather than falling through to "Older".
 */
export function getGroupLabel(
  createdAt: string | number | Date | null | undefined,
  now: Date = new Date()
): GroupLabel {
  const date = parseTimestamp(createdAt);
  if (!date) {
    console.log("[DateGroup] Missing/invalid timestamp -> Today", { createdAt });
    return "Today";
  }

  const daysAgo = localDayIndex(now) - localDayIndex(date);
  const result: GroupLabel =
    daysAgo <= 0
      ? "Today"
      : daysAgo === 1
      ? "Yesterday"
      : daysAgo <= 7
      ? "Previous 7 days"
      : "Older";

  if (process.env.NODE_ENV !== "production") {
    console.log("[DateGroup Debug]", {
      rawCreatedAt: createdAt,
      parsedISO: date.toISOString(),
      parsedLocal: date.toLocaleString(),
      nowLocal: now.toLocaleString(),
      daysAgo,
      result,
    });
  }

  return result;
}
