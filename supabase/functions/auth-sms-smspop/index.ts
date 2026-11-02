import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  buildSmsPopCampaign,
  smsPopAcceptedRecipient,
  type SmsPopCampaignResponse,
  type SupabaseSmsHookEvent,
} from "../_shared/smspop.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function errorResponse(message: string, status: number) {
  return json({ error: { http_code: status, message } }, status);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return errorResponse("POST required.", 405);

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
  const apiToken = Deno.env.get("SMSPOP_API_TOKEN")?.trim() ||
    Deno.env.get("SMSPOP_API_KEY")?.trim() || "";
  const senderId = Deno.env.get("SMSPOP_SENDER_ID") ?? "";
  if (!hookSecret || !apiToken || !senderId) {
    console.error("SMSPoP Auth hook configuration is incomplete.");
    return errorResponse("SMS delivery is not configured.", 503);
  }

  const rawBody = await request.text();
  let event: SupabaseSmsHookEvent;
  try {
    const secret = hookSecret.replace(/^v1,whsec_/, "");
    const webhook = new Webhook(secret);
    event = webhook.verify(
      rawBody,
      Object.fromEntries(request.headers.entries()),
    ) as SupabaseSmsHookEvent;
  } catch {
    return errorResponse("Invalid Auth hook signature.", 401);
  }

  let campaign: ReturnType<typeof buildSmsPopCampaign>;
  const recipient = typeof event.user?.phone === "string"
    ? event.user.phone.trim()
    : "";
  try {
    campaign = buildSmsPopCampaign(event, senderId);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Invalid SMS request.",
      400,
    );
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://smspop.co.zw/api/campaigns", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(campaign),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    // Do not log the request body, phone number, OTP, or provider credentials.
    console.error(
      "SMSPoP request failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return errorResponse("SMS provider could not be reached.", 502);
  }

  if (!providerResponse.ok) {
    console.error(
      "SMSPoP rejected request with HTTP status",
      providerResponse.status,
    );
    return errorResponse(
      "SMS provider rejected the verification message.",
      502,
    );
  }

  let result: SmsPopCampaignResponse;
  try {
    result = await providerResponse.json() as SmsPopCampaignResponse;
  } catch {
    console.error("SMSPoP returned an unreadable response.");
    return errorResponse("SMS provider returned an invalid response.", 502);
  }

  if (!smsPopAcceptedRecipient(result, recipient)) {
    const summary = result.data?.summary;
    console.error("SMSPoP did not accept the requested recipient.", {
      sent: summary?.sent ?? null,
      failed: summary?.failed ?? null,
      skipped: summary?.skipped ?? null,
      invalid: summary?.invalid ?? null,
    });
    return errorResponse("SMS provider did not accept this phone number.", 502);
  }

  return json({});
});
