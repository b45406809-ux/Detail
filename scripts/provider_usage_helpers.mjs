/** Return normalized Twilio usage rows for one channel without mixing SMS and calls. */
export function twilioUsageRecords(records, channel) {
  const matches = channel === 'sms'
    ? (category) => category.includes('sms')
    : channel === 'voice'
      ? (category) => /\b(?:calls?|voice)\b/.test(category.replace(/[-_]/g, ' '))
      : () => false;

  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => matches(String(record?.category ?? '').toLowerCase()))
    .map((record) => ({
      category: String(record.category ?? ''),
      count: Number(record.count ?? 0),
      countUnit: record.count_unit,
      usage: Number(record.usage ?? 0),
      usageUnit: record.usage_unit,
      price: Number(record.price ?? 0),
      priceUnit: record.price_unit,
    }));
}
