export function BrandMark({ size = 34, color = '#3906D2' }: { size?: number; color?: string }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <path d="M32 32V76" stroke={color} strokeWidth="8" strokeLinecap="square"/>
    <path d="M32 32H60A32 32 0 0 1 60 96H32" stroke={color} strokeWidth="8" strokeLinecap="square" strokeLinejoin="miter"/>
    <path d="M50 48H60A16 16 0 0 1 60 80H32" stroke={color} strokeWidth="8" strokeLinecap="square" strokeLinejoin="miter"/>
    <path d="M42 56H50V72H42Z" fill={color}/><circle cx="100" cy="92" r="6" fill={color}/>
  </svg>;
}
