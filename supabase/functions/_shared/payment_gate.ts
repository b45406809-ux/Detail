type Settings = Record<string, unknown>;

/** Fail closed when either payment-control row is absent or a pause is active. */
export function isPaymentGateClosed(
  beta: unknown,
  operations: unknown,
): boolean {
  if (
    !beta || typeof beta !== "object" || !operations ||
    typeof operations !== "object"
  ) return true;
  const settings = beta as Settings;
  const operationalSettings = operations as Settings;
  const switches = operationalSettings.switches &&
      typeof operationalSettings.switches === "object"
    ? operationalSettings.switches as Settings
    : {};
  return settings.maintenanceMode === true ||
    settings.disablePayments === true ||
    switches.maintenance === true ||
    switches.payments === true;
}
