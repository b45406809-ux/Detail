// Customer booking catalogs. Each multi-select group has its own Select All state.
import type { HouseCondition, CarCondition } from '../types';

export const SERVICE_PACKAGES = {
  HOUSE: [
    { id: 'BASIC_HOUSE', label: 'Basic House Clean', price: '$10', description: 'A basic clean for everyday household maintenance.' },
    { id: 'SPECIFIC_ROOM', label: 'Specific Room / Part', price: '$15', description: 'For a particular room, area or part of the house.' },
    { id: 'STANDARD_HOUSE', label: 'Standard House Clean', price: '$35', description: 'A complete regular house cleaning.' },
    { id: 'DEEP_HOUSE', label: 'Deep House Clean', price: '$80', description: 'Intensive cleaning requiring considerably more work.' },
  ],
  CAR: [
    { id: 'EXTERIOR_WASH', label: 'Exterior Wash', price: '$3', description: 'A thorough exterior wash and dry.' },
    { id: 'FULL_CAR', label: 'Full Car Clean', price: '$12', description: 'Complete interior and exterior cleaning.' },
    { id: 'DEEP_DETAIL', label: 'Deep Detail', price: '$65', description: 'Premium, intensive vehicle cleaning.' },
  ],
} as const;

export const PROPERTY_TYPES = ['Apartment', 'House', 'Townhouse', 'Other'];
export const PROPERTY_SIZES = ['Under 50 m²', '50–100 m²', '101–150 m²', '151–200 m²', '201–300 m²', '301–500 m²', '500+ m²'];
export const BEDROOMS = ['Studio', '1', '2', '3', '4', '5+'];
export const BATHROOMS = ['1', '2', '3', '4+'];
export const HOUSE_TASKS: Record<string, string[]> = {
  BASIC_HOUSE: ['Sweeping', 'Mopping', 'Dusting surfaces', 'General tidying', 'Basic kitchen cleaning', 'Basic bathroom cleaning', 'Basic floor cleaning', 'Cleaning visible dirt and spills', 'Emptying household bins', 'Cobweb removal'],
  STANDARD_HOUSE: ['Sweeping', 'Mopping', 'Dusting', 'General tidying', 'Kitchen cleaning', 'Bathroom cleaning', 'Bedroom cleaning', 'Living room cleaning', 'Dining area cleaning', 'Hallway cleaning', 'Floor cleaning', 'Surface cleaning', 'Mirror cleaning', 'Bin emptying', 'Cobweb removal'],
  DEEP_HOUSE: ['Everything in Standard House Clean', 'Deep kitchen cleaning', 'Deep bathroom cleaning', 'Detailed floor cleaning', 'Detailed dusting', 'Hard-to-reach areas', 'Under accessible furniture', 'Behind accessible furniture', 'Skirting-board cleaning', 'Door cleaning', 'Door-frame cleaning', 'Detailed window cleaning', 'Window-frame cleaning', 'Window-track cleaning', 'Detailed cupboard cleaning', 'Appliance exterior cleaning', 'Wall spot cleaning', 'Detailed surface cleaning', 'Extensive cobweb removal'],
};
export const HOUSE_AREAS = ['Living room', 'Bedrooms', 'Kitchen', 'Dining room', 'Bathrooms', 'Hallways', 'Other'];
export const BASIC_ADDITIONS = ['Interior windows', 'Exterior windows', 'Mirrors', 'Inside cupboards', 'Fridge', 'Oven', 'Microwave', 'Garage', 'Balcony', 'Patio'];
export const STANDARD_AREAS = ['Garage', 'Office', 'Balcony', 'Patio', 'Laundry room', 'Storage room', 'Other'];
export const STANDARD_ADDITIONS = ['Interior windows', 'Exterior windows', 'Oven cleaning', 'Fridge cleaning', 'Microwave cleaning', 'Cupboard cleaning', 'Wall cleaning', 'Carpet cleaning', 'Upholstery cleaning', 'Garage cleaning', 'Balcony/patio cleaning'];
export const ROOM_OPTIONS = ['Bedroom', 'Living room', 'Dining room', 'Kitchen', 'Bathroom', 'Garage', 'Office', 'Laundry room', 'Balcony', 'Patio', 'Other'];
export const ROOM_PARTS = ['Windows', 'Floors', 'Walls', 'Carpets', 'Upholstery', 'Cupboards', 'Appliances', 'Garage', 'Other'];
export const AREA_SIZES = ['Under 10 m²', '10–20 m²', '21–30 m²', '31–50 m²', '51–75 m²', '76–100 m²', '100+ m²'];
export const ROOM_TASKS: Record<string, string[]> = {
  Bedroom: ['Sweep', 'Mop', 'Vacuum', 'Dust surfaces', 'Clean windows', 'Clean mirrors', 'Clean wardrobe/cupboards', 'Clean under accessible furniture', 'Remove cobwebs', 'General tidying'],
  Kitchen: ['Sweep', 'Mop', 'Countertop cleaning', 'Sink cleaning', 'Cabinet cleaning', 'Appliance cleaning', 'Wall cleaning', 'Window cleaning', 'Oven cleaning', 'Fridge cleaning', 'Microwave cleaning', 'Remove grease'],
  Bathroom: ['Floor cleaning', 'Toilet cleaning', 'Shower cleaning', 'Bathtub cleaning', 'Sink cleaning', 'Mirror cleaning', 'Tile cleaning', 'Grout cleaning', 'Cabinet cleaning', 'Window cleaning'],
  Windows: ['Glass', 'Window frames', 'Window tracks', 'Inside windows', 'Outside windows', 'Remove dirt', 'Remove cobwebs'],
};
export const DEEP_HOUSE_ATTENTION: Record<string, string[]> = {
  Kitchen: ['Oven', 'Fridge', 'Microwave', 'Cabinets', 'Countertops', 'Sink', 'Appliances', 'Walls', 'Floor'],
  Bathroom: ['Shower', 'Bathtub', 'Toilet', 'Tiles', 'Grout', 'Mirrors', 'Cabinets', 'Floor'],
  Bedrooms: ['Floors', 'Wardrobes', 'Under furniture', 'Windows', 'Walls', 'Doors'],
  'Living areas': ['Sofas', 'Carpets', 'Curtains', 'Windows', 'Walls', 'Floors'],
};

export const VEHICLE_TYPES = ['Sedan', 'Hatchback', 'Coupe', 'SUV', 'Crossover', 'Pickup / Double Cab', 'Minivan', 'Van', 'Truck', 'Other'];
export const VEHICLE_SIZES = ['Small', 'Medium', 'Large', 'Extra Large'];
export const CAR_EXTERIOR_TASKS = ['Exterior body wash', 'Rinse', 'Drying', 'Wheel cleaning', 'Rim cleaning', 'Tyre cleaning', 'Exterior windows', 'Basic dirt removal', 'Basic mud removal'];
export const CAR_EXTERIOR_ADDITIONS = ['Tyre shine', 'Rim deep cleaning', 'Bug removal', 'Mud removal', 'Tar removal', 'Exterior polish', 'Wax', 'Engine bay cleaning'];
export const FULL_CAR_EXTERIOR = ['Full body wash', 'Rinse', 'Drying', 'Wheels', 'Rims', 'Tyres', 'Exterior windows', 'Door jambs', 'Basic exterior detailing'];
export const FULL_CAR_INTERIOR = ['Full vacuum', 'Seats', 'Carpets', 'Floor mats', 'Dashboard', 'Centre console', 'Door panels', 'Interior windows', 'Interior surfaces', 'Boot / trunk', 'Basic stain cleaning', 'Dust removal'];
export const FULL_CAR_ADDITIONS = ['Seat stain removal', 'Carpet stain removal', 'Pet hair removal', 'Boot/trunk cleaning', 'Child-seat area cleaning', 'Odour treatment', 'Deep mat cleaning', 'Tyre shine', 'Rim cleaning', 'Wax'];
export const DEEP_CAR_INTERIOR = ['Deep vacuuming', 'Deep seat cleaning', 'Carpet cleaning', 'Floor mat deep cleaning', 'Dashboard detailing', 'Centre-console detailing', 'Door-panel detailing', 'Air-vent cleaning', 'Crevice cleaning', 'Boot/trunk deep cleaning', 'Stain treatment', 'Odour treatment', 'Pet-hair removal', 'Detailed interior glass cleaning'];
export const DEEP_CAR_EXTERIOR = ['Detailed exterior wash', 'Wheel deep cleaning', 'Rim deep cleaning', 'Tyre cleaning', 'Tyre treatment', 'Door-jamb cleaning', 'Bug removal', 'Tar/contaminant removal', 'Exterior glass cleaning', 'Paint cleaning', 'Exterior finishing', 'Polishing'];
export const DEEP_CAR_ATTENTION = ['Seats', 'Carpets', 'Floor mats', 'Dashboard', 'Door panels', 'Boot/trunk', 'Windows', 'Wheels/rims', 'Paintwork', 'Engine bay'];
export const CAR_SEATS = ['2', '4', '5', '6', '7+'];

export const HOUSE_CONDITIONS: { id: HouseCondition; label: string }[] = [
  { id: 'LIGHT', label: 'Light' }, { id: 'MODERATE', label: 'Normal / Moderate' }, { id: 'HEAVY', label: 'Heavy' },
];
export const CAR_CONDITIONS: { id: CarCondition; label: string }[] = [
  { id: 'CLEAN', label: 'Light dirt' }, { id: 'AVERAGE', label: 'Normal dirt' }, { id: 'VERY_DIRTY', label: 'Heavy / very dirty' },
];
export const TIME_OPTIONS = [
  { id: 'ASAP', label: 'ASAP', sub: 'Within the hour' },
  { id: 'TODAY', label: 'Today', sub: 'Later today' },
  { id: 'TOMORROW', label: 'Tomorrow', sub: 'Schedule for tomorrow' },
  { id: 'CUSTOM', label: 'Pick Date', sub: 'Choose a specific date' },
] as const;
