import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPaymentGateClosed } from "./payment_gate.ts";

Deno.test("payment gate allows payments only when both controls are present and open", () => {
  assertEquals(
    isPaymentGateClosed({ disablePayments: false }, { switches: {} }),
    false,
  );
  assertEquals(
    isPaymentGateClosed({ disablePayments: true }, { switches: {} }),
    true,
  );
  assertEquals(
    isPaymentGateClosed({ maintenanceMode: true }, { switches: {} }),
    true,
  );
  assertEquals(isPaymentGateClosed({}, { switches: { payments: true } }), true);
  assertEquals(
    isPaymentGateClosed({}, { switches: { maintenance: true } }),
    true,
  );
  assertEquals(isPaymentGateClosed(null, { switches: {} }), true);
  assertEquals(isPaymentGateClosed({}, null), true);
});
