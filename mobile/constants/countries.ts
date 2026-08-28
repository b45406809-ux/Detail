import { getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';

export interface Country {
  name: string;
  code: CountryCode;
  dialCode: string;
  flag: string;
  placeholder?: string;
}

// Convert 2-letter ISO country code into emoji flag safely
export function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Country display names using standard Intl.DisplayNames where available with fallback
const regionNames =
  typeof Intl !== 'undefined' && Intl.DisplayNames
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function getCountryName(code: string): string {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

// Dynamically generate standard countries list from libphonenumber-js metadata
const libCountries: CountryCode[] = getCountries();

export const COUNTRIES: Country[] = libCountries
  .map((code) => {
    try {
      const dialCode = `+${getCountryCallingCode(code)}`;
      const name = getCountryName(code);
      const flag = getFlagEmoji(code);
      return {
        name,
        code,
        dialCode,
        flag,
      };
    } catch {
      return null;
    }
  })
  .filter((c): c is Country => c !== null)
  .sort((a, b) => {
    // Prioritize popular African and global corridors at the top, followed by alphabetical
    const priority = ['ZW', 'ZA', 'BW', 'ZM', 'MZ', 'GB', 'US', 'AU', 'CA', 'KE', 'NG'];
    const indexA = priority.indexOf(a.code);
    const indexB = priority.indexOf(b.code);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.code === 'ZW') || {
    name: 'Zimbabwe',
    code: 'ZW' as CountryCode,
    dialCode: '+263',
    flag: '🇿🇼',
  };
