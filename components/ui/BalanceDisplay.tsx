import React from 'react';
import { formatMinorUnits } from '@/lib/format';

interface BalanceDisplayProps {
  amount: string | bigint | number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPlus?: boolean;
  className?: string;
}

export function BalanceDisplay({
  amount,
  currency = 'USD',
  size = 'md',
  showPlus = false,
  className = '',
}: BalanceDisplayProps) {
  const formatted = formatMinorUnits(amount, currency, showPlus);

  const sizeClasses = {
    sm: 'text-sm font-medium',
    md: 'text-base font-semibold',
    lg: 'text-xl font-bold tracking-tight',
    xl: 'text-3xl font-extrabold tracking-tight',
  }[size];

  return (
    <span className={`font-mono tabular-nums ${sizeClasses} ${className}`}>
      {formatted}
    </span>
  );
}
