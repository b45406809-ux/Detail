import React from 'react';
import { View } from 'react-native';
import { Star } from 'lucide-react-native';

interface StarRatingProps {
  rating: number;
  size?: number;
  color?: string;
}

export function StarRating({ rating, size = 14, color = '#f59e0b' }: StarRatingProps) {
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          color={star <= Math.round(rating) ? color : '#d1d5db'}
          fill={star <= Math.round(rating) ? color : 'transparent'}
        />
      ))}
    </View>
  );
}
