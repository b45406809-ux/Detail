import { assertEquals } from 'jsr:@std/assert@1';
import { toCleanerBookingSummary } from './cleaner_booking_summary.ts';

Deno.test('cleaner booking preview preserves quote scope without leaking customer data', () => {
  const summary = toCleanerBookingSummary({
    id: 'booking-id',
    customerid: 'customer-id',
    customername: 'Private Customer',
    category: 'HOUSE',
    servicetype: 'Deep clean',
    checklist: { areas: ['Kitchen', 'Living room', 'Alarm code 1234', 7], cleaningTypes: ['DEEP_HOUSE', 'STANDARD_HOUSE'], condition: 'HEAVY', roomsCount: 3, pets: 'keep private' },
    description: 'Alarm code 1234',
    location: { lat: -17.82526, lng: 31.03348, address: '123 Private Road' },
    photos: ['private-photo-path'],
    status: 'PENDING',
  });
  assertEquals(summary.customerId, '');
  assertEquals(summary.description, '');
  assertEquals(summary.location, { lat: -17.83, lng: 31.03, address: 'Approximate area' });
  assertEquals(summary.checklist, {
    category: 'HOUSE', areas: ['Kitchen', 'Living room'], cleaningTypes: ['Deep House Clean', 'Standard House Clean'],
    condition: 'HEAVY', addOns: [], propertyType: undefined, propertySize: undefined, areaSize: undefined,
    bedrooms: undefined, bathrooms: undefined, roomsCount: 3, propertySizeSqm: undefined,
    storiesCount: undefined, bathroomsCount: undefined,
  });
  assertEquals(summary.photos, []);
  assertEquals('customername' in summary, false);
});

Deno.test('vehicle booking preview retains vehicle service scope and bounds malformed coordinates', () => {
  const summary = toCleanerBookingSummary({
    id: 'vehicle-booking', category: 'CAR', servicetype: 'Full valet',
    checklist: { vehicleType: 'SUV', cleaningTypes: ['FULL_CAR'], interiorServices: ['Full vacuum'], registrationNumber: 'ABC123' },
    location: { lat: 999, lng: 31 },
  });
  assertEquals(summary.checklist, {
    category: 'CAR', vehicleType: 'SUV', vehicleSize: undefined, seats: undefined, cleaningTypes: ['Full Car Clean'], condition: undefined,
    exteriorServices: [], interiorServices: ['Full vacuum'], deepServices: [],
  });
  assertEquals(summary.location, { lat: 0, lng: 31, address: 'Approximate area' });
});
