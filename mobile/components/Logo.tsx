import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

interface LogoProps {
  size?: number;
  color?: string;
}

export function Logo({ size = 64, color = '#3906d2' }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Path
        d="M 32,32 L 32,76"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="square"
      />
      <Path
        d="M 32,32 L 60,32 A 32 32 0 0 1 60,96 L 32,96"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Path
        d="M 50,48 L 60,48 A 16 16 0 0 1 60,80 L 32,80"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <Rect x="42" y="56" width="8" height="16" fill={color} />
      <Circle cx="100" cy="92" r="6" fill={color} />
    </Svg>
  );
}
