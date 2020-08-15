import BigNumber from "bignumber.js";

export function isDanger() {}

const weeks = 7 * 86400;

export function getEmergencyBorderInfo(xx: number) {
  if (xx <= 0.3576 * 0.3576) {
    return {a: 0, b: 1.1};
  } else if (xx <= 0.7751 * 0.7751) {
    return {a: 1.52, b: 0.5564};
  } else if (xx <= 1.1562 * 1.1562) {
    return {a: 6.4, b: -3.226};
  } else if (xx <= 1.416 * 1.416) {
    return {a: 14.27, b: -12.3256};
  } else if (xx <= 1.6257 * 1.6257) {
    return {a: 29.13, b: -33.3676};
  } else if (xx <= 1.8 * 1.8) {
    return {a: 53.15, b: -72.4165};
  } else {
    throw new Error("not acceptable");
  }
}

export function isInEmergency(
  rateETH2USD: number,
  solidBondStrikePrice: number,
  volatility: number,
  untilMaturity: number
) {
  if (volatility > 2) {
    volatility = 2; // The volatility is too high.
  }
  if (untilMaturity >= 12 * weeks) {
    return true; // The period until maturity is too long.
  }

  const vvt = volatility * volatility * untilMaturity;
  const xx = vvt / (0.64 * 86400 * 365);
  const {a, b} = getEmergencyBorderInfo(xx);
  const c = rateETH2USD - b * solidBondStrikePrice;
  const r = vvt * a * a * solidBondStrikePrice * solidBondStrikePrice;
  const isDanger = c <= 0 || c * c * 20183040 <= r;
  return isDanger;
}

export function isDangerSolidBond(
  rateETH2USD: number,
  solidBondStrikePrice: number,
  volatility: number,
  untilMaturity: number
) {
  if (rateETH2USD > 2.5 * solidBondStrikePrice && untilMaturity < 2 * weeks) {
    return false;
  } else if (volatility > 2) {
    return true; // The volatility is too high.
  }
  if (untilMaturity >= 12 * weeks) {
    return true; // The period until maturity is too long.
  }

  const vvt = volatility * volatility * untilMaturity;
  const xx = vvt / (0.64 * 86400 * 365);
  const {a, b} = getEmergencyBorderInfo(xx);
  const c = 2 * rateETH2USD - 3 * b * solidBondStrikePrice;
  // int256 lE28 = cE8.mul(cE8).mul(20183040 * 10**12);
  const r = 9 * vvt * a * a * solidBondStrikePrice * solidBondStrikePrice;
  const isDanger = c <= 0 || c * c * 20183040 <= r;
  return isDanger;
}
