export interface SupabaseSmsHookEvent {
  user?: { phone?: unknown; new_phone?: unknown };
  sms?: { otp?: unknown };
}

export interface SmsPopCampaignResponse {
  success?: unknown;
  data?: {
    summary?: {
      sent?: unknown;
      failed?: unknown;
      skipped?: unknown;
      invalid?: unknown;
    };
    contacts?: Array<{ phone?: unknown; status?: unknown; reason?: unknown }>;
  };
}

const E164_PHONE = /^\+[1-9]\d{7,14}$/;
const OTP = /^\d{4,10}$/;
const SENDER_ID = /^[A-Za-z0-9]{3,13}$/;

/** Convert an international phone representation to E.164 for SMSPoP. */
export function normalizeSmsRecipient(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const raw = String(value).trim();
  if (!raw) return "";

  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  // International dialing prefix, e.g. 00263789398653.
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return "";
  return `+${digits}`;
}

export function buildSmsPopCampaign(
  event: SupabaseSmsHookEvent,
  senderId: string,
  campaignName = "Detail verification",
) {
  // Supabase supplies `new_phone` for phone-change OTPs. Prefer it over the
  // existing `phone`, which may be empty or still contain the previous value.
  const phone = normalizeSmsRecipient(event.user?.new_phone ?? event.user?.phone);
  const otpValue = event.sms?.otp;
  // Keep OTPs as strings so leading zeroes are preserved.
  const otp = typeof otpValue === "string" ? otpValue : "";
  const normalizedSender = senderId.trim();

  if (!E164_PHONE.test(phone)) {
    throw new Error("Invalid recipient phone number.");
  }
  if (!OTP.test(otp)) throw new Error("Invalid verification code.");
  if (!SENDER_ID.test(normalizedSender)) {
    throw new Error("Invalid SMSPoP sender ID.");
  }

  const message =
    `Your Detail verification code is ${otp}. It expires in 5 minutes. Do not share it.`;
  if (message.length > 160) {
    throw new Error("Verification message exceeds one SMS segment.");
  }

  return {
    name: campaignName,
    message,
    sender_id: normalizedSender,
    contact_import_method: "manual" as const,
    manual_contacts: phone,
  };
}

function digits(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\D/g, "")
    : "";
}

/** Require SMSPoP to confirm this exact recipient was accepted, not merely that a campaign was created. */
export function smsPopAcceptedRecipient(
  response: SmsPopCampaignResponse,
  recipient: string,
): boolean {
  if (response.success !== true) return false;
  const contacts = response.data?.contacts;
  if (!Array.isArray(contacts)) return false;
  const expected = digits(normalizeSmsRecipient(recipient));
  return contacts.some((contact) =>
    digits(contact.phone) === expected && contact.status === "sent"
  );
}
