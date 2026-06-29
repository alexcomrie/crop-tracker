export const currency = (n: number, symbol = "$") =>
  `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const num = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const round = (n: number, places = 2) =>
  Math.round(n * 10 ** places) / 10 ** places;
