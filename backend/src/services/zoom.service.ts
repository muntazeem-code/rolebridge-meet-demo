export class ZoomServiceError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
let cachedToken: { key: string; token: string; expires: number } | undefined;
function config() {
  const account = process.env.ZOOM_ACCOUNT_ID;
  const client = process.env.ZOOM_CLIENT_ID;
  const secret = process.env.ZOOM_CLIENT_SECRET;
  const host = process.env.ZOOM_HOST_EMAIL;
  if (!account || !client || !secret || !host) {
    throw new ZoomServiceError(
      "Zoom is not configured. Ask the administrator to configure the server-to-server app.",
    );
  }
  return { account, client, secret, host };
}
function timeoutMs() {
  const value = Number(process.env.ZOOM_TIMEOUT_MS || 10000);
  return Number.isFinite(value) ? Math.max(100, Math.min(30000, value)) : 10000;
}
async function accessToken() {
  const { account, client, secret } = config();
  const tokenUrl = process.env.ZOOM_TOKEN_URL || "https://zoom.us/oauth/token";
  const key = account + client + secret + tokenUrl;
  if (cachedToken?.key === key && cachedToken.expires > Date.now())
    return cachedToken.token;
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(client + ":" + secret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "account_credentials",
        account_id: account,
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch {
    throw new ZoomServiceError(
      "Could not reach Zoom authorization. Try again later.",
    );
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new ZoomServiceError(
      "Zoom authorization failed. Check the server-to-server credentials, app activation, and scopes.",
    );
  }
  cachedToken = {
    key,
    token: body.access_token,
    expires:
      Date.now() + Math.max(0, Number(body.expires_in || 3600) - 60) * 1000,
  };
  return body.access_token;
}
export async function createZoomMeeting(input: {
  topic: string;
  startTime: Date;
  timezone: string;
  duration: number;
}) {
  const { host } = config();
  const token = await accessToken();
  const base = (
    process.env.ZOOM_API_BASE_URL || "https://api.zoom.us/v2"
  ).replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(
      base + "/users/" + encodeURIComponent(host) + "/meetings",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: input.topic,
          type: 2,
          start_time: input.startTime.toISOString().replace(".000Z", "Z"),
          timezone: input.timezone,
          duration: input.duration,
          settings: { waiting_room: true, join_before_host: false },
        }),
        signal: AbortSignal.timeout(timeoutMs()),
      },
    );
  } catch {
    // A timed-out POST may have reached Zoom. Do not automatically create another meeting.
    throw new ZoomServiceError(
      "Zoom did not confirm creation. The administrator must check Zoom before scheduling again.",
      true,
    );
  }
  const body = (await response.json().catch(() => null)) as {
    id?: number | string;
    join_url?: string;
  } | null;
  if (!response.ok) {
    if (response.status === 401) cachedToken = undefined;
    throw new ZoomServiceError(
      response.status === 429
        ? "Zoom rate limit reached. Try again later."
        : response.status === 401 || response.status === 403
          ? "Zoom denied meeting creation. Check the host and meeting scopes."
          : "Zoom could not create the meeting (HTTP " + response.status + ").",
      response.status >= 500,
    );
  }
  if (!body?.id || !body.join_url || !/^https:\/\//i.test(body.join_url)) {
    throw new ZoomServiceError(
      "Zoom returned an incomplete meeting response. Ask the administrator to check Zoom.",
      true,
    );
  }
  // Never expose or email Zoom's host start_url or OAuth tokens.
  return { zoomMeetingId: String(body.id), joinUrl: body.join_url };
}
