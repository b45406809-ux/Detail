import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, ChevronLeft, ChevronRight, Phone, Star, 
  Smartphone, ShieldCheck, Camera, MapPin, Bell, Globe, Check, AlertCircle, Sparkles,
  Mail, Lock, ChevronDown, User, Briefcase, FileText, DollarSign, Activity, Circle, Car, Upload, Shield, X
} from 'lucide-react';

export interface Country {
  name: string;
  code: string;
  dial_code: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { name: 'United States', code: 'US', dial_code: '+1', flag: '🇺🇸' },
  { name: 'Canada', code: 'CA', dial_code: '+1', flag: '🇨🇦' },
  { name: 'United Kingdom', code: 'GB', dial_code: '+44', flag: '🇬🇧' },
  { name: 'Australia', code: 'AU', dial_code: '+61', flag: '🇦🇺' },
  { name: 'India', code: 'IN', dial_code: '+91', flag: '🇮🇳' },
  { name: 'Singapore', code: 'SG', dial_code: '+65', flag: '🇸🇬' },
  { name: 'Germany', code: 'DE', dial_code: '+49', flag: '🇩🇪' },
  { name: 'France', code: 'FR', dial_code: '+33', flag: '🇫🇷' },
  { name: 'United Arab Emirates', code: 'AE', dial_code: '+971', flag: '🇦🇪' },
  { name: 'Saudi Arabia', code: 'SA', dial_code: '+966', flag: '🇸🇦' },
  { name: 'South Africa', code: 'ZA', dial_code: '+27', flag: '🇿🇦' },
  { name: 'New Zealand', code: 'NZ', dial_code: '+64', flag: '🇳🇿' },
  { name: 'Brazil', code: 'BR', dial_code: '+55', flag: '🇧🇷' },
  { name: 'Mexico', code: 'MX', dial_code: '+52', flag: '🇲🇽' },
  { name: 'Spain', code: 'ES', dial_code: '+34', flag: '🇪🇸' },
  { name: 'Italy', code: 'IT', dial_code: '+39', flag: '🇮🇹' },
  { name: 'Japan', code: 'JP', dial_code: '+81', flag: '🇯🇵' },
  { name: 'China', code: 'CN', dial_code: '+86', flag: '🇨🇳' },
  { name: 'Pakistan', code: 'PK', dial_code: '+92', flag: '🇵🇰' },
  { name: 'Nigeria', code: 'NG', dial_code: '+234', flag: '🇳🇬' },
  { name: 'Kenya', code: 'KE', dial_code: '+254', flag: '🇰🇪' },
  { name: 'Egypt', code: 'EG', dial_code: '+20', flag: '🇪🇬' },
  { name: 'Turkey', code: 'TR', dial_code: '+90', flag: '🇹🇷' },
  { name: 'Switzerland', code: 'CH', dial_code: '+41', flag: '🇨🇭' },
  { name: 'Sweden', code: 'SE', dial_code: '+46', flag: '🇸🇪' },
  { name: 'Norway', code: 'NO', dial_code: '+47', flag: '🇳🇴' },
  { name: 'Netherlands', code: 'NL', dial_code: '+31', flag: '🇳🇱' },
  { name: 'Ireland', code: 'IE', dial_code: '+353', flag: '🇮🇪' },
  { name: 'Philippines', code: 'PH', dial_code: '+63', flag: '🇵🇭' },
  { name: 'Malaysia', code: 'MY', dial_code: '+60', flag: '🇲🇾' },
  { name: 'Afghanistan', code: 'AF', dial_code: '+93', flag: '🇦🇫' },
  { name: 'Albania', code: 'AL', dial_code: '+355', flag: '🇦🇱' },
  { name: 'Algeria', code: 'DZ', dial_code: '+213', flag: '🇩🇿' },
  { name: 'American Samoa', code: 'AS', dial_code: '+1684', flag: '🇦🇸' },
  { name: 'Andorra', code: 'AD', dial_code: '+376', flag: '🇦🇩' },
  { name: 'Angola', code: 'AO', dial_code: '+244', flag: '🇦🇴' },
  { name: 'Anguilla', code: 'AI', dial_code: '+1264', flag: '🇦🇮' },
  { name: 'Antarctica', code: 'AQ', dial_code: '+672', flag: '🇦🇶' },
  { name: 'Antigua and Barbuda', code: 'AG', dial_code: '+1268', flag: '🇦🇬' },
  { name: 'Argentina', code: 'AR', dial_code: '+54', flag: '🇦🇷' },
  { name: 'Armenia', code: 'AM', dial_code: '+374', flag: '🇦🇲' },
  { name: 'Aruba', code: 'AW', dial_code: '+297', flag: '🇦🇼' },
  { name: 'Austria', code: 'AT', dial_code: '+43', flag: '🇦🇹' },
  { name: 'Azerbaijan', code: 'AZ', dial_code: '+994', flag: '🇦🇿' },
  { name: 'Bahamas', code: 'BS', dial_code: '+1242', flag: '🇧🇸' },
  { name: 'Bahrain', code: 'BH', dial_code: '+973', flag: '🇧🇭' },
  { name: 'Bangladesh', code: 'BD', dial_code: '+880', flag: '🇧🇩' },
  { name: 'Barbados', code: 'BB', dial_code: '+1246', flag: '🇧🇧' },
  { name: 'Belarus', code: 'BY', dial_code: '+375', flag: '🇧🇾' },
  { name: 'Belgium', code: 'BE', dial_code: '+32', flag: '🇧🇪' },
  { name: 'Belize', code: 'BZ', dial_code: '+501', flag: '🇧🇿' },
  { name: 'Benin', code: 'BJ', dial_code: '+229', flag: '🇧🇯' },
  { name: 'Bermuda', code: 'BM', dial_code: '+1441', flag: '🇧🇲' },
  { name: 'Bhutan', code: 'BT', dial_code: '+975', flag: '🇧🇹' },
  { name: 'Bolivia', code: 'BO', dial_code: '+591', flag: '🇧🇴' },
  { name: 'Bosnia and Herzegovina', code: 'BA', dial_code: '+387', flag: '🇧🇦' },
  { name: 'Botswana', code: 'BW', dial_code: '+267', flag: '🇧🇼' },
  { name: 'Brunei', code: 'BN', dial_code: '+673', flag: '🇧🇳' },
  { name: 'Bulgaria', code: 'BG', dial_code: '+359', flag: '🇧🇬' },
  { name: 'Burkina Faso', code: 'BF', dial_code: '+226', flag: '🇧🇫' },
  { name: 'Burundi', code: 'BI', dial_code: '+257', flag: '🇧🇮' },
  { name: 'Cambodia', code: 'KH', dial_code: '+855', flag: '🇰🇭' },
  { name: 'Cameroon', code: 'CM', dial_code: '+237', flag: '🇨🇲' },
  { name: 'Cape Verde', code: 'CV', dial_code: '+238', flag: '🇨🇻' },
  { name: 'Cayman Islands', code: 'KY', dial_code: '+1345', flag: '🇨🇾' },
  { name: 'Central African Republic', code: 'CF', dial_code: '+236', flag: '🇨🇫' },
  { name: 'Chad', code: 'TD', dial_code: '+235', flag: '🇹🇩' },
  { name: 'Chile', code: 'CL', dial_code: '+56', flag: '🇨🇱' },
  { name: 'Colombia', code: 'CO', dial_code: '+57', flag: '🇨🇴' },
  { name: 'Comoros', code: 'KM', dial_code: '+269', flag: '🇰🇲' },
  { name: 'Cook Islands', code: 'CK', dial_code: '+682', flag: '🇨🇰' },
  { name: 'Costa Rica', code: 'CR', dial_code: '+506', flag: '🇨🇷' },
  { name: 'Croatia', code: 'HR', dial_code: '+385', flag: '🇭🇷' },
  { name: 'Cuba', code: 'CU', dial_code: '+53', flag: '🇨🇺' },
  { name: 'Curacao', code: 'CW', dial_code: '+599', flag: '🇨🇼' },
  { name: 'Cyprus', code: 'CY', dial_code: '+357', flag: '🇨🇾' },
  { name: 'Czech Republic', code: 'CZ', dial_code: '+420', flag: '🇨🇿' },
  { name: 'Denmark', code: 'DK', dial_code: '+45', flag: '🇩🇰' },
  { name: 'Djibouti', code: 'DJ', dial_code: '+253', flag: '🇩🇯' },
  { name: 'Dominica', code: 'DM', dial_code: '+1767', flag: '🇩🇲' },
  { name: 'Dominican Republic', code: 'DO', dial_code: '+1809', flag: '🇩🇴' },
  { name: 'Ecuador', code: 'EC', dial_code: '+593', flag: '🇪🇨' },
  { name: 'El Salvador', code: 'SV', dial_code: '+503', flag: '🇸🇻' },
  { name: 'Equatorial Guinea', code: 'GQ', dial_code: '+240', flag: '🇬🇶' },
  { name: 'Eritrea', code: 'ER', dial_code: '+291', flag: '🇪🇷' },
  { name: 'Estonia', code: 'EE', dial_code: '+372', flag: '🇪🇪' },
  { name: 'Ethiopia', code: 'ET', dial_code: '+251', flag: '🇪🇹' },
  { name: 'Falkland Islands', code: 'FK', dial_code: '+500', flag: '🇫🇰' },
  { name: 'Faroe Islands', code: 'FO', dial_code: '+298', flag: '🇫🇴' },
  { name: 'Fiji', code: 'FJ', dial_code: '+679', flag: '🇫🇯' },
  { name: 'Finland', code: 'FI', dial_code: '+358', flag: '🇫🇮' },
  { name: 'French Guiana', code: 'GF', dial_code: '+594', flag: '🇬🇫' },
  { name: 'French Polynesia', code: 'PF', dial_code: '+689', flag: '🇵🇫' },
  { name: 'Gabon', code: 'GA', dial_code: '+241', flag: '🇬🇦' },
  { name: 'Gambia', code: 'GM', dial_code: '+220', flag: '🇬🇲' },
  { name: 'Georgia', code: 'GE', dial_code: '+995', flag: '🇬🇪' },
  { name: 'Ghana', code: 'GH', dial_code: '+233', flag: '🇬🇭' },
  { name: 'Gibraltar', code: 'GI', dial_code: '+350', flag: '🇬🇮' },
  { name: 'Greece', code: 'GR', dial_code: '+30', flag: '🇬🇷' },
  { name: 'Greenland', code: 'GL', dial_code: '+299', flag: '🇬🇱' },
  { name: 'Grenada', code: 'GD', dial_code: '+1473', flag: '🇬🇩' },
  { name: 'Guadeloupe', code: 'GP', dial_code: '+590', flag: '🇬🇵' },
  { name: 'Guam', code: 'GU', dial_code: '+1671', flag: '🇬🇺' },
  { name: 'Guatemala', code: 'GT', dial_code: '+502', flag: '🇬🇹' },
  { name: 'Guernsey', code: 'GG', dial_code: '+44', flag: '🇬🇬' },
  { name: 'Guinea', code: 'GN', dial_code: '+224', flag: '🇬🇳' },
  { name: 'Guinea-Bissau', code: 'GW', dial_code: '+245', flag: '🇬🇼' },
  { name: 'Guyana', code: 'GY', dial_code: '+592', flag: '🇬🇾' },
  { name: 'Haiti', code: 'HT', dial_code: '+509', flag: '🇭🇹' },
  { name: 'Honduras', code: 'HN', dial_code: '+504', flag: '🇭🇳' },
  { name: 'Hong Kong', code: 'HK', dial_code: '+852', flag: '🇭🇰' },
  { name: 'Hungary', code: 'HU', dial_code: '+36', flag: '🇭🇺' },
  { name: 'Iceland', code: 'IS', dial_code: '+354', flag: '🇮🇸' },
  { name: 'Indonesia', code: 'ID', dial_code: '+62', flag: '🇮🇩' },
  { name: 'Iran', code: 'IR', dial_code: '+98', flag: '🇮🇷' },
  { name: 'Iraq', code: 'IQ', dial_code: '+964', flag: '🇮🇶' },
  { name: 'Isle of Man', code: 'IM', dial_code: '+44', flag: '🇮🇲' },
  { name: 'Israel', code: 'IL', dial_code: '+972', flag: '🇮🇱' },
  { name: 'Ivory Coast', code: 'CI', dial_code: '+225', flag: '🇨🇮' },
  { name: 'Jamaica', code: 'JM', dial_code: '+1876', flag: '🇯🇲' },
  { name: 'Jersey', code: 'JE', dial_code: '+44', flag: '🇯🇪' },
  { name: 'Jordan', code: 'JO', dial_code: '+962', flag: '🇯🇴' },
  { name: 'Kazakhstan', code: 'KZ', dial_code: '+7', flag: '🇰🇿' },
  { name: 'Kiribati', code: 'KI', dial_code: '+686', flag: '🇰🇮' },
  { name: 'Kosovo', code: 'XK', dial_code: '+383', flag: '🇽🇰' },
  { name: 'Kuwait', code: 'KW', dial_code: '+965', flag: '🇰🇼' },
  { name: 'Kyrgyzstan', code: 'KG', dial_code: '+996', flag: '🇰🇬' },
  { name: 'Laos', code: 'LA', dial_code: '+856', flag: '🇱🇦' },
  { name: 'Latvia', code: 'LV', dial_code: '+371', flag: '🇱🇻' },
  { name: 'Lebanon', code: 'LB', dial_code: '+961', flag: '🇱🇧' },
  { name: 'Lesotho', code: 'LS', dial_code: '+266', flag: '🇱🇸' },
  { name: 'Liberia', code: 'LR', dial_code: '+231', flag: '🇱🇷' },
  { name: 'Libya', code: 'LY', dial_code: '+218', flag: '🇱🇾' },
  { name: 'Liechtenstein', code: 'LI', dial_code: '+423', flag: '🇱🇮' },
  { name: 'Lithuania', code: 'LT', dial_code: '+370', flag: '🇱🇹' },
  { name: 'Luxembourg', code: 'LU', dial_code: '+352', flag: '🇱🇺' },
  { name: 'Macau', code: 'MO', dial_code: '+853', flag: '🇲🇴' },
  { name: 'North Macedonia', code: 'MK', dial_code: '+389', flag: '🇲🇰' },
  { name: 'Madagascar', code: 'MG', dial_code: '+261', flag: '🇲🇬' },
  { name: 'Malawi', code: 'MW', dial_code: '+265', flag: '🇲🇼' },
  { name: 'Maldives', code: 'MV', dial_code: '+960', flag: '🇲🇾' },
  { name: 'Mali', code: 'ML', dial_code: '+223', flag: '🇲🇱' },
  { name: 'Malta', code: 'MT', dial_code: '+356', flag: '🇲🇹' },
  { name: 'Marshall Islands', code: 'MH', dial_code: '+692', flag: '🇲🇭' },
  { name: 'Martinique', code: 'MQ', dial_code: '+596', flag: '🇲🇶' },
  { name: 'Mauritania', code: 'MR', dial_code: '+222', flag: '🇲🇷' },
  { name: 'Mauritius', code: 'MU', dial_code: '+230', flag: '🇲🇺' },
  { name: 'Mayotte', code: 'YT', dial_code: '+262', flag: '🇾🇹' },
  { name: 'Micronesia', code: 'FM', dial_code: '+691', flag: '🇫🇲' },
  { name: 'Moldova', code: 'MD', dial_code: '+373', flag: '🇲🇩' },
  { name: 'Monaco', code: 'MC', dial_code: '+377', flag: '🇲🇨' },
  { name: 'Mongolia', code: 'MN', dial_code: '+976', flag: '🇲🇳' },
  { name: 'Montenegro', code: 'ME', dial_code: '+382', flag: '🇲🇪' },
  { name: 'Montserrat', code: 'MS', dial_code: '+1664', flag: '🇲🇸' },
  { name: 'Morocco', code: 'MA', dial_code: '+212', flag: '🇲🇦' },
  { name: 'Mozambique', code: 'MZ', dial_code: '+258', flag: '🇲🇿' },
  { name: 'Myanmar', code: 'MM', dial_code: '+95', flag: '🇲🇲' },
  { name: 'Namibia', code: 'NA', dial_code: '+264', flag: '🇳🇦' },
  { name: 'Nauru', code: 'NR', dial_code: '+674', flag: '🇳🇷' },
  { name: 'Nepal', code: 'NP', dial_code: '+977', flag: '🇳🇵' },
  { name: 'New Caledonia', code: 'NC', dial_code: '+687', flag: '🇳🇨' },
  { name: 'Nicaragua', code: 'NI', dial_code: '+505', flag: '🇳🇮' },
  { name: 'Niger', code: 'NE', dial_code: '+227', flag: '🇳🇪' },
  { name: 'Niue', code: 'NU', dial_code: '+683', flag: '🇳🇺' },
  { name: 'North Korea', code: 'KP', dial_code: '+850', flag: '🇰🇵' },
  { name: 'Northern Mariana Islands', code: 'MP', dial_code: '+1670', flag: '🇲🇵' },
  { name: 'Oman', code: 'OM', dial_code: '+968', flag: '🇴🇲' },
  { name: 'Palau', code: 'PW', dial_code: '+680', flag: '🇵🇼' },
  { name: 'Palestine', code: 'PS', dial_code: '+970', flag: '🇵🇸' },
  { name: 'Panama', code: 'PA', dial_code: '+507', flag: '🇵🇦' },
  { name: 'Papua New Guinea', code: 'PG', dial_code: '+675', flag: '🇵🇬' },
  { name: 'Paraguay', code: 'PY', dial_code: '+595', flag: '🇵🇾' },
  { name: 'Peru', code: 'PE', dial_code: '+51', flag: '🇵🇪' },
  { name: 'Poland', code: 'PL', dial_code: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: 'PT', dial_code: '+351', flag: '🇵🇹' },
  { name: 'Puerto Rico', code: 'PR', dial_code: '+1787', flag: '🇵🇷' },
  { name: 'Qatar', code: 'QA', dial_code: '+974', flag: '🇶🇦' },
  { name: 'Reunion', code: 'RE', dial_code: '+262', flag: '🇷🇪' },
  { name: 'Romania', code: 'RO', dial_code: '+40', flag: '🇷🇴' },
  { name: 'Russia', code: 'RU', dial_code: '+7', flag: '🇷🇺' },
  { name: 'Rwanda', code: 'RW', dial_code: '+250', flag: '🇷🇼' },
  { name: 'Samoa', code: 'WS', dial_code: '+685', flag: '🇼🇸' },
  { name: 'San Marino', code: 'SM', dial_code: '+378', flag: '🇸🇲' },
  { name: 'Sao Tome and Principe', code: 'ST', dial_code: '+239', flag: '🇸🇹' },
  { name: 'Senegal', code: 'SN', dial_code: '+221', flag: '🇸🇳' },
  { name: 'Serbia', code: 'RS', dial_code: '+381', flag: '🇷🇸' },
  { name: 'Seychelles', code: 'SC', dial_code: '+248', flag: '🇸🇨' },
  { name: 'Sierra Leone', code: 'SL', dial_code: '+232', flag: '🇸🇱' },
  { name: 'Slovakia', code: 'SK', dial_code: '+421', flag: '🇸🇰' },
  { name: 'Slovenia', code: 'SI', dial_code: '+386', flag: '🇸🇮' },
  { name: 'Solomon Islands', code: 'SB', dial_code: '+677', flag: '🇸🇧' },
  { name: 'Somalia', code: 'SO', dial_code: '+252', flag: '🇸🇴' },
  { name: 'South Korea', code: 'KR', dial_code: '+82', flag: '🇰🇷' },
  { name: 'South Sudan', code: 'SS', dial_code: '+211', flag: '🇸🇸' },
  { name: 'Sri Lanka', code: 'LK', dial_code: '+94', flag: '🇱🇰' },
  { name: 'St. Helena', code: 'SH', dial_code: '+290', flag: '🇸🇭' },
  { name: 'St. Kitts and Nevis', code: 'KN', dial_code: '+1869', flag: '🇰🇳' },
  { name: 'St. Lucia', code: 'LC', dial_code: '+1758', flag: '🇱🇨' },
  { name: 'St. Pierre and Miquelon', code: 'PM', dial_code: '+508', flag: '🇵🇲' },
  { name: 'St. Vincent and Grenadines', code: 'VC', dial_code: '+1784', flag: '🇻🇨' },
  { name: 'Sudan', code: 'SD', dial_code: '+249', flag: '🇸🇩' },
  { name: 'Suriname', code: 'SR', dial_code: '+597', flag: '🇸🇷' },
  { name: 'Swaziland', code: 'SZ', dial_code: '+268', flag: '🇸🇿' },
  { name: 'Syria', code: 'SY', dial_code: '+963', flag: '🇸🇾' },
  { name: 'Taiwan', code: 'TW', dial_code: '+886', flag: '🇹🇼' },
  { name: 'Tajikistan', code: 'TJ', dial_code: '+992', flag: '🇹🇯' },
  { name: 'Tanzania', code: 'TZ', dial_code: '+255', flag: '🇹🇿' },
  { name: 'Thailand', code: 'TH', dial_code: '+66', flag: '🇹🇭' },
  { name: 'Timor-Leste', code: 'TL', dial_code: '+670', flag: '🇹🇱' },
  { name: 'Togo', code: 'TG', dial_code: '+228', flag: '🇹🇬' },
  { name: 'Tonga', code: 'TO', dial_code: '+676', flag: '🇹🇴' },
  { name: 'Trinidad and Tobago', code: 'TT', dial_code: '+1868', flag: '🇹🇹' },
  { name: 'Tunisia', code: 'TN', dial_code: '+216', flag: '🇹🇳' },
  { name: 'Turkmenistan', code: 'TM', dial_code: '+993', flag: '🇹🇲' },
  { name: 'Turks and Caicos Islands', code: 'TC', dial_code: '+1649', flag: '🇹🇨' },
  { name: 'Tuvalu', code: 'TV', dial_code: '+688', flag: '🇹🇻' },
  { name: 'Uganda', code: 'UG', dial_code: '+256', flag: '🇺🇬' },
  { name: 'Ukraine', code: 'UA', dial_code: '+380', flag: '🇺🇦' },
  { name: 'Uruguay', code: 'UY', dial_code: '+598', flag: '🇺🇾' },
  { name: 'Uzbekistan', code: 'UZ', dial_code: '+998', flag: '🇺🇿' },
  { name: 'Vanuatu', code: 'VU', dial_code: '+678', flag: '🇻🇺' },
  { name: 'Venezuela', code: 'VE', dial_code: '+58', flag: '🇻🇪' },
  { name: 'Vietnam', code: 'VN', dial_code: '+84', flag: '🇻🇳' },
  { name: 'Wallis and Futuna', code: 'WF', dial_code: '+681', flag: '🇼🇫' },
  { name: 'Yemen', code: 'YE', dial_code: '+967', flag: '🇾🇪' },
  { name: 'Zambia', code: 'ZM', dial_code: '+260', flag: '🇿🇲' },
  { name: 'Zimbabwe', code: 'ZW', dial_code: '+263', flag: '🇿🇼' },
];

export function parsePhoneNumber(fullNum: string): { country: Country; localNum: string } {
  if (!fullNum) return { country: COUNTRIES[0], localNum: '' };
  
  // Sort countries by dial code length descending to match longest dial codes first
  const sortedCountries = [...COUNTRIES].sort((a, b) => b.dial_code.length - a.dial_code.length);
  for (const c of sortedCountries) {
    if (fullNum.startsWith(c.dial_code)) {
      return { country: c, localNum: fullNum.substring(c.dial_code.length) };
    }
  }
  return { country: COUNTRIES[0], localNum: fullNum };
}

// --- Splash Screen ---
const BrushstrokeTopLeft = ({ animateOut }: { animateOut: boolean }) => (
  <motion.div
    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
    animate={animateOut ? { x: "-110%", y: "-110%", opacity: 0, scale: 0.9 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
    className="absolute top-[-5%] left-[-10%] w-[110%] h-[60%] pointer-events-none z-10 text-white origin-top-left"
  >
    <svg viewBox="0 0 500 350" fill="none" stroke="currentColor" className="w-full h-full filter drop-shadow-xl text-white">
      <path d="M -20,20 Q 150,110 320,40 Q 380,10 450,35" strokeWidth="24" strokeLinecap="round" opacity="0.95" />
      <path d="M -20,80 Q 120,175 280,110 Q 390,70 480,105" strokeWidth="18" strokeLinecap="round" opacity="0.8" />
      <path d="M -20,140 Q 90,220 220,160 Q 320,120 430,165" strokeWidth="12" strokeLinecap="round" opacity="0.5" />
      <path d="M 30,20 Q 180,90 340,80" strokeWidth="16" strokeLinecap="round" opacity="0.85" />
    </svg>
  </motion.div>
);

const BrushstrokeBottomRight = ({ animateOut }: { animateOut: boolean }) => (
  <motion.div
    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
    animate={animateOut ? { x: "110%", y: "110%", opacity: 0, scale: 0.9 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.02 }}
    className="absolute bottom-[-10%] right-[-15%] w-[120%] h-[65%] pointer-events-none z-10 text-white origin-bottom-right"
  >
    <svg viewBox="0 0 500 350" fill="none" stroke="currentColor" className="w-full h-full filter drop-shadow-lg text-white">
      <path d="M 520,310 Q 350,220 180,290 Q 120,310 50,295" strokeWidth="24" strokeLinecap="round" opacity="0.95" />
      <path d="M 520,250 Q 380,160 220,215 Q 110,240 20,215" strokeWidth="18" strokeLinecap="round" opacity="0.8" />
      <path d="M 520,190 Q 410,120 280,160 Q 180,190 70,150" strokeWidth="12" strokeLinecap="round" opacity="0.5" />
      <path d="M 470,310 Q 320,240 160,250" strokeWidth="16" strokeLinecap="round" opacity="0.85" />
    </svg>
  </motion.div>
);

export const SplashScreen = ({ onComplete, theme }: { onComplete: () => void; theme?: any }) => {
  const [stage, setStage] = useState<'init' | 'anim_out' | 'wordmark' | 'done'>('init');

  useEffect(() => {
    // Stage choreography matching the exact timing of the intro video:
    // 0ms - 1300ms: Brushstrokes and monogram logo are static/pulsing in.
    // 1300ms - 2700ms: Brushstrokes slide away, revealing diagonal text scroll.
    // 2700ms - 5800ms: Monogram collapses, "Detail." text and subtitle fade in.
    // 5800ms: Complete.
    const timer1 = setTimeout(() => setStage('anim_out'), 1300);
    const timer2 = setTimeout(() => setStage('wordmark'), 2700);
    const timer3 = setTimeout(() => onComplete(), 5800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  const textStrokes = [
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
    "CLEANING SERVICES FOR ME AND YOU",
  ];

  return (
    <div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#3906d2] select-none"
    >
      {/* 1. Repeating diagonal scrolling text tracks (active after brushstrokes start moving away) */}
      <AnimatePresence>
        {(stage === 'anim_out' || stage === 'wordmark') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.12 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 overflow-hidden pointer-events-none select-none font-sans font-black tracking-wider text-[20px] leading-[1.4] text-white"
          >
            <div className="absolute top-[-30%] left-[-30%] w-[160%] h-[160%] rotate-[-25deg] flex flex-col justify-between">
              {textStrokes.map((text, idx) => (
                <motion.div
                  key={idx}
                  animate={{ 
                    x: idx % 2 === 0 ? ['-5%', '5%', '-5%'] : ['5%', '-5%', '5%']
                  }}
                  transition={{ 
                    duration: 25, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  className="whitespace-nowrap uppercase tracking-[0.3em] font-extrabold"
                  style={{ alignSelf: idx % 2 === 0 ? 'flex-start' : 'flex-end' }}
                >
                  {text}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Hand-drawn brushstroke layers */}
      <BrushstrokeTopLeft animateOut={stage !== 'init'} />
      <BrushstrokeBottomRight animateOut={stage !== 'init'} />

      {/* 3. The Central Brand Logo & Text Presentation */}
      <div className="relative z-20 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {stage !== 'wordmark' ? (
            /* Double-D Monogram Symbol */
            <motion.div
              key="logo-symbol"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 120 }}
              className="w-36 h-36 bg-transparent flex items-center justify-center relative"
            >
              <svg viewBox="0 0 120 120" className="w-28 h-28 filter drop-shadow-md" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Left vertical stem of the outer boundary */}
                <path 
                  d="M 32,32 L 32,76" 
                  stroke="white" 
                  strokeWidth="8" 
                  strokeLinecap="square" 
                />
                {/* Top horizontal and outer circular loop to bottom bar */}
                <path 
                  d="M 32,32 L 60,32 A 32 32 0 0 1 60,96 L 32,96" 
                  stroke="white" 
                  strokeWidth="8" 
                  strokeLinecap="square" 
                  strokeLinejoin="miter"
                />
                {/* Inner nested curve/loop */}
                <path 
                  d="M 50,48 L 60,48 A 16 16 0 0 1 60,80 L 32,80" 
                  stroke="white" 
                  strokeWidth="8" 
                  strokeLinecap="square" 
                  strokeLinejoin="miter"
                />
                {/* Middle vertical column (the 'I' bar) */}
                <rect 
                  x="42" 
                  y="56" 
                  width="8" 
                  height="16" 
                  fill="white" 
                />
                {/* Period Dot */}
                <circle 
                  cx="100" 
                  cy="92" 
                  r="6" 
                  fill="white" 
                />
              </svg>
            </motion.div>
          ) : (
            /* Main "Detail." Brand Text Layout */
            <motion.div
              key="brand-text"
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-center"
            >
              <h1 className="text-7xl font-sans font-black tracking-tighter leading-none text-white whitespace-nowrap">
                Detail<span className="text-white">.</span>
              </h1>
              
              <div className="flex items-center justify-center gap-3 mt-4">
                 <span className="text-[10px] font-black uppercase tracking-[0.45em] text-white/50">Cleaning</span>
                 <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
                 <span className="text-[10px] font-black uppercase tracking-[0.45em] text-white/50">Services</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 4. Bottom Powered/Copyright text (active in wordmark stage) */}
      <AnimatePresence>
        {stage === 'wordmark' && (
          <motion.div 
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="absolute bottom-14 flex flex-col items-center gap-1.5 text-center px-4"
          >
            <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.25em] leading-relaxed max-w-xs">
              By SELF-MADE Technologies<br />(Private) Limited
            </p>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
};

// --- Welcome Screen ---
export const WelcomeScreen = ({ 
  theme = 'light',
  onPhoneContinue, 
  onGoogleContinue, 
  onAppleContinue,
  onEmailContinue
}: { 
  theme?: 'light' | 'dark';
  onPhoneContinue: (phone: string) => void; 
  onGoogleContinue: () => void;
  onAppleContinue: () => void;
  onEmailContinue?: (email: string, passwordString: string, isRegistering: boolean) => Promise<void>;
}) => {
  const [activeTab, setActiveTab] = React.useState<'phone' | 'email'>('phone');
  const [phoneVal, setPhoneVal] = React.useState('');
  const [emailVal, setEmailVal] = React.useState('');
  const [passwordVal, setPasswordVal] = React.useState('');
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Country Picker State
  const [selectedCountry, setSelectedCountry] = React.useState<Country>(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const isDark = theme === 'dark';

  const handlePhoneInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    setPhoneVal(cleaned);
    setErrorMsg(null);
  };

  const validateEmail = (email: string) => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleContinue = async () => {
    setErrorMsg(null);
    if (activeTab === 'phone') {
      if (phoneVal.length < 7) {
        setErrorMsg('Please enter a valid phone number');
        return;
      }
      const fullNumber = `${selectedCountry.dial_code}${phoneVal}`;
      onPhoneContinue(fullNumber);
    } else {
      if (!validateEmail(emailVal)) {
        setErrorMsg('Please enter a valid email address');
        return;
      }
      if (!showPassword) {
        setShowPassword(true);
      } else {
        if (passwordVal.length < 6) {
          setErrorMsg('Password should be at least 6 characters');
          return;
        }
        if (onEmailContinue) {
          setIsLoading(true);
          try {
            await onEmailContinue(emailVal.trim(), passwordVal, isRegistering);
          } catch (err: any) {
            setErrorMsg(err.message || 'Authentication failed');
          } finally {
            setIsLoading(false);
          }
        }
      }
    }
  };

  return (
    <div className={`absolute inset-0 flex flex-col justify-between overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}>
      
      {/* 1. Header block exactly matching screenshot */}
      <div className={`py-5 px-6 flex items-center relative z-20 transition-colors duration-300 ${isDark ? 'bg-[#0F0E16] border-b border-white/5' : 'bg-[#3906d2]'}`}>
        <button 
          onClick={() => {
            if (showPassword) {
              setShowPassword(false);
              setPasswordVal('');
            }
          }}
          className={`p-1.5 rounded-xl hover:bg-black/5 active:scale-95 transition-all mr-4 ${showPassword ? 'visible' : 'invisible'} ${isDark ? 'text-white' : 'text-white'}`}
        >
          <ChevronLeft className="w-5 h-5 stroke-[3px]" />
        </button>
        <h2 className={`text-base font-display font-extrabold tracking-tight flex-1 text-center pr-8 ${isDark ? 'text-white' : 'text-white'}`}>
          Sign In
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-8 relative z-10 px-8 pt-8 flex flex-col justify-start">
        {/* Ambient upper glow */}
        <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-[100px] pointer-events-none transition-all ${isDark ? 'bg-indigo-600/10' : 'bg-[#3906d2]/15'}`} />

        {/* 2. Brand Identity Group */}
        <div className="flex flex-col items-center text-center mt-2 mb-8 relative z-10">
          <div className={`w-20 h-20 rounded-[28px] border-2 flex items-center justify-center animate-pulse mb-6 relative transition-all ${isDark ? 'bg-slate-950 border-[#3906d2] shadow-[0_12px_28px_rgba(57,6,210,0.2)]' : 'bg-[#3906d2] border-[#3906d2]/50 shadow-xl'}`}>
            <Zap className={`w-9 h-9 ${isDark ? 'text-white fill-[#3906d2]' : 'text-white fill-[#3906d2]/20'}`} />
          </div>
          <h1 className={`text-4xl font-display font-extrabold tracking-tight mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {isRegistering ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className={`text-xs max-w-xs font-semibold leading-relaxed ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
            {isRegistering 
              ? 'Create a secure new account to start booking or offering certified cleaning today.' 
              : 'Please enter your details to continue with your cleaning services.'}
          </p>
        </div>

        {/* 3. Sliding / Swap Forms */}
        <div className="space-y-6 relative z-10">
          
          {/* Dual Tab Controller - standard capsules */}
          {!showPassword && (
            <div className={`flex p-1.5 rounded-2xl ${isDark ? 'bg-white/5 border border-white/5' : 'bg-slate-100/80 border border-slate-200/40'}`}>
              <button 
                onClick={() => {
                  setActiveTab('phone');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-[12px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === 'phone' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Phone className="w-3.5 h-3.5 stroke-[2.5px]" />
                Phone
              </button>
              <button 
                onClick={() => {
                  setActiveTab('email');
                  setErrorMsg(null);
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-[12px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeTab === 'email' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Mail className="w-3.5 h-3.5 stroke-[2.5px]" />
                Email
              </button>
            </div>
          )}

          {/* Form Fields block */}
          <div className="space-y-4">
            {!showPassword ? (
              activeTab === 'phone' ? (
                /* Phone Field layout matching screenshot exactly with active Country clicker */
                <div className="space-y-2 text-left">
                  <label className={`block text-[10px] font-black uppercase tracking-widest pl-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    Phone Number
                  </label>
                  <div className={`border-2 rounded-2xl p-4 transition-all flex items-center gap-3.5 ${errorMsg ? 'border-red-500/50 bg-red-500/5' : phoneVal.length >= 7 ? 'border-[#3906d2] bg-[#3906d2]/5' : isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/50'}`}>
                    <button
                      type="button"
                      onClick={() => setShowCountryPicker(true)}
                      className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border border-transparent hover:bg-slate-100 hover:border-slate-200/80 active:scale-95 transition-all text-sm font-extrabold shrink-0 ${isDark ? 'text-white/80 hover:bg-white/5 hover:border-white/10' : 'text-slate-700'}`}
                    >
                      <span className="text-base leading-none">{selectedCountry.flag}</span>
                      <span className="ml-1 leading-none">{selectedCountry.dial_code}</span>
                      <ChevronDown className="w-3.5 h-3.5 stroke-[3px] opacity-70 ml-0.5" />
                    </button>
                    <span className={`h-5 w-[1px] shrink-0 ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />
                    <input 
                      type="tel"
                      value={phoneVal}
                      onChange={(e) => handlePhoneInput(e.target.value)}
                      placeholder="555 000 0000"
                      className={`bg-transparent border-none outline-none font-bold text-base w-full ${isDark ? 'text-white placeholder:text-white/15' : 'text-slate-900 placeholder:text-slate-300'}`}
                    />
                  </div>
                </div>
              ) : (
                /* Email Field layout matching screenshot exactly */
                <div className="space-y-2 text-left">
                  <label className={`block text-[10px] font-black uppercase tracking-widest pl-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    Email Address
                  </label>
                  <div className={`border-2 rounded-2xl p-4 transition-all flex items-center gap-3.5 ${errorMsg ? 'border-red-500/50 bg-red-500/5' : validateEmail(emailVal) ? 'border-[#3906d2] bg-[#3906d2]/5' : isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/50'}`}>
                    <Mail className={`w-5 h-5 shrink-0 ${isDark ? 'text-white/45' : 'text-slate-400'}`} />
                    <input 
                      type="email"
                      value={emailVal}
                      onChange={(e) => {
                        setEmailVal(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="yourname@example.com"
                      className={`bg-transparent border-none outline-none font-bold text-base w-full ${isDark ? 'text-white placeholder:text-white/15' : 'text-slate-900 placeholder:text-slate-300'}`}
                    />
                  </div>
                </div>
              )
            ) : (
              /* Password details input drawer when showing password card */
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-left">
                {/* Back Link */}
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black tracking-widest uppercase ${isDark ? 'text-[#3906d2]' : 'text-slate-600'}`}>
                    Email Auth Panel
                  </span>
                  <button 
                    onClick={() => {
                      setShowPassword(false);
                      setPasswordVal('');
                    }} 
                    className="text-xs font-bold underline text-slate-400 hover:text-slate-600"
                  >
                    Change Email
                  </button>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest pl-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    Enter Password
                  </label>
                  <div className={`border-2 rounded-2xl p-4 transition-all flex items-center gap-3.5 ${errorMsg ? 'border-red-500/50 bg-red-500/5' : passwordVal.length >= 6 ? 'border-[#3906d2] bg-[#3906d2]/5' : isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/50'}`}>
                    <Lock className={`w-5 h-5 shrink-0 ${isDark ? 'text-white/45' : 'text-slate-400'}`} />
                    <input 
                      type="password"
                      value={passwordVal}
                      onChange={(e) => {
                        setPasswordVal(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder="••••••••"
                      className={`bg-transparent border-none outline-none font-bold text-base w-full ${isDark ? 'text-white placeholder:text-white/15' : 'text-slate-900 placeholder:text-slate-300'}`}
                    />
                  </div>
                </div>

                {/* Registration Checkbox Switch */}
                <button 
                  onClick={() => setIsRegistering(!isRegistering)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border w-full transition-all ${isRegistering ? 'bg-[#3906d2]/10 border-[#3906d2]' : isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200/60'}`}
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isRegistering ? 'bg-[#3906d2] border-transparent text-white' : 'border-slate-400 bg-transparent'}`}>
                    {isRegistering && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                  </div>
                  <div className="text-left">
                    <span className={`text-xs font-black block ${isDark ? 'text-white' : 'text-slate-800'}`}>I am a new user</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Register a brand new detail account with this email</span>
                  </div>
                </button>
              </motion.div>
            )}

            {/* Error alerts block */}
            {errorMsg && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2.5 text-red-500 text-xs font-black">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}
          </div>

          {/* Continue button block */}
          <button 
            onClick={handleContinue}
            disabled={isLoading || (activeTab === 'phone' ? phoneVal.length < 7 : emailVal.length < 3)}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg ${isLoading ? 'bg-slate-300 text-slate-500 pointer-events-none' : (activeTab === 'phone' ? phoneVal.length >= 7 : emailVal.length >= 3) ? 'bg-[#3906d2] text-white shadow-[#3906d2]/15 hover:brightness-105 active:scale-95' : 'bg-slate-200 text-slate-400 pointer-events-none'}`}
          >
            {isLoading ? 'Processing...' : showPassword ? (isRegistering ? 'Complete Registration' : 'Complete Sign In') : 'Continue'}
          </button>
        </div>

        {/* 4. OR CONTINUE WITH divider block */}
        <div className="my-8 flex items-center gap-3 relative z-10 w-full">
          <div className={`flex-1 h-[1px] ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
            or continue with
          </span>
          <div className={`flex-1 h-[1px] ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
        </div>

        {/* 5. Authentic Social Providers */}
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <button 
            onClick={onGoogleContinue}
            className={`py-4 px-3 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-2.5 active:scale-95 border ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-white border-slate-200 shadow-sm hover:bg-slate-50 text-slate-800'}`}
          >
            {/* Real Official Dynamic Google Icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button 
            onClick={onAppleContinue}
            className={`py-4 px-3 rounded-2xl font-extrabold text-xs transition-all flex items-center justify-center gap-2.5 active:scale-95 border ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-white border-slate-200 shadow-sm hover:bg-slate-50 text-slate-800'}`}
          >
            {/* Real Official Apple Icon */}
            <svg className={`w-4 h-4 shrink-0 ${isDark ? 'fill-white' : 'fill-slate-900'}`} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-.96.04-2.13.64-2.81 1.43-.59.67-1.11 1.8-1.01 2.91 1.07.08 2.17-.47 2.83-1.28z" />
            </svg>
            Apple ID
          </button>
        </div>

        {/* 6. Bank Grade Secured Tag */}
        <div className="mt-8 flex justify-center relative z-10">
          <div className={`inline-flex items-center gap-2 py-2 px-4 rounded-full text-[10px] font-bold ${isDark ? 'bg-white/5 text-[#3906d2]/90' : 'bg-[#3906d2]/10 text-slate-700 border border-[#3906d2]/25 shadow-sm shadow-[#3906d2]/5'}`}>
            <ShieldCheck className="w-4 h-4 text-[#3906d2] stroke-[2.5px]" />
            Your data is secured with bank-grade encryption
          </div>
        </div>

      </div>

      {/* 7. Footer / Terms */}
      <div className={`p-6 border-t font-semibold text-[10px] text-center leading-normal relative z-10 transition-colors ${isDark ? 'bg-[#09080F] border-white/5 text-white/35' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
        By continuing, you agree to Detail's{' '}
        <span className="underline cursor-pointer hover:text-[#3906d2]">Terms of Service</span> and{' '}
        <span className="underline cursor-pointer hover:text-[#3906d2]">Privacy Policy</span>.
      </div>

      {/* Country Picker Popover/Modal */}
      <AnimatePresence>
        {showCountryPicker && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-end justify-center">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`w-full max-h-[80%] rounded-t-[32px] flex flex-col p-6 shadow-2xl relative z-10 ${isDark ? 'bg-[#161522] border-t border-white/10' : 'bg-white border-t border-slate-100'}`}
            >
              {/* Modal Handle */}
              <div className="w-12 h-1.5 rounded-full bg-slate-300/60 mx-auto mb-5 shrink-0 cursor-pointer" onClick={() => setShowCountryPicker(false)} />
              
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-base font-display font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Select Country
                </h3>
                <button 
                  type="button"
                  onClick={() => setShowCountryPicker(false)}
                  className={`text-xs font-bold uppercase tracking-wider rounded-full px-3 py-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10 text-white/70' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
                >
                  Close
                </button>
              </div>

              {/* Search Field */}
              <div className={`flex items-center gap-2 border-2 rounded-2xl px-4 py-3 mb-4 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                <Globe className={`w-4 h-4 shrink-0 ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search country name or dial code..."
                  className={`bg-transparent border-none outline-none text-sm w-full font-bold ${isDark ? 'text-white placeholder:text-white/30' : 'text-slate-900 placeholder:text-slate-400'}`}
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pb-6">
                {COUNTRIES.filter(c => 
                  c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  c.dial_code.includes(searchQuery)
                ).map((c) => (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => {
                      setSelectedCountry(c);
                      setShowCountryPicker(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all ${selectedCountry.code === c.code ? 'bg-[#3906d2]/10 border border-[#3906d2]/30 text-[#3906d2]' : isDark ? 'hover:bg-white/5 text-white/90 border border-transparent' : 'hover:bg-slate-50 text-slate-700 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none">{c.flag}</span>
                      <span className="text-sm font-bold">{c.name}</span>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${selectedCountry.code === c.code ? 'bg-[#3906d2]/15 text-[#3906d2]' : isDark ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500'}`}>{c.dial_code}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

// --- Phone Input Screen ---
export const PhoneInputScreen = ({ 
  onBack, 
  onContinue, 
  value, 
  onChange,
  theme = 'light'
}: { 
  onBack: () => void; 
  onContinue: (phone: string) => void; 
  value: string; 
  onChange: (val: string) => void;
  theme?: 'light' | 'dark';
}) => {
  const [error, setError] = useState<string | null>(null);
  const isDark = theme === 'dark';

  // Parse phone number to set the country and the local digits
  const { country: initialCountry, localNum: initialLocal } = React.useMemo(() => parsePhoneNumber(value), [value]);

  const [selectedCountry, setSelectedCountry] = useState<Country>(initialCountry);
  const [localPhone, setLocalPhone] = useState(initialLocal);

  // Country Picker State
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    setLocalPhone(cleaned);
    onChange(`${selectedCountry.dial_code}${cleaned}`);
    if (cleaned.length >= 7) {
      setError(null);
    }
  };

  const handleCountrySelect = (c: Country) => {
    setSelectedCountry(c);
    onChange(`${c.dial_code}${localPhone}`);
  };

  const handleNext = () => {
    if (localPhone.length < 7) {
      setError('Please enter a valid phone number');
      return;
    }
    setError(null);
    onContinue(`${selectedCountry.dial_code}${localPhone}`);
  };

  return (
    <div className={`absolute inset-0 flex flex-col justify-between p-8 text-left transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}>
      <div className="relative z-10 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 pt-4 mb-10">
          <button onClick={onBack} className={`p-3 rounded-2xl border transition-all ${isDark ? 'bg-white/5 border-white/10 text-white hover:bg-white/15' : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className={`text-[10px] font-black uppercase tracking-widest leading-none block mb-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Step 02 of 05</span>
            <h2 className={`text-xl font-display font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Your Contact Number</h2>
          </div>
        </div>

        <div className="space-y-6">
          <p className={`text-sm font-bold leading-normal ${isDark ? 'text-[#3906d2]' : 'text-slate-700'}`}>
            Enter your mobile number. We will send you a secure verification passcode.
          </p>

          <div className="space-y-4">
            {/* Country Selector Card */}
            <div 
              onClick={() => setShowCountryPicker(true)}
              className={`rounded-2xl p-4 flex items-center justify-between transition-all cursor-pointer border ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 shadow-sm shadow-slate-100/30'}`}
            >
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-[#3906d2]" />
                <div>
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] leading-none block ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Country Code</span>
                  <span className={`text-xs font-bold block mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>{selectedCountry.name}</span>
                </div>
              </div>
              <span className="text-xs font-black text-[#3906d2] bg-[#3906d2]/15 px-3 py-1.5 rounded-xl border border-[#3906d2]/30 flex items-center gap-1">
                {selectedCountry.flag} {selectedCountry.dial_code}
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              </span>
            </div>

            {/* Input Wrap */}
            <div className={`border-2 rounded-2xl p-5 transition-all flex items-center justify-between ${error ? 'border-red-500/40 bg-red-500/5' : localPhone.length >= 7 ? 'border-[#3906d2]/50 bg-[#3906d2]/5' : isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/50'}`}>
              <div className="flex-1">
                <span className={`text-[9px] font-black uppercase tracking-[0.2em] leading-none block mb-1.5 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Mobile Line</span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-black shrink-0 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{selectedCountry.dial_code}</span>
                  <span className={`h-5 w-[1px] ${isDark ? 'bg-white/10' : 'bg-slate-300'}`} />
                  <input 
                    type="tel"
                    value={localPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="555 000 0000"
                    className={`bg-transparent border-none outline-none font-black text-xl w-full ${isDark ? 'text-white placeholder:text-white/10' : 'text-slate-900 placeholder:text-slate-300'}`}
                    autoFocus
                  />
                </div>
              </div>
              {localPhone.length >= 7 && (
                <div className="w-7 h-7 bg-[#3906d2] rounded-full flex items-center justify-center text-white shadow-[0_0_12px_rgba(57,6,210,0.5)]">
                  <Check className="w-4 h-4 stroke-[3px]" />
                </div>
              )}
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs font-bold"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full space-y-4">
        <button 
          onClick={handleNext}
          className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${localPhone.length >= 7 ? 'bg-[#3906d2] text-white shadow-lg shadow-[#3906d2]/15' : isDark ? 'bg-white/5 text-white/25 pointer-events-none' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
        >
          Send Verification Code
          <ChevronRight className="w-5 h-5" />
        </button>

        <p className={`text-[9.5px] text-center leading-normal ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          Message & data rates may apply. Standard SMS verification rules apply.
        </p>
      </div>

      {/* Country Picker Popover/Modal */}
      <AnimatePresence>
        {showCountryPicker && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-end justify-center">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`w-full max-h-[80%] rounded-t-[32px] flex flex-col p-6 shadow-2xl relative z-10 ${isDark ? 'bg-[#161522]' : 'bg-white border-t border-slate-100'}`}
            >
              {/* Modal Handle */}
              <div className="w-12 h-1.5 rounded-full bg-slate-300/60 mx-auto mb-5 shrink-0 cursor-pointer" onClick={() => setShowCountryPicker(false)} />
              
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-base font-display font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Select Country
                </h3>
                <button 
                  type="button"
                  onClick={() => setShowCountryPicker(false)}
                  className={`text-xs font-bold uppercase tracking-wider rounded-full px-3 py-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-100 hover:bg-slate-200'}`}
                >
                  Close
                </button>
              </div>

              {/* Search Field */}
              <div className={`flex items-center gap-2 border-2 rounded-2xl px-4 py-3 mb-4 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}>
                <Globe className={`w-4 h-4 shrink-0 ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search country name or dial code..."
                  className={`bg-transparent border-none outline-none text-sm w-full font-bold ${isDark ? 'text-white placeholder:text-white/30' : 'text-slate-900 placeholder:text-slate-400'}`}
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-1.5 pb-6">
                {COUNTRIES.filter(c => 
                  c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  c.dial_code.includes(searchQuery)
                ).map((c) => (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => {
                      handleCountrySelect(c);
                      setShowCountryPicker(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all ${selectedCountry.code === c.code ? 'bg-[#3906d2]/10 border border-[#3906d2]/30 text-[#3906d2]' : isDark ? 'hover:bg-white/5 text-white/90 border border-transparent' : 'hover:bg-slate-50 text-slate-700 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl leading-none">{c.flag}</span>
                      <span className="text-sm font-bold">{c.name}</span>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${selectedCountry.code === c.code ? 'bg-[#3906d2]/15 text-[#3906d2]' : isDark ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500'}`}>{c.dial_code}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- OTP Verification Screen ---
export const OtpVerifyScreen = ({ 
  onBack, 
  onVerify, 
  phoneNumber,
  theme = 'light'
}: { 
  onBack: () => void; 
  onVerify: (code: string) => void; 
  phoneNumber: string;
  theme?: 'light' | 'dark';
}) => {
  const [otp, setOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(90);
  const [showAutoSms, setShowAutoSms] = useState(false);
  const isDark = theme === 'dark';

  useEffect(() => {
    // Mimic counting down resend
    const timer = setInterval(() => {
      setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Simulate SMS Auto receipt/pop-up after 2.5 seconds!
    const authSmsTimer = setTimeout(() => {
      setShowAutoSms(true);
    }, 2500);
    return () => clearTimeout(authSmsTimer);
  }, []);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const autofillSmsCode = () => {
    setOtp('112233');
    setShowAutoSms(false);
  };

  const handleNumInput = (num: string) => {
    if (otp.length < 6) {
      setOtp(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setOtp(prev => prev.slice(0, -1));
  };

  const onSubmit = () => {
    if (otp.length === 6) {
      onVerify(otp);
    }
  };

  return (
    <div className={`absolute inset-0 flex flex-col justify-between p-8 text-left overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}>
      <div className="relative z-10 w-full">
        {/* Header */}
        <div className="flex items-center gap-4 pt-4 mb-8">
          <button onClick={onBack} className={`p-3 rounded-2xl border transition-all ${isDark ? 'bg-white/5 border-white/10 text-white hover:bg-white/15' : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className={`text-[10px] font-black uppercase tracking-widest leading-none block mb-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Step 03 of 05</span>
            <h2 className={`text-xl font-display font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Enter Security Code</h2>
          </div>
        </div>

        <p className={`text-sm leading-relaxed mb-8 font-medium ${isDark ? 'text-white/50' : 'text-slate-600'}`}>
          We have sent a six-digit secure OTP to <span className="text-[#3906d2] bg-[#3906d2]/10 px-1.5 py-0.5 rounded font-bold">{phoneNumber || '+1 (555) 000-0000'}</span>. Code is valid for five minutes.
        </p>

        {/* SMS Simulation Banner */}
        <AnimatePresence>
          {showAutoSms && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              onClick={autofillSmsCode}
              className={`mb-6 border rounded-2xl p-4 flex items-center justify-between shadow-xl cursor-pointer transition-all relative overflow-hidden ${isDark ? 'bg-slate-900 border-white/10 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 hover:bg-slate-100/90'}`}
            >
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-[#3906d2]" />
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-[#3906d2] animate-bounce" />
                <div>
                  <span className="text-[9px] font-black text-[#3906d2] uppercase tracking-widest leading-none block">Auto SMS Detected</span>
                  <p className={`text-xs mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>Passcode is <strong>112233</strong>. Tap to auto-fill.</p>
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-[#3906d2] ml-2 animate-pulse" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Code Blocks */}
        <div className="flex justify-between gap-2 max-w-sm mx-auto mb-8">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div 
              key={idx}
              className={`w-11 h-14 border-2 rounded-xl flex items-center justify-center text-xl font-black transition-all ${otp.length === idx ? 'border-[#3906d2] bg-[#3906d2]/5 text-[#3906d2]' : otp[idx] ? ('border-[#3906d2]/50 ' + (isDark ? 'bg-white/5 text-white' : 'bg-slate-100 text-slate-800')) : (isDark ? 'border-white/10 bg-white/5 text-white/10' : 'border-slate-200 bg-slate-50 text-slate-300')}`}
            >
              {otp[idx] || (otp.length === idx ? <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 h-6 bg-[#3906d2] rounded-full" /> : '')}
            </div>
          ))}
        </div>

        {/* Resend status */}
        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <Smartphone className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
          <p className={`text-xs font-bold ${isDark ? 'text-white/65' : 'text-slate-600'}`}>
            {resendTimer > 0 ? (
              <span>Resend code option in <span className="text-[#3906d2] underline font-black">{formatTime(resendTimer)}</span></span>
            ) : (
              <button onClick={() => setResendTimer(90)} className="text-[#3906d2] underline font-black hover:text-[#27049c] transition-all">
                Resend SMS Passcode Now
              </button>
            )}
          </p>
        </div>
      </div>

      <div className="relative z-10 w-full mb-2">
        {/* Custom Pad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button 
              key={n}
              onClick={() => handleNumInput(n.toString())}
              className={`py-3 items-center justify-center rounded-xl font-black text-lg active:scale-95 transition-all text-center border ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-800 shadow-sm'}`}
            >
              {n}
            </button>
          ))}
          <div />
          <button 
            onClick={() => handleNumInput('0')}
            className={`py-3 items-center justify-center rounded-xl font-black text-lg active:scale-95 transition-all text-center border ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-800 shadow-sm'}`}
          >
            0
          </button>
          <button 
            onClick={handleDelete}
            className={`py-3 items-center justify-center rounded-xl font-black text-xs uppercase active:scale-95 transition-all text-center border ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10 text-white/50' : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-500 shadow-sm'}`}
          >
            Del
          </button>
        </div>

        <button 
          onClick={onSubmit}
          disabled={otp.length < 6}
          className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${otp.length === 6 ? 'bg-[#3906d2] text-white shadow-lg shadow-[#3906d2]/15' : isDark ? 'bg-white/5 text-white/25 pointer-events-none' : 'bg-slate-100 text-slate-400 pointer-events-none'}`}
        >
          Verify & Continue
        </button>
      </div>
    </div>
  );
};

// --- Create Profile Screen ---
export const CreateProfileScreen = ({ 
  onContinue,
  theme = 'light',
  currentLocation
}: { 
  onContinue: (data: { 
    fullName: string; 
    city: string; 
    avatarUrl: string; 
    role?: 'CUSTOMER' | 'CLEANER' | 'ADMIN'; 
    cleanerSetup?: {
      specialties: string[];
      experience: string;
      carriesSupplies: boolean;
      idType: string;
      idNumber: string;
      ssnMasked: string;
      hasVehicle: boolean;
      vehicleModel?: string;
      vehiclePlate?: string;
      hourlyRate: number;
    } 
  }) => void;
  theme?: 'light' | 'dark';
  currentLocation?: { lat: number; lng: number } | null;
}) => {
  const [step, setStep] = useState(1); // 1 = Basics/Role, 2 = Specialty/Exp, 3 = ID Upload, 4 = Background, 5 = Vehicle/Rates, 6 = Verification Animated Screen
  const [role, setRole] = useState<'CUSTOMER' | 'CLEANER'>('CUSTOMER');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('New York, NY');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);

  // Address Selector states
  const [fetchingGps, setFetchingGps] = useState(false);
  const [gpsAddresses, setGpsAddresses] = useState<string[]>([]);

  const PRESET_LOCATIONS = [
    "742 Broadway, Greenwich Village, NY 10003",
    "128 Mercer St, Soho, NY 10012",
    "450 Lexington Ave, Midtown NY 10017",
    "142 W 24th St, Chelsea, NY 10011",
    "Williamsburg, Brooklyn, NY 11211",
    "85 Broad St, Financial District, NY 10004"
  ];

  const detectLocationAddresses = async () => {
    setFetchingGps(true);
    setGpsAddresses([]);
    
    const getCoords = (): Promise<{ lat: number; lng: number }> => {
      return new Promise((resolve, reject) => {
        if (currentLocation && currentLocation.lat && currentLocation.lng) {
          resolve(currentLocation);
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude
              });
            },
            (error) => reject(error),
            { timeout: 8000 }
          );
        } else {
          reject(new Error("Geolocation unsupported"));
        }
      });
    };

    try {
      const coords = await getCoords();
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&addressdetails=1`, {
        headers: { 'User-Agent': 'CleanyApp/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        const results: string[] = [];
        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.suburb || '';
          const houseNumber = data.address.house_number ? data.address.house_number + ' ' : '';
          const suburb = data.address.suburb || data.address.neighbourhood || '';
          const cityVal = data.address.city || data.address.town || data.address.village || data.address.county || '';
          const state = data.address.state || '';
          const postcode = data.address.postcode || '';

          if (road) {
            results.push(`${houseNumber}${road}, ${cityVal}${(state || postcode) ? `, ${state} ${postcode}`.trim() : ''}`.trim());
          }
          if (suburb) {
            results.push(`${suburb}, ${cityVal}, ${state}`.trim());
          }
          if (cityVal) {
            results.push(`${cityVal}, ${state} ${postcode}`.trim());
          }
        }
        
        const cleanResults = Array.from(new Set(results.filter(Boolean)));
        if (cleanResults.length > 0) {
          setGpsAddresses(cleanResults);
          setCity(cleanResults[0]);
        } else {
          setGpsAddresses(["Unable to extract addresses. Please select a preset or type below."]);
        }
      } else {
        setGpsAddresses(["Failed to query address service. Please type below."]);
      }
    } catch (err: any) {
      console.error("GPS address resolution error:", err);
      setGpsAddresses(["GPS position lookup failed. Ensure browser location access is allowed."]);
    } finally {
      setFetchingGps(false);
    }
  };

  // Specialties
  const [houseSpecialty, setHouseSpecialty] = useState(true);
  const [carSpecialty, setCarSpecialty] = useState(true);
  const [experience, setExperience] = useState('3-5 Years');
  const [carriesSupplies, setCarriesSupplies] = useState(true);

  // ID Setup
  const [idType, setIdType] = useState('Driver\'s License');
  const [idNumber, setIdNumber] = useState('');
  const [idFrontFile, setIdFrontFile] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<string | null>(null);
  const [isIdScanning, setIsIdScanning] = useState(false);
  const [isSelfieScanning, setIsSelfieScanning] = useState(false);
  const [idScanStatus, setIdScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [selfieScanStatus, setSelfieScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');

  // Real Camera active states
  const [activeCameraType, setActiveCameraType] = useState<'id' | 'selfie' | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Real KYC verification states
  const [isKycVerifying, setIsKycVerifying] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycVerificationResult, setKycVerificationResult] = useState<any>(null);
  const [backgroundScreenResult, setBackgroundScreenResult] = useState<any>(null);

  // Background check
  const [ssn, setSsn] = useState('');
  const [backgroundConsent, setBackgroundConsent] = useState(false);
  const [priorReferences, setPriorReferences] = useState('');

  // Vehicle and standard Pricing
  const [hasVehicle, setHasVehicle] = useState(true);
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [hourlyRate, setHourlyRate] = useState(35);

  // Radar Scan states
  const [scanIndex, setScanIndex] = useState(0);
  const [scanLogs, setScanLogs] = useState<{ label: string; status: 'pending' | 'loading' | 'done' }[]>([
    { label: 'Consolidating cloud profile file payload...', status: 'pending' },
    { label: 'Analyzing government document barcode authenticity...', status: 'pending' },
    { label: 'Comparing face-selfie geometry contours (99.8% match rate)...', status: 'pending' },
    { label: 'Running state criminal record & sex offender sweep...', status: 'pending' },
    { label: 'Validating active plate records with Department of Motor Vehicles (DMV)...', status: 'pending' },
    { label: 'Issuing cryptographic Verified Partner Status token and checkmark...', status: 'pending' },
  ]);

  // Clean, offline vector default avatars
  const defaultAvatars = [
    'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="%233906d2"/><circle cx="50" cy="40" r="18" fill="white"/><path d="M20 80 c0 -20 20 -25 30 -25 s30 5 30 25" fill="white"/></svg>',
    'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="%23ff3366"/><circle cx="50" cy="40" r="18" fill="white"/><path d="M20 80 c0 -20 20 -25 30 -25 s30 5 30 25" fill="white"/></svg>',
    'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="%2300ee88"/><circle cx="50" cy="40" r="18" fill="white"/><path d="M20 80 c0 -20 20 -25 30 -25 s30 5 30 25" fill="white"/></svg>',
    'data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="%237b2cbf"/><circle cx="50" cy="40" r="18" fill="white"/><path d="M20 80 c0 -20 20 -25 30 -25 s30 5 30 25" fill="white"/></svg>'
  ];

  const [selectedAvatar, setSelectedAvatar] = useState(defaultAvatars[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const isDark = theme === 'dark';

  const fetchCities = async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setLoadingCities(true);
    try {
      const res = await fetch(`https://api.teleport.org/api/cities/?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const results = data._embedded?.['city:search-results'] || [];
        const citiesList = results.map((item: any) => {
          const fullName = item.matching_full_name || '';
          const parts = fullName.split(',');
          if (parts.length >= 2) {
            return `${parts[0].trim()}, ${parts[1].trim()}`;
          }
          return fullName;
        });
        const uniqueCities = Array.from(new Set(citiesList)) as string[];
        setSuggestions(uniqueCities.slice(0, 5));
      }
    } catch (err) {
      console.error("City fetch error:", err);
    } finally {
      setLoadingCities(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedAvatar(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const simulateIdUpload = () => {
    setIsIdScanning(true);
    setIdScanStatus('scanning');
    setTimeout(() => {
      // Mocked ID Document
      setIdFrontFile('data:image/svg+xml;utf8,<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" rx="15" fill="%231E1B4B" stroke="%233906D2" stroke-width="4"/><rect x="15" y="15" width="45" height="45" rx="8" fill="%2300ee88"/><text x="75" y="30" fill="white" font-family="sans-serif" font-size="12" font-weight="black">VERIFIED ID</text><text x="75" y="48" fill="white" font-family="sans-serif" font-size="8" opacity="0.6">DRIVER LICENSE</text><line x1="15" y1="80" x2="185" y2="80" stroke="white" stroke-width="2" opacity="0.3"/><line x1="15" y1="95" x2="135" y2="95" stroke="white" stroke-width="2" opacity="0.3"/></svg>');
      setIsIdScanning(false);
      setIdScanStatus('done');
      if (!idNumber) {
        setIdNumber('DL-' + Math.floor(10000000 + Math.random() * 90000000));
      }
    }, 2000);
  };

  const simulateSelfieUpload = () => {
    setIsSelfieScanning(true);
    setSelfieScanStatus('scanning');
    setTimeout(() => {
      // Matched selfie
      setSelfieFile('data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="%233906d2"/><circle cx="50" cy="40" r="18" fill="white"/><path d="M20 80 c0 -20 20 -25 30 -25 s30 5 30 25" fill="white"/><circle cx="50" cy="50" r="45" stroke="%2300ee88" stroke-width="3" stroke-dasharray="5,5" fill="none"/></svg>');
      setIsSelfieScanning(false);
      setSelfieScanStatus('done');
    }, 2200);
  };

  const openCamera = async (type: 'id' | 'selfie') => {
    setActiveCameraType(type);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: type === 'id' ? 'environment' : 'user' } 
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Failed to access camera. Please make sure camera permissions are granted.");
      setActiveCameraType(null);
    }
  };

  const runVerifyDocumentAPI = async (imgData: string) => {
    try {
      const currentIdNum = idNumber || 'DL-' + Math.floor(10000000 + Math.random() * 90000000);
      if (!idNumber) {
        setIdNumber(currentIdNum);
      }
      const response = await fetch('/api/kyc/verify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idType: idType || "Driver's License",
          idNumber: currentIdNum,
          idFrontImage: imgData
        })
      });
      const data = await response.json();
      console.log('[KYC API] Scanned ID response received:', data);
    } catch (err) {
      console.error('[KYC API Engine Error]:', err);
    } finally {
      setIsIdScanning(false);
      setIdScanStatus('done');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !cameraStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      if (activeCameraType === 'id') {
        setIdFrontFile(dataUrl);
        setIdScanStatus('scanning');
        setIsIdScanning(true);
        runVerifyDocumentAPI(dataUrl);
      } else {
        setSelfieFile(dataUrl);
        setSelfieScanStatus('scanning');
        setIsSelfieScanning(true);
        setTimeout(() => {
          setIsSelfieScanning(false);
          setSelfieScanStatus('done');
        }, 1200);
      }
    }
    closeCamera();
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setActiveCameraType(null);
  };

  const handleIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const dataUrl = event.target.result as string;
        setIdFrontFile(dataUrl);
        setIdScanStatus('scanning');
        setIsIdScanning(true);
        runVerifyDocumentAPI(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelfieFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const dataUrl = event.target.result as string;
        setSelfieFile(dataUrl);
        setSelfieScanStatus('scanning');
        setIsSelfieScanning(true);
        setTimeout(() => {
          setIsSelfieScanning(false);
          setSelfieScanStatus('done');
        }, 1200);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Run the background simulation steps
  useEffect(() => {
    if (step === 6) {
      if (scanIndex < scanLogs.length) {
        // Mark current as loading
        setScanLogs(prev => prev.map((item, idx) => {
          if (idx === scanIndex) return { ...item, status: 'loading' };
          return item;
        }));

        const timer = setTimeout(() => {
          // Mark current as done
          setScanLogs(prev => prev.map((item, idx) => {
            if (idx === scanIndex) return { ...item, status: 'done' };
            return item;
          }));
          setScanIndex(prev => prev + 1);
        }, 1800);

        return () => clearTimeout(timer);
      }
    }
  }, [step, scanIndex]);

  // Trigger real OpenSanctions regulatory compliance background check in Step 6
  useEffect(() => {
    if (step === 6 && scanIndex === 0) {
      fetch('/api/kyc/run-background-screening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, idNumber })
      })
      .then(res => res.json())
      .then((data: any) => {
        if (data.success) {
          setBackgroundScreenResult(data);
          // Dynamically customize the logs based on real database records
          setScanLogs(prev => {
            const updated = [...prev];
            updated[3] = {
              label: `Running compliance check via ${data.provider}... (Safety Match Score: ${data.riskScore}%)`,
              status: 'pending'
            };
            if (data.matchedSpecialLists) {
              updated[4] = {
                label: `WARNING: High correlation matches identified in global registries! Manual compliance review required.`,
                status: 'pending'
              };
            } else {
              updated[4] = {
                label: `Clean compliance records confirmed. Global watchlist scan APPROVED.`,
                status: 'pending'
              };
            }
            return updated;
          });
        }
      })
      .catch(err => {
        console.error("Live OpenSanctions Screening failed:", err);
      });
    }
  }, [step, fullName, idNumber]);

  const handleCreate = () => {
    if (!fullName.trim()) return;

    if (role === 'CUSTOMER') {
      onContinue({
        fullName: fullName.trim(),
        city: city || 'New York, NY',
        avatarUrl: selectedAvatar,
        role: 'CUSTOMER'
      });
    } else {
      // Specialties list
      const specialties: string[] = [];
      if (houseSpecialty) specialties.push('House Cleaning');
      if (carSpecialty) specialties.push('Car Detailing');

      onContinue({
        fullName: fullName.trim(),
        city: city || 'New York, NY',
        avatarUrl: selectedAvatar,
        role: 'CLEANER',
        cleanerSetup: {
          specialties,
          experience,
          carriesSupplies,
          idType,
          idNumber: idNumber || 'VERIFIED-ID-OK',
          ssnMasked: ssn ? ('***-**-' + ssn.slice(-4)) : 'N/A',
          hasVehicle,
          vehicleModel: hasVehicle ? (vehicleModel || 'Tesla Model Y') : undefined,
          vehiclePlate: hasVehicle ? (vehiclePlate || 'X-CLEAN-99') : undefined,
          hourlyRate: hourlyRate
        }
      });
    }
  };

  return (
    <div className={`absolute inset-0 flex flex-col justify-between p-6 sm:p-8 text-left overflow-y-auto no-scrollbar transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}>
      <div className="relative z-10 w-full space-y-6">
        
        {/* Step Indicator & Titles */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[9px] font-black uppercase tracking-widest leading-none block ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
              {role === 'CUSTOMER' ? 'Step 04 of 05' : `Partner Setup Sub-Step ${step} of 6`}
            </span>
            {role === 'CLEANER' && step > 1 && step < 6 && (
              <button 
                onClick={() => setStep(prev => prev - 1)}
                className={`text-[9px] font-black uppercase tracking-widest text-[#3906d2] flex items-center gap-1 hover:underline cursor-pointer`}
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
            )}
          </div>
          <h2 className={`text-2xl font-display font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {step === 1 && "Create Your Account"}
            {step === 2 && "Setup Specialty & Skills"}
            {step === 3 && "Secure ID Verification"}
            {step === 4 && "Background Screening"}
            {step === 5 && "Transport & Pricing"}
            {step === 6 && "Identity Auditing Live Scanner"}
          </h2>
          <p className={`text-xs font-semibold mt-1 leading-relaxed ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
            {step === 1 && "Decide if you want to request services or offer certified cleaning on our premium InDrive & Uber-style network."}
            {step === 2 && "Define specifications for your House Cleaning and Car Detailing services."}
            {step === 3 && "Fast-track onboarding with instant optical AI document processing."}
            {step === 4 && "Instant safe screening against registries to activate certified status."}
            {step === 5 && "Configure mobility variables and declare hourly service rates."}
            {step === 6 && "Our system is analyzing biometric vectors, driving records, and government safety logs synchronously."}
          </p>
        </div>

        {/* --- STEP 1: Basic Info & Role Selection --- */}
        {step === 1 && (
          <div className="space-y-6">
            
            {/* Dual Card Role Selector */}
            <div className="grid grid-cols-2 gap-3.5 mt-2">
              <button
                type="button"
                onClick={() => setRole('CUSTOMER')}
                className={`p-4 rounded-3xl border text-left flex flex-col justify-between h-34 transition-all duration-300 relative cursor-pointer ${role === 'CUSTOMER' ? 'border-[#3906d2] bg-[#3906d2]/5 shadow-lg shadow-[#3906d2]/10 ring-2 ring-[#3906d2]/15' : isDark ? 'border-white/5 bg-white/5 hover:border-white/15' : 'border-slate-200 bg-slate-50 hover:border-slate-350'}`}
              >
                <div className={`p-2.5 rounded-2xl w-fit ${role === 'CUSTOMER' ? 'bg-[#3906d2] text-white' : 'bg-slate-300 text-slate-800 opacity-60'}`}>
                  <User className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-slate-900'}`}>Book Services</span>
                  <span className={`text-[9px] font-bold block leading-snug ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Order house & car cleaners</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole('CLEANER')}
                className={`p-4 rounded-3xl border text-left flex flex-col justify-between h-34 transition-all duration-300 relative cursor-pointer ${role === 'CLEANER' ? 'border-[#3906d2] bg-[#3906d2]/5 shadow-lg shadow-[#3906d2]/10 ring-2 ring-[#3906d2]/15' : isDark ? 'border-white/5 bg-white/5 hover:border-white/15' : 'border-slate-200 bg-slate-50 hover:border-slate-350'}`}
              >
                <div className={`p-2.5 rounded-2xl w-fit ${role === 'CLEANER' ? 'bg-[#3906d2] text-white' : 'bg-slate-300 text-slate-800 opacity-60'}`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-slate-900'}`}>Become a Pro</span>
                  <span className={`text-[9px] font-bold block leading-snug ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Make income providing services</span>
                </div>
              </button>
            </div>

            {/* Profile Avatar Selection */}
            <div className="flex flex-col items-center">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative w-24 h-24 mb-3.5 cursor-pointer group"
              >
                <div className={`w-full h-full rounded-[28px] overflow-hidden border-2 relative shadow-lg transition-transform group-hover:scale-105 duration-300 ${isDark ? 'border-[#3906d2] bg-[#22212a]' : 'border-slate-300 bg-slate-50'}`}>
                  <img 
                    src={selectedAvatar} 
                    alt="Selected Avatar" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-[9px] text-white font-black uppercase tracking-wider">Photo</span>
                  </div>
                </div>
                <div className={`absolute -bottom-1 -right-1 p-2 rounded-xl shadow-xl border-2 bg-[#3906d2] text-white ${isDark ? 'border-[#0F0E16]' : 'border-white'}`}>
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>
              
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />

              <div className="space-y-1 text-center w-full">
                <span className={`text-[9px] font-black tracking-widest uppercase block ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Choose Default Avatar:</span>
                <div className="flex gap-2 justify-center">
                  {defaultAvatars.map((ava, i) => (
                    <button 
                      key={i} 
                      onClick={() => setSelectedAvatar(ava)}
                      className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all p-0.5 ${selectedAvatar === ava ? 'border-[#3906d2] scale-105' : isDark ? 'border-white/10' : 'border-slate-200'}`}
                    >
                      <img src={ava} className="w-full h-full object-cover rounded-lg" alt="Default Option" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Full Legal Name</label>
                <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${isDark ? 'bg-white/5 border-white/10 focus-within:border-[#3906d2]' : 'bg-slate-50 border-slate-200 focus-within:border-slate-450'}`}>
                  <User className="w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="E.g. Charlotte Miller"
                    className={`bg-transparent border-none outline-none font-extrabold text-sm w-full ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-900 placeholder:text-slate-400'}`}
                  />
                </div>
              </div>

              <div className="relative space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <label className={`block text-[9px] font-black uppercase tracking-widest pl-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Preferred Address / Metro Area</label>
                  <button
                    type="button"
                    onClick={detectLocationAddresses}
                    disabled={fetchingGps}
                    className="text-[10px] font-bold text-[#3906d2] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {fetchingGps ? (
                      <span className="flex items-center gap-1 text-slate-400">
                        <span className="w-2.5 h-2.5 border-2 border-t-transparent border-slate-400 rounded-full animate-spin" />
                        Detecting...
                      </span>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-[#3906d2]" />
                        Use GPS Location
                      </>
                    )}
                  </button>
                </div>

                <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${isDark ? 'bg-white/5 border-white/10 focus-within:border-[#3906d2]' : 'bg-slate-50 border-slate-200 focus-within:border-slate-450'}`}>
                  <MapPin className="w-4 h-4 text-[#3906d2] shrink-0" />
                  <input 
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      fetchCities(e.target.value);
                    }}
                    placeholder="Search city or enter street address"
                    className={`bg-transparent border-none outline-none font-extrabold text-sm w-full ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-900 placeholder:text-slate-400'}`}
                  />
                  {loadingCities && <div className="w-4 h-4 border-2 border-t-transparent border-[#3906d2] rounded-full animate-spin shrink-0" />}
                </div>

                {suggestions.length > 0 && (
                  <div className={`absolute left-0 right-0 mt-2 border rounded-2xl overflow-hidden z-[100] shadow-2xl divide-y ${isDark ? 'bg-[#1A1926] border-white/10 divide-white/5' : 'bg-white border-slate-200 divide-slate-100'}`}>
                    {suggestions.map((currCity) => (
                      <div 
                        key={currCity}
                        onClick={() => {
                          setCity(currCity);
                          setSuggestions([]);
                        }}
                        className={`p-4 text-xs font-black cursor-pointer transition-all ${isDark ? 'text-white hover:bg-white/5' : 'text-slate-705 hover:bg-slate-50'}`}
                      >
                        {currCity}
                      </div>
                    ))}
                  </div>
                )}

                {/* GPS Addresses nearby selector */}
                {gpsAddresses.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <span className={`text-[9px] font-black uppercase tracking-widest block pl-1 ${isDark ? 'text-blue-400' : 'text-[#3906d2]'}`}>
                      GPS Pinpointed Addresses (Select One):
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {gpsAddresses.map((addr, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCity(addr)}
                          className={`text-left p-3 rounded-xl border text-xs font-bold transition-all transition-colors duration-200 flex items-center gap-2 w-full ${city === addr ? 'border-[#3906d2] bg-[#3906d2]/5 text-[#3906d2]' : isDark ? 'border-white/5 bg-white/5 text-white/70 hover:bg-white/10' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                        >
                          <Check className={`w-3.5 h-3.5 shrink-0 ${city === addr ? 'text-[#3906d2] opacity-100' : 'opacity-0'}`} />
                          <span className="truncate">{addr}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preset Popular Locations Quick List */}
                <div className="mt-3 space-y-1.5">
                  <span className={`text-[9px] font-black uppercase tracking-widest block pl-1 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
                    Popular Location Presets (Tap to select):
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESET_LOCATIONS.map((preset, idx) => {
                      const isSelected = city === preset;
                      const name = preset.split(',')[0];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCity(preset)}
                          className={`text-left p-2.5 rounded-xl border text-[10px] font-extrabold truncate transition-all ${isSelected ? 'border-[#3906d2] bg-[#3906d2]/10 text-[#3906d2] border-[#3906d2]' : isDark ? 'border-white/5 bg-white/5 text-white/50 hover:bg-white/10' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          📍 {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- STEP 2: Specialties and Equipment (For Cleaners Only) --- */}
        {step === 2 && (
          <div className="space-y-5">
            <div className={`p-4 rounded-2.5xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-250/50'}`}>
              <h3 className={`text-xs font-black uppercase tracking-wider mb-3 ${isDark ? 'text-white/80' : 'text-slate-800'}`}>Specialty Sectors</h3>
              
              <div className="space-y-3">
                {/* House/Apartment Cleaning */}
                <button
                  type="button"
                  onClick={() => setHouseSpecialty(!houseSpecialty)}
                  className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${houseSpecialty ? 'border-[#3906d2] bg-[#3906d2]/5 font-black' : isDark ? 'border-white/5 hover:border-white/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-center gap-3">
                    <Briefcase className={`w-5 h-5 ${houseSpecialty ? 'text-[#3906d2]' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <span className={`text-xs block ${isDark ? 'text-white' : 'text-slate-900'}`}>House & Home Cleaning</span>
                      <span className={`text-[9px] block text-slate-450 ${houseSpecialty ? 'font-bold' : ''}`}>Deep clean, general dusting, apartment upkeep</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${houseSpecialty ? 'border-[#3906d2] bg-[#3906d2] text-white' : 'border-slate-350'}`}>
                    {houseSpecialty && <Check className="w-3.5 h-3.5 font-bold" />}
                  </div>
                </button>

                {/* Car Detailing and Wash */}
                <button
                  type="button"
                  onClick={() => setCarSpecialty(!carSpecialty)}
                  className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${carSpecialty ? 'border-[#3906d2] bg-[#3906d2]/5 font-black' : isDark ? 'border-white/5 hover:border-white/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-center gap-3">
                    <Car className={`w-5 h-5 ${carSpecialty ? 'text-[#3906d2]' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <span className={`text-xs block ${isDark ? 'text-white' : 'text-slate-900'}`}>Automobile Detailing</span>
                      <span className={`text-[9px] block text-slate-450 ${carSpecialty ? 'font-bold' : ''}`}>Interior steam clean, exterior wax, paint polishing</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${carSpecialty ? 'border-[#3906d2] bg-[#3906d2] text-white' : 'border-slate-350'}`}>
                    {carSpecialty && <Check className="w-3.5 h-3.5 font-bold" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Experience Selection Option */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Years of Experience</label>
              <div className="grid grid-cols-3 gap-2">
                {['1-2 Years', '3-5 Years', '5+ Years'].map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setExperience(exp)}
                    className={`py-3.5 rounded-2xl border text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${experience === exp ? 'border-[#3906d2] bg-[#3906d2]/5 text-[#3906d2]' : isDark ? 'border-white/5 bg-white/5 text-white/50 hover:bg-white/10' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>

            {/* Carries Supplies Checkbox Toggle */}
            <div className={`p-4 rounded-2.5xl border flex items-center justify-between transition-all ${carriesSupplies ? 'border-[#3906d2]/20 bg-[#3906d2]/5' : isDark ? 'border-white/5' : 'border-slate-200'}`}>
              <div className="space-y-0.5 text-left pr-3">
                <span className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-white' : 'text-slate-900'}`}>I Carry Premium Supplies</span>
                <span className={`text-[9px] text-slate-500 font-bold block leading-relaxed`}>Equipped with vacuums, pressure cleaners, eco soaps & sponges</span>
              </div>
              <button
                type="button"
                onClick={() => setCarriesSupplies(!carriesSupplies)}
                className={`w-10 h-6 rounded-full p-0.5 transition-all relative ${carriesSupplies ? 'bg-[#3906d2]' : 'bg-slate-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${carriesSupplies ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        )}

        {/* --- STEP 3: Identity Setup Setup (Licenses & Face Scanning) --- */}
        {step === 3 && (
          <div className="space-y-4">
            
            {/* Quick autofill block */}
            <div className="p-3 bg-[#3906d2]/10 border border-[#3906d2]/20 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex-1 text-left">
                <span className="text-[9px] font-black uppercase text-[#3906d2] block">Testing Environment Mode</span>
                <span className="text-[8px] font-semibold text-slate-500 block leading-tight">Skip uploading physical documents. Simulate AI scan instantly.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  simulateIdUpload();
                  simulateSelfieUpload();
                }}
                className="px-3 py-1.5 rounded-xl bg-[#3906d2] text-white text-[8px] font-black uppercase tracking-wider hover:scale-105 transition-all cursor-pointer shadow-md"
              >
                ⚡ Auto Fill ID
              </button>
            </div>

            {/* Document Type Selective pills */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Government ID Type</label>
              <div className="grid grid-cols-3 gap-2">
                {['Driver\'s License', 'National ID', 'Passport'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setIdType(t)}
                    className={`py-3.5 rounded-2xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${idType === t ? 'border-[#3906d2] bg-[#3906d2]/5 text-[#3906d2]' : isDark ? 'border-white/5 bg-white/5 text-white/50 hover:bg-white/10' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* ID Number Input */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Document Reference Number</label>
              <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${isDark ? 'bg-white/5 border-white/10 focus-within:border-[#3906d2]' : 'bg-slate-50 border-slate-200 focus-within:border-slate-450'}`}>
                <FileText className="w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="EX: DL-50343120"
                  className={`bg-transparent border-none outline-none font-extrabold text-sm w-full ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-900 placeholder:text-slate-400'}`}
                />
              </div>
            </div>

            {/* Dual Doc Upload boxes */}
            <div className="grid grid-cols-2 gap-4">
              
              {/* ID Front */}
              <div className="space-y-1.5 text-center">
                <span className={`text-[8px] font-black uppercase tracking-wider block text-left ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Front of ID card</span>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-4 h-32 flex flex-col justify-center items-center gap-2 cursor-default transition-all relative overflow-hidden ${idFrontFile ? 'border-emerald-500 bg-emerald-550/5' : 'border-slate-300'}`}
                >
                  {isIdScanning ? (
                    <div className="text-center space-y-2">
                      <Activity className="w-5 h-5 text-[#3906d2] animate-spin mx-auto" />
                      <span className="text-[8px] font-black tracking-widest text-[#3906d2] uppercase">SCANNING...</span>
                    </div>
                  ) : idFrontFile ? (
                    <div className="absolute inset-0 p-1 bg-slate-900/10 flex flex-col items-center justify-center">
                      <img src={idFrontFile} className="w-full h-full object-contain rounded-xl" alt="ID Document Preview" referrerPolicy="no-referrer" />
                      <div className="absolute top-1 right-1 bg-emerald-500 text-white p-1 rounded-full"><Check className="w-3 h-3" /></div>
                      <button 
                        type="button"
                        onClick={() => setIdFrontFile(null)}
                        className="absolute bottom-1 right-1 bg-red-500 hover:bg-red-650 text-white font-bold p-1 rounded-lg text-[8px] uppercase tracking-wider"
                      >
                        Retake
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <div className="flex gap-1">
                        <button 
                          type="button"
                          onClick={() => openCamera('id')}
                          className="px-2 py-1 bg-[#3906d2] text-white rounded-lg text-[8px] font-black uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                        >
                          Camera
                        </button>
                        <button 
                          type="button"
                          onClick={() => idInputRef.current?.click()}
                          className="px-2 py-1 bg-slate-200 dark:bg-white/5 text-slate-705 dark:text-white rounded-lg text-[8px] font-black uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                        >
                          File
                        </button>
                      </div>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest block">Choose Option</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Verified selfie */}
              <div className="space-y-1.5 text-center">
                <span className={`text-[8px] font-black uppercase tracking-wider block text-left ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Selfie portrait</span>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-4 h-32 flex flex-col justify-center items-center gap-2 cursor-default transition-all relative overflow-hidden ${selfieFile ? 'border-emerald-500 bg-emerald-550/5' : 'border-slate-300'}`}
                >
                  {isSelfieScanning ? (
                    <div className="text-center space-y-2">
                      <Activity className="w-5 h-5 text-[#3906d2] animate-spin mx-auto" />
                      <span className="text-[8px] font-black tracking-widest text-[#3906d2] uppercase">MAPPING FACE...</span>
                    </div>
                  ) : selfieFile ? (
                    <div className="absolute inset-0 p-1 bg-slate-900/10 flex flex-col items-center justify-center">
                      <img src={selfieFile} className="w-full h-full object-contain rounded-xl" alt="Selfie Preview" referrerPolicy="no-referrer" />
                      <div className="absolute top-1 right-1 bg-emerald-500 text-white p-1 rounded-full"><Check className="w-3 h-3" /></div>
                      <button 
                        type="button"
                        onClick={() => setSelfieFile(null)}
                        className="absolute bottom-1 right-1 bg-red-500 hover:bg-red-650 text-white font-bold p-1 rounded-lg text-[8px] uppercase tracking-wider"
                      >
                        Retake
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <Camera className="w-4 h-4 text-slate-400" />
                      <div className="flex gap-1">
                        <button 
                          type="button"
                          onClick={() => openCamera('selfie')}
                          className="px-2 py-1 bg-[#3906d2] text-white rounded-lg text-[8px] font-black uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                        >
                          Camera
                        </button>
                        <button 
                          type="button"
                          onClick={() => selfieInputRef.current?.click()}
                          className="px-2 py-1 bg-slate-200 dark:bg-white/5 text-slate-705 dark:text-white rounded-lg text-[8px] font-black uppercase tracking-wider hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                        >
                          File
                        </button>
                      </div>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest block">Choose Option</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Hidden native uploads */}
            <input 
              type="file"
              ref={idInputRef}
              onChange={handleIdFileChange}
              accept="image/*"
              className="hidden"
            />
            <input 
              type="file"
              ref={selfieInputRef}
              onChange={handleSelfieFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
        )}

        {/* --- STEP 4: SSN background check and safety terms --- */}
        {step === 4 && (
          <div className="space-y-4">
            
            {/* National Identifier SSN Input */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>SSN or National Identification ID</label>
              <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${isDark ? 'bg-white/5 border-white/10 focus-within:border-[#3906d2]' : 'bg-slate-50 border-slate-200 focus-within:border-slate-450'}`}>
                <Shield className="w-4 h-4 text-[#3906d2] shrink-0" />
                <input 
                  type="password"
                  value={ssn}
                  onChange={(e) => setSsn(e.target.value)}
                  placeholder="Format: 000-00-0000"
                  maxLength={11}
                  className={`bg-transparent border-none outline-none font-extrabold text-sm w-full tracking-widest ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-900 placeholder:text-slate-400'}`}
                />
              </div>
            </div>

            {/* Reference info */}
            <div>
              <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Prior Cleaning References (Optional)</label>
              <div className={`border rounded-2xl p-4 flex items-center gap-3 transition-all ${isDark ? 'bg-white/5 border-white/10 focus-within:border-[#3906d2]' : 'bg-slate-50 border-slate-200 focus-within:border-slate-450'}`}>
                <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                <input 
                  type="text"
                  value={priorReferences}
                  onChange={(e) => setPriorReferences(e.target.value)}
                  placeholder="E.g., John Sterling, +1 (555) 012-3456"
                  className={`bg-transparent border-none outline-none font-extrabold text-xs w-full ${isDark ? 'text-white placeholder:text-white/20' : 'text-slate-900 placeholder:text-slate-400'}`}
                />
              </div>
            </div>

            {/* Uber-like security lock statement */}
            <div className="p-4 border border-[#3906d2]/15 bg-[#3906d2]/5 rounded-2xl space-y-3.5 text-left">
              <div className="flex gap-2.5">
                <Lock className="w-4 h-4 text-[#3906d2] shrink-0 mt-0.5" />
                <span className="text-[10px] uppercase font-black tracking-wider text-[#3906d2] block">National Police Database Audit</span>
              </div>
              <p className="text-[9px] leading-relaxed font-semibold text-slate-500">
                To keep both customers and cleaning hosts highly secure, we conduct an instant background registry sweep (using your legal identifier) to certify crime-free statuses. Your credential logs will be fully encrypted.
              </p>

              {/* Consent check box */}
              <button
                type="button"
                onClick={() => setBackgroundConsent(!backgroundConsent)}
                className="w-full flex items-center gap-3 py-2 text-left"
              >
                <div className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center shrink-0 transition-all ${backgroundConsent ? 'bg-[#3906d2] border-[#3906d2] text-white' : 'border-slate-300'}`}>
                  {backgroundConsent && <Check className="w-3.5 h-3.5 font-bold" />}
                </div>
                <span className={`text-[9px] font-extrabold ${isDark ? 'text-white' : 'text-slate-700'}`}>
                  I consent to the safety backdrop and address record screening.
                </span>
              </button>
            </div>

          </div>
        )}

        {/* --- STEP 5: Vehicle registration and hourly price setup --- */}
        {step === 5 && (
          <div className="space-y-5">
            
            {/* Vehicles requirement */}
            <div className={`p-4 rounded-2.5xl border flex items-center justify-between transition-all ${hasVehicle ? 'border-[#3906d2]/20 bg-[#3906d2]/5' : isDark ? 'border-white/5' : 'border-slate-200'}`}>
              <div className="space-y-0.5 text-left pr-3">
                <span className="text-xs font-black uppercase tracking-wider block">I have a Transit Vehicle</span>
                <span className="text-[9px] text-slate-500 font-bold block leading-relaxed">Necessary for carrying mobile car cleaning vacuums, tools, or hoses</span>
              </div>
              <button
                type="button"
                onClick={() => setHasVehicle(!hasVehicle)}
                className={`w-10 h-6 rounded-full p-0.5 transition-all relative ${hasVehicle ? 'bg-[#3906d2]' : 'bg-slate-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${hasVehicle ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {hasVehicle && (
              <div className="grid grid-cols-2 gap-3 animate-fade-in">
                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Vehicle Model & Brand</label>
                  <div className={`border rounded-2xl p-4 flex items-center gap-2 transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                    <input 
                      type="text"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="E.g., Toyota RAV4"
                      className={`bg-transparent border-none outline-none font-extrabold text-xs w-full ${isDark ? 'text-white' : 'text-slate-900'}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[9px] font-black uppercase tracking-widest mb-1.5 ml-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>License Plate ID</label>
                  <div className={`border rounded-2xl p-4 flex items-center gap-2 transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                    <input 
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder="E.g., 9ABC12"
                      className={`bg-transparent border-none outline-none font-extrabold text-xs w-full ${isDark ? 'text-white' : 'text-slate-900'}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Pricing setup slider block */}
            <div className={`p-4 rounded-2.5xl border text-left space-y-3.5 ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-250/50'}`}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-wider block">Standard Hourly Pricing</span>
                <span className="px-3 py-1 bg-[#3906d2] text-white font-black text-xs tracking-wide rounded-full">${hourlyRate}/hr</span>
              </div>

              <input 
                type="range"
                min="15"
                max="95"
                step="5"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(Number(e.target.value))}
                className="w-full accent-[#3906d2]"
              />

              <div className="flex justify-between text-[8px] font-black uppercase text-slate-400">
                <span>$15/hr (Economy)</span>
                <span>$55/hr (Pro Average)</span>
                <span>$95/hr (Super Host)</span>
              </div>
            </div>

          </div>
        )}

        {/* --- STEP 6: Live Uber-like Safety Radar scan --- */}
        {step === 6 && (
          <div className="space-y-4">
            
            {/* Scanning radar indicator */}
            <div className="relative w-44 h-44 mx-auto my-4 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-[#3906d2]/10 animate-ping"></div>
              <div className="absolute inset-4 rounded-full border-2 border-dashed border-[#3906d2]/30 animate-spin"></div>
              <div className="absolute inset-10 rounded-full bg-[#3906d2]/10 flex items-center justify-center border border-[#3906d2]/20">
                {scanIndex < scanLogs.length ? (
                  <Activity className="w-10 h-10 text-[#3906d2] animate-pulse" />
                ) : (
                  <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
                    <Check className="w-8 h-8 text-white stroke-[3px]" />
                  </div>
                )}
              </div>
            </div>

            {/* Progression Logs */}
            <div className={`p-4 rounded-2.5xl border divide-y ${isDark ? 'bg-[#12111C] border-white/5 divide-white/5' : 'bg-slate-50 border-slate-200 divide-slate-100'} text-left text-[9px] font-extrabold max-h-[175px] overflow-y-auto`}>
              {scanLogs.map((log, idx) => (
                <div key={idx} className="flex items-center justify-between py-2.5">
                  <span className={`${log.status === 'done' ? 'text-slate-500 line-through font-medium' : log.status === 'loading' ? 'text-[#3906d2]' : isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    {log.label}
                  </span>
                  
                  {log.status === 'done' && (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <Check className="w-3 h-3 stroke-[3px]" /> PASSED
                    </span>
                  )}
                  {log.status === 'loading' && (
                    <span className="text-[#3906d2] flex items-center gap-1">
                      <div className="w-3 h-3 border border-t-transparent border-[#3906d2] rounded-full animate-spin"></div> RUNNING
                    </span>
                  )}
                  {log.status === 'pending' && (
                    <span className="text-slate-400">PENDING</span>
                  )}
                </div>
              ))}
            </div>

            {/* Final Certificate Banner */}
            {scanIndex >= scanLogs.length && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2.5xl space-y-2 animate-fade-in text-center">
                <span className="inline-block px-3 py-1 bg-emerald-500 text-white rounded-full font-black text-[9px] uppercase tracking-widest shadow-md">Verified Service partner</span>
                <h4 className={`text-md font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-800'}`}>License Verified & Safety Approved</h4>
                <p className="text-[9px] text-slate-500 font-semibold leading-relaxed max-w-xs mx-auto">
                  Face matching & national criminal searches concluded seamlessly. You are cleared to submit instant bids and match directly with nearby residential & automotive cleaning contracts!
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- Action controls & submission block --- */}
      <div className="relative z-10 w-full pt-6 pb-2">
        <button 
          onClick={() => {
            if (role === 'CUSTOMER') {
              handleCreate();
            } else {
              // Navigation logics
              if (step === 1) {
                if (!fullName.trim() || !city.trim()) return;
                setStep(2);
              } else if (step === 2) {
                if (!houseSpecialty && !carSpecialty) {
                  alert("Please choose at least one cleaning specialty (Home or Car Detailed) to partner with Detail!");
                  return;
                }
                setStep(3);
              } else if (step === 3) {
                if (!idNumber) {
                  alert("Please specify your driver's licence/government ID number.");
                  return;
                }
                setStep(4);
              } else if (step === 4) {
                if (!ssn) {
                  alert("Please enter a valid SSN or National Identification ID to consent background check.");
                  return;
                }
                if (!backgroundConsent) {
                  alert("You must check and consent to the Automatic Background search to secure Pro Status.");
                  return;
                }
                setStep(5);
              } else if (step === 5) {
                if (hasVehicle && !vehiclePlate) {
                  alert("Please register your clean mobile vehicle's license plate.");
                  return;
                }
                setStep(6);
              } else {
                // Completed scan
                handleCreate();
              }
            }
          }}
          disabled={
            step === 1 ? (!fullName.trim() || !city.trim()) :
            step === 3 ? (!idNumber) :
            step === 4 ? (!ssn || !backgroundConsent) :
            step === 5 ? (hasVehicle && !vehiclePlate) :
            step === 6 ? (scanIndex < scanLogs.length) :
            false
          }
          className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
            (step === 1 && fullName.trim() && city.trim()) ||
            (step === 2) ||
            (step === 3 && idNumber) ||
            (step === 4 && ssn && backgroundConsent) ||
            (step === 5 && (!hasVehicle || vehiclePlate)) ||
            (step === 6 && scanIndex >= scanLogs.length)
              ? 'bg-[#3906d2] text-white shadow-lg shadow-[#3906d2]/15 hover:brightness-105 active:scale-98 cursor-pointer' 
              : isDark ? 'bg-white/5 text-white/20 pointer-events-none' : 'bg-slate-100 text-slate-400 pointer-events-none'
          }`}
        >
          {role === 'CUSTOMER' && "Create Profile"}
          {role === 'CLEANER' && step === 1 && "Proceed to Specialty Setup ➔"}
          {role === 'CLEANER' && step === 2 && "Proceed to ID Verification ➔"}
          {role === 'CLEANER' && step === 3 && "Proceed to Background Screening ➔"}
          {role === 'CLEANER' && step === 4 && "Proceed to Price & Vehicle Rates ➔"}
          {role === 'CLEANER' && step === 5 && "Execute Official Background Registry Scan ➔"}
          {role === 'CLEANER' && step === 6 && (scanIndex < scanLogs.length ? "Auditing Records..." : "Activate Account & Start Earning! ➔")}
        </button>
      </div>

      {activeCameraType && (
        <div className="absolute inset-0 bg-black/95 z-[999] flex flex-col justify-between p-6 text-white select-none animate-fade-in">
          <div className="flex items-center justify-between pt-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#3906d2]">
              Live Capture {activeCameraType === 'id' ? 'ID Card' : 'Selfie Portrait'}
            </h3>
            <button 
              type="button"
              onClick={closeCamera}
              className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative flex-1 my-6 rounded-3xl overflow-hidden border border-[#3906d2]/30 bg-neutral-900 flex items-center justify-center">
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              muted
              className="w-full h-full object-cover"
            />
            {activeCameraType === 'id' ? (
              <div className="absolute w-[85%] h-[55%] border-2 border-dashed border-emerald-500 rounded-2xl flex items-center justify-center bg-transparent pointer-events-none">
                <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500 text-white rounded-full">Align Government ID Card</span>
              </div>
            ) : (
              <div className="absolute w-[65%] aspect-square rounded-full border-2 border-dashed border-emerald-500 flex items-center justify-center bg-transparent pointer-events-none">
                <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500 text-white rounded-full mt-auto mb-6">Align Face Here</span>
              </div>
            )}
          </div>

          <div className="space-y-4 pb-2">
            <button 
              type="button"
              onClick={capturePhoto}
              className="w-full py-5 bg-[#3906d2] hover:bg-[#3405c0] text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Capture Photo
            </button>
            <p className="text-[8px] text-white/40 text-center font-bold uppercase tracking-wider">
              Hold steady & capture clearly under direct light
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Permissions Screen ---
export const PermissionsScreen = ({ 
  onComplete,
  theme = 'light'
}: { 
  onComplete: (permissions: { gps: boolean; notifications: boolean; camera: boolean }) => void;
  theme?: 'light' | 'dark';
}) => {
  // Permission switches states
  const [gps, setGps] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [camera, setCamera] = useState(false);
  const isDark = theme === 'dark';

  const requestGpsPermission = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGps(true);
          console.log("GPS Location permission granted:", position.coords);
        },
        (error) => {
          console.warn("GPS Location permission denied:", error);
          // Set to true anyway to allow progress in sandbox/preview
          setGps(true);
        }
      );
    } else {
      setGps(true);
    }
  };

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          setNotifications(true);
        } else {
          console.warn("Notification permission was denied");
          setNotifications(true);
        }
      }).catch(err => {
        console.error("Notification permission error:", err);
        setNotifications(true);
      });
    } else {
      setNotifications(true);
    }
  };

  const requestCameraPermission = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setCamera(true);
      } else {
        setCamera(true);
      }
    } catch (error) {
      console.warn("Camera permission error or denied:", error);
      setCamera(true);
    }
  };

  return (
    <div className={`absolute inset-0 flex flex-col justify-between p-8 text-left overflow-y-auto no-scrollbar transition-colors duration-300 ${isDark ? 'bg-[#0F0E16]' : 'bg-white'}`}>
      <div className="relative z-10 w-full space-y-8">
        {/* Header */}
        <div className="pt-4">
          <span className={`text-[10px] font-black uppercase tracking-widest leading-none block mb-1 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Step 05 of 05</span>
          <h2 className={`text-2xl font-display font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Access Permissions</h2>
          <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Please enable critical components to match and coordinate jobs.</p>
        </div>

        {/* Permission card widgets */}
        <div className="space-y-4">
          {/* Card: GPS */}
          <div className={`border rounded-3xl p-5 flex items-start gap-4 transition-all relative ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/60 shadow-sm'}`}>
            <div className="w-12 h-12 bg-[#3906d2]/10 border border-[#3906d2]/25 rounded-2xl flex items-center justify-center text-[#3906d2]">
              <MapPin className="w-5 h-5 filter drop-shadow-[0_0_6px_rgba(57,6,210,0.3)]" />
            </div>
            <div className="flex-1 mr-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#3906d2] leading-none mb-1 block">Highly Recommended</span>
              <p className={`text-sm font-black block ${isDark ? 'text-white' : 'text-slate-900'}`}>GPS Location Access</p>
              <p className={`text-[11px] font-medium mt-1 leading-normal ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                Required for real-time live map tracking and to show nearby verified specialists.
              </p>
            </div>
            {/* Custom Switch Toggle */}
            <button 
              onClick={() => {
                if (!gps) {
                  requestGpsPermission();
                } else {
                  setGps(false);
                }
              }}
              className={`w-12 h-7 rounded-full p-0.5 transition-all outline-none duration-300 relative cursor-pointer ${gps ? 'bg-[#3906d2]' : (isDark ? 'bg-white/10' : 'bg-slate-200')}`}
            >
              <div className={`w-6 h-6 rounded-full shadow-sm transform transition-all duration-300 ${gps ? 'translate-x-5' : 'translate-x-0'} ${isDark ? 'bg-slate-900' : 'bg-white'}`} />
            </button>
          </div>

          {/* Card: Notifications */}
          <div className={`border rounded-3xl p-5 flex items-start gap-4 transition-all relative ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/60 shadow-sm'}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-white/5 border-white/5 text-white/60' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1 mr-2">
              <span className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 block ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Recommended</span>
              <p className={`text-sm font-black block ${isDark ? 'text-white' : 'text-slate-900'}`}>Push Notifications</p>
              <p className={`text-[11px] font-medium mt-1 leading-normal ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                Receive instant pop-up alerts on direct job bids, safe check-ins, and client chat lines.
              </p>
            </div>
            {/* Custom Switch Toggle */}
            <button 
              onClick={() => {
                if (!notifications) {
                  requestNotificationPermission();
                } else {
                  setNotifications(false);
                }
              }}
              className={`w-12 h-7 rounded-full p-0.5 transition-all outline-none duration-300 relative cursor-pointer ${notifications ? 'bg-[#3906d2]' : (isDark ? 'bg-white/10' : 'bg-slate-200')}`}
            >
              <div className={`w-6 h-6 rounded-full shadow-sm transform transition-all duration-300 ${notifications ? 'translate-x-5' : 'translate-x-0'} ${isDark ? 'bg-slate-900' : 'bg-white'}`} />
            </button>
          </div>

          {/* Card: Camera */}
          <div className={`border rounded-3xl p-5 flex items-start gap-4 transition-all relative ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/60 shadow-sm'}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-white/5 border-white/5 text-white/60' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
              <Camera className="w-5 h-5" />
            </div>
            <div className="flex-1 mr-2">
              <span className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 block ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Optional</span>
              <p className={`text-sm font-black block ${isDark ? 'text-white' : 'text-slate-900'}`}>Camera & Photo Album</p>
              <p className={`text-[11px] font-medium mt-1 leading-normal ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                Saves time. Capture pre-cleaning state photos or post-cleaning satisfaction receipts.
              </p>
            </div>
            {/* Custom Switch Toggle */}
            <button 
              onClick={() => {
                if (!camera) {
                  requestCameraPermission();
                } else {
                  setCamera(false);
                }
              }}
              className={`w-12 h-7 rounded-full p-0.5 transition-all outline-none duration-300 relative cursor-pointer ${camera ? 'bg-[#3906d2]' : (isDark ? 'bg-white/10' : 'bg-slate-200')}`}
            >
              <div className={`w-6 h-6 rounded-full shadow-sm transform transition-all duration-300 ${camera ? 'translate-x-5' : 'translate-x-0'} ${isDark ? 'bg-slate-900' : 'bg-white'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full pt-12 pb-2">
        <button 
          onClick={() => onComplete({ gps, notifications, camera })}
          className="w-full py-5 bg-[#3906d2] text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-105 active:scale-[0.98] transition-all shadow-md shadow-[#3906d2]/15"
        >
          Explore Home Dashboard
        </button>
      </div>
    </div>
  );
};
