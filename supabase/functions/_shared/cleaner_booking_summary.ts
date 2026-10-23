type Json = Record<string, unknown>;

const safeText = (value: unknown, max = 60): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const safeStrings = (value: unknown, allowed: readonly string[]): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))].slice(0, 12)
  : [];
const HOUSE_AREAS = ['Living room', 'Bedrooms', 'Kitchen', 'Dining room', 'Bathrooms', 'Hallways', 'Garage', 'Office', 'Balcony', 'Patio', 'Laundry room', 'Storage room', 'Bedroom', 'Bathroom', 'Other'];
const HOUSE_PARTS = ['Windows', 'Floors', 'Walls', 'Carpets', 'Upholstery', 'Cupboards', 'Appliances', 'Garage', 'Other'];
const HOUSE_SERVICES: Record<string, string> = { BASIC_HOUSE: 'Basic House Clean', SPECIFIC_ROOM: 'Specific Room / Part', STANDARD_HOUSE: 'Standard House Clean', DEEP_HOUSE: 'Deep House Clean' };
const HOUSE_ADD_ONS = ['Interior windows', 'Exterior windows', 'Mirrors', 'Inside cupboards', 'Fridge', 'Oven', 'Microwave', 'Garage', 'Balcony', 'Patio', 'Oven cleaning', 'Fridge cleaning', 'Microwave cleaning', 'Cupboard cleaning', 'Wall cleaning', 'Carpet cleaning', 'Upholstery cleaning', 'Garage cleaning', 'Balcony/patio cleaning'];
const HOUSE_ATTENTION: Record<string, readonly string[]> = {
  Kitchen: ['Oven', 'Fridge', 'Microwave', 'Cabinets', 'Countertops', 'Sink', 'Appliances', 'Walls', 'Floor'],
  Bathroom: ['Shower', 'Bathtub', 'Toilet', 'Tiles', 'Grout', 'Mirrors', 'Cabinets', 'Floor'],
  Bedrooms: ['Floors', 'Wardrobes', 'Under furniture', 'Windows', 'Walls', 'Doors'],
  'Living areas': ['Sofas', 'Carpets', 'Curtains', 'Windows', 'Walls', 'Floors'],
};
const CAR_TYPES = ['Sedan', 'Hatchback', 'Coupe', 'SUV', 'Crossover', 'Pickup / Double Cab', 'Minivan', 'Van', 'Truck', 'Other'];
const CAR_SERVICES: Record<string, string> = { EXTERIOR_WASH: 'Exterior Wash', FULL_CAR: 'Full Car Clean', DEEP_DETAIL: 'Deep Detail' };
const CAR_EXTERIOR = ['Exterior body wash', 'Rinse', 'Drying', 'Wheel cleaning', 'Rim cleaning', 'Tyre cleaning', 'Exterior windows', 'Basic dirt removal', 'Basic mud removal', 'Tyre shine', 'Rim deep cleaning', 'Bug removal', 'Mud removal', 'Tar removal', 'Exterior polish', 'Wax', 'Engine bay cleaning', 'Full body wash', 'Wheels', 'Rims', 'Tyres', 'Door jambs', 'Basic exterior detailing', 'Detailed exterior wash', 'Wheel deep cleaning', 'Tyre treatment', 'Door-jamb cleaning', 'Tar/contaminant removal', 'Exterior glass cleaning', 'Paint cleaning', 'Exterior finishing', 'Polishing'];
const CAR_INTERIOR = ['Full vacuum', 'Seats', 'Carpets', 'Floor mats', 'Dashboard', 'Centre console', 'Door panels', 'Interior windows', 'Interior surfaces', 'Boot / trunk', 'Basic stain cleaning', 'Dust removal', 'Seat stain removal', 'Carpet stain removal', 'Pet hair removal', 'Boot/trunk cleaning', 'Child-seat area cleaning', 'Odour treatment', 'Deep mat cleaning', 'Deep vacuuming', 'Deep seat cleaning', 'Carpet cleaning', 'Floor mat deep cleaning', 'Dashboard detailing', 'Centre-console detailing', 'Door-panel detailing', 'Air-vent cleaning', 'Crevice cleaning', 'Boot/trunk deep cleaning', 'Stain treatment', 'Odour treatment', 'Pet-hair removal', 'Detailed interior glass cleaning'];
const CAR_DEEP = ['Seat stain removal', 'Carpet stain removal', 'Pet hair removal', 'Boot/trunk cleaning', 'Child-seat area cleaning', 'Odour treatment', 'Deep mat cleaning', 'Tyre shine', 'Rim cleaning', 'Wax', 'Seats', 'Carpets', 'Floor mats', 'Dashboard', 'Door panels', 'Boot/trunk', 'Windows', 'Wheels/rims', 'Paintwork', 'Engine bay', 'Engine bay cleaning'];
const positiveCount = (value: unknown): number | undefined => Number.isFinite(Number(value)) && Number(value) > 0
  ? Math.min(10000, Number(value))
  : undefined;

/** Return the quote-relevant job scope while omitting customer and exact-address data. */
export function toCleanerBookingSummary(job: Json) {
  const source = job.checklist && typeof job.checklist === 'object' && !Array.isArray(job.checklist)
    ? job.checklist as Json
    : {};
  const selections = source.selections && typeof source.selections === 'object' && !Array.isArray(source.selections) ? source.selections as Json : {};
  const choices = source.choices && typeof source.choices === 'object' && !Array.isArray(source.choices) ? source.choices as Json : {};
  const category = job.category === 'CAR' ? 'CAR' : 'HOUSE';
  const conditionValue = String(source.condition ?? choices.condition ?? '').trim().toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
  const condition = category === 'HOUSE'
    ? ({ LIGHT: 'LIGHT', MODERATE: 'MODERATE', NORMAL: 'MODERATE', NORMAL_MODERATE: 'MODERATE', HEAVY: 'HEAVY', VERY_HEAVY: 'HEAVY' } as Record<string, string>)[conditionValue]
    : ({ CLEAN: 'CLEAN', LIGHT: 'CLEAN', LIGHT_DIRT: 'CLEAN', AVERAGE: 'AVERAGE', NORMAL: 'AVERAGE', NORMAL_DIRT: 'AVERAGE', MODERATE: 'AVERAGE', VERY_DIRTY: 'VERY_DIRTY', HEAVY: 'VERY_DIRTY', HEAVY_DIRT: 'VERY_DIRTY', SEVERE: 'VERY_DIRTY' } as Record<string, string>)[conditionValue];
  const packageIds = safeStrings(source.cleaningTypes, category === 'HOUSE' ? Object.keys(HOUSE_SERVICES) : Object.keys(CAR_SERVICES));
  const selected = (direct: unknown, key: string, allowed: readonly string[]) => safeStrings([
    ...(Array.isArray(direct) ? direct : []),
    ...(Array.isArray(selections[key]) ? selections[key] as unknown[] : []),
  ], allowed);
  const checklist: Json = category === 'HOUSE'
    ? {
        category,
        areas: [...new Set([...selected(source.areas, 'areas', HOUSE_AREAS), ...safeStrings(selections.rooms, HOUSE_AREAS), ...safeStrings(selections.parts, HOUSE_PARTS)])],
        cleaningTypes: packageIds.map(id => HOUSE_SERVICES[id]),
        condition,
        addOns: selected(source.addOns, 'additions', HOUSE_ADD_ONS),
        attentionServices: Object.entries(HOUSE_ATTENTION).flatMap(([area, allowed]) => safeStrings(selections[`attention:${area}`], allowed).map(item => `${area}: ${item}`)).slice(0, 12),
        propertyType: safeStrings([choices.propertyType], ['Apartment', 'House', 'Townhouse', 'Other'])[0],
        propertySize: safeStrings([choices.propertySize], ['Under 50 m²', '50–100 m²', '101–150 m²', '151–200 m²', '201–300 m²', '301–500 m²', '500+ m²'])[0],
        areaSize: safeStrings([choices.areaSize], ['Under 10 m²', '10–20 m²', '21–30 m²', '31–50 m²', '51–75 m²', '76–100 m²', '100+ m²'])[0],
        bedrooms: safeStrings([choices.bedrooms], ['Studio', '1', '2', '3', '4', '5+'])[0],
        bathrooms: safeStrings([choices.bathrooms], ['1', '2', '3', '4+'])[0],
        propertySizeSqm: positiveCount(source.propertySizeSqm),
        storiesCount: positiveCount(source.storiesCount),
        roomsCount: positiveCount(source.roomsCount),
        bathroomsCount: positiveCount(source.bathroomsCount),
      }
    : {
        category,
        vehicleType: safeStrings([source.vehicleType ?? choices.vehicleType], CAR_TYPES)[0] ?? '',
        vehicleSize: safeStrings([choices.vehicleSize], ['Small', 'Medium', 'Large', 'Extra Large'])[0],
        seats: safeStrings([choices.seats], ['2', '4', '5', '6', '7+'])[0],
        cleaningTypes: packageIds.map(id => CAR_SERVICES[id]),
        condition,
        exteriorServices: selected(source.exteriorServices, 'exterior', CAR_EXTERIOR).concat(selected(undefined, 'included', CAR_EXTERIOR)).slice(0, 12),
        interiorServices: selected(source.interiorServices, 'interior', CAR_INTERIOR),
        deepServices: [...new Set([
          ...selected(source.deepServices, 'deep', CAR_DEEP),
          ...selected(undefined, 'deepInterior', CAR_INTERIOR),
          ...selected(undefined, 'deepExterior', CAR_EXTERIOR),
          ...safeStrings(selections.attention, CAR_DEEP),
        ])].slice(0, 12),
      };
  const location = job.location && typeof job.location === 'object' && !Array.isArray(job.location)
    ? job.location as Json
    : {};
  const lat = Number(location.lat), lng = Number(location.lng);
  return {
    id: job.id,
    customerId: '',
    category,
    serviceType: safeText(job.servicetype, 120),
    checklist,
    description: '',
    location: {
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? Math.round(lat * 100) / 100 : 0,
      lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? Math.round(lng * 100) / 100 : 0,
      address: 'Approximate area',
    },
    scheduledTime: job.scheduledtime,
    timePreference: job.timepreference,
    scheduledDateTime: job.scheduleddatetime,
    bookingMode: job.bookingmode,
    budget: job.budget,
    biddingExpiresAt: job.biddingexpiresat,
    estimatedDuration: job.estimatedduration,
    suppliesRequired: job.suppliesrequired,
    suppliesFee: job.suppliesfee,
    createdAt: job.createdat,
    status: job.status,
    photos: [],
    completionPhotos: [],
  };
}
