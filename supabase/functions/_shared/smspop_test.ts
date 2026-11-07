import { buildSmsPopCampaign, smsPopAcceptedRecipient } from "./smspop.ts";
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

Deno.test("builds a single-segment SMSPoP campaign from a signed Auth hook event", () => {
  const campaign = buildSmsPopCampaign({
    user: { phone: "+263787213818" },
    sms: { otp: "195514" },
  }, "Detail");

  assertEquals(campaign.sender_id, "Detail");
  assertEquals(campaign.contact_import_method, "manual");
  assertEquals(campaign.manual_contacts, "+263787213818");
  assertEquals(
    campaign.message,
    "Your Detail verification code is 195514. It expires in 5 minutes. Do not share it.",
  );
  assert(campaign.message.length <= 160);
});

Deno.test("rejects malformed destinations, OTPs, and sender IDs", () => {
  assertThrows(() =>
    buildSmsPopCampaign({
      user: { phone: "0787213818" },
      sms: { otp: "123456" },
    }, "Detail")
  );
  assertThrows(() =>
    buildSmsPopCampaign({
      user: { phone: "+263787213818" },
      sms: { otp: "1234abc" },
    }, "Detail")
  );
  assertThrows(() =>
    buildSmsPopCampaign({
      user: { phone: "+263787213818" },
      sms: { otp: 123456 },
    }, "Detail")
  );
  assertThrows(() =>
    buildSmsPopCampaign({
      user: { phone: "+263787213818" },
      sms: { otp: "123456" },
    }, "Detail!")
  );
});

Deno.test("accepts the international digits returned by Supabase Auth", () => {
  const campaign = buildSmsPopCampaign({ user: { phone: "263787213818" }, sms: { otp: "012345" } }, "Detail");
  assertEquals(campaign.manual_contacts, "+263787213818");
});

Deno.test("accepts only a successful response for the requested recipient", () => {
  const good = {
    success: true,
    data: { contacts: [{ phone: "263787213818", status: "sent" }] },
  };
  assert(smsPopAcceptedRecipient(good, "+263787213818"));
  assert(
    !smsPopAcceptedRecipient({ ...good, success: false }, "+263787213818"),
  );
  assert(
    !smsPopAcceptedRecipient({
      success: true,
      data: { contacts: [{ phone: "263787213818", status: "skipped" }] },
    }, "+263787213818"),
  );
  assert(
    !smsPopAcceptedRecipient({
      success: true,
      data: { contacts: [{ phone: "263712345678", status: "sent" }] },
    }, "+263787213818"),
  );
  assert(
    !smsPopAcceptedRecipient(
      { success: true, data: { summary: { sent: 1 } } },
      "+263787213818",
    ),
  );
});
