// Detail brand tokens — mirrors tailwind.config.js so non-NativeWind code
// (SVGs, map markers, native StyleSheet, status bar colors) stays in sync
// with the exact color sampled from the logo (RGB 57,6,209 → #3906D2).
export const colors = {
  brand: {
    50: '#F0EDFE',
    100: '#DDD5FD',
    200: '#BCAAFB',
    300: '#9580F7',
    400: '#7357F2',
    500: '#3906D2',
    600: '#2F05B0',
    700: '#27049C',
    800: '#1E0378',
    900: '#150256',
  },
  ink: '#0F0B2E',
  bgDark: '#0D0A24',
  cardDark: '#17133A',
  borderDark: '#2A2456',
  success: '#0FB77A',
  warning: '#F5A524',
  danger: '#E5484D',
  white: '#FFFFFF',
} as const;

export const gradients = {
  brand: [colors.brand[500], colors.brand[700]] as const,
  brandGlow: [colors.brand[400], colors.brand[600]] as const,
  dusk: ['#150256', '#3906D2'] as const,
};

/** Service verticals Detail supports — used across booking, matching, and profiles. */
export const SERVICE_CATEGORIES = {
  HOUSE: { id: 'HOUSE', label: 'House Cleaning', icon: 'home' as const },
  CAR: { id: 'CAR', label: 'Car Cleaning', icon: 'car' as const },
} as const;

export type ServiceCategoryId = keyof typeof SERVICE_CATEGORIES;
