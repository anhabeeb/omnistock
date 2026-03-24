export interface CurrencySettings {
  default_currency: string;
  currency_symbol: string;
  currency_position: string;
  decimal_places: number;
}

export function formatCurrency(amount: number, settings: CurrencySettings): string {
  const formattedAmount = amount.toLocaleString(undefined, {
    minimumFractionDigits: settings.decimal_places,
    maximumFractionDigits: settings.decimal_places,
  });

  if (settings.currency_position === 'before') {
    return `${settings.currency_symbol} ${formattedAmount}`;
  } else {
    return `${formattedAmount} ${settings.currency_symbol}`;
  }
}
