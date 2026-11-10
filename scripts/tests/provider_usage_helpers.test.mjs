import test from 'node:test';
import assert from 'node:assert/strict';
import { twilioUsageRecords } from '../provider_usage_helpers.mjs';

const records = [
  { category: 'sms-outbound', count: '12', count_unit: 'messages', usage: '12', usage_unit: 'messages', price: '0.84', price_unit: 'USD' },
  { category: 'calls-inbound-connectivity', count: '4', count_unit: 'calls', usage: '37', usage_unit: 'minutes', price: '0.19', price_unit: 'USD' },
  { category: 'voice-outbound-connectivity', count: '3', count_unit: 'calls', usage: '11', usage_unit: 'minutes', price: '0.07', price_unit: 'USD' },
  { category: 'phone-numbers', count: '1', count_unit: 'numbers', usage: '1', usage_unit: 'month', price: '1.00', price_unit: 'USD' },
];

test('Twilio SMS usage excludes voice and phone number rows', () => {
  assert.deepEqual(twilioUsageRecords(records, 'sms').map((row) => row.category), ['sms-outbound']);
});

test('Twilio voice usage includes call and voice records with billed amounts', () => {
  const voice = twilioUsageRecords(records, 'voice');
  assert.deepEqual(voice.map((row) => row.category), ['calls-inbound-connectivity', 'voice-outbound-connectivity']);
  assert.equal(voice[0].usageUnit, 'minutes');
  assert.equal(voice.reduce((sum, row) => sum + row.price, 0), 0.26);
});

test('unknown usage channels and malformed payloads return no rows', () => {
  assert.deepEqual(twilioUsageRecords(records, 'whatsapp'), []);
  assert.deepEqual(twilioUsageRecords(null, 'voice'), []);
});
