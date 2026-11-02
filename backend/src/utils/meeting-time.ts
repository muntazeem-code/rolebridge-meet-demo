// Resolve a wall-clock date/time in an IANA timezone without using the server's timezone.
// Reject DST gaps and repeated times rather than silently scheduling a different instant.
export function meetingStartTime(
  date: string,
  time: string,
  timezone: string,
): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    throw new Error("Provide a valid date and time.");
  }
  const nominal = Date.parse(date + "T" + time + ":00Z");
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Provide a valid calendar date.");
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("Choose a valid IANA timezone, such as Asia/Kolkata.");
  }
  const parts = (instant: number) => {
    const fields = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}`;
  };
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = nominal + hours * 3600000;
    offsets.add(Date.parse(parts(instant) + "Z") - instant);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((instant) => parts(instant) === date + "T" + time + ":00");
  if (!matches.length)
    throw new Error(
      "This local time does not exist due to a daylight-saving change. Choose another time.",
    );
  if (matches.length > 1)
    throw new Error(
      "This local time occurs twice due to a daylight-saving change. Choose an unambiguous time.",
    );
  return new Date(matches[0]);
}
