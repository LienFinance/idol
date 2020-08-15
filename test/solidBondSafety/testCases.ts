import {days} from "../util";

const isInEmergency = [
  {
    errorMessage: "",
    rateETH2USD: 111,
    solidBondStrikePriceUSD: 100,
    volatility: 0,
    periodSecBeforeMaturity: 0 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 110,
    solidBondStrikePriceUSD: 100,
    volatility: 0,
    periodSecBeforeMaturity: 0 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 300,
    solidBondStrikePriceUSD: 200,
    volatility: 2,
    periodSecBeforeMaturity: 10 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 300,
    solidBondStrikePriceUSD: 200,
    volatility: 2,
    periodSecBeforeMaturity: 30 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.864,
    periodSecBeforeMaturity: 40 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.865,
    periodSecBeforeMaturity: 40 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 210,
    solidBondStrikePriceUSD: 200,
    volatility: 0.2,
    periodSecBeforeMaturity: 30 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 199,
    solidBondStrikePriceUSD: 100,
    volatility: 1.8,
    periodSecBeforeMaturity: 84 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
  {
    errorMessage: "",
    rateETH2USD: 200,
    solidBondStrikePriceUSD: 100,
    volatility: 2.00000001, // -> 2
    periodSecBeforeMaturity: 1 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.901,
    periodSecBeforeMaturity: 270 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.902,
    periodSecBeforeMaturity: 270 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
];

const isDangerSolidBond = [
  {
    errorMessage: "",
    rateETH2USD: 166,
    solidBondStrikePriceUSD: 100,
    volatility: 0,
    periodSecBeforeMaturity: 0 * days,
    isDanger: false,
  },
  {
    errorMessage: "",
    rateETH2USD: 165,
    solidBondStrikePriceUSD: 100,
    volatility: 0,
    periodSecBeforeMaturity: 0 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 300,
    solidBondStrikePriceUSD: 200,
    volatility: 2,
    periodSecBeforeMaturity: 10 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 300,
    solidBondStrikePriceUSD: 200,
    volatility: 2,
    periodSecBeforeMaturity: 30 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.864,
    periodSecBeforeMaturity: 40 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.865,
    periodSecBeforeMaturity: 40 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 210,
    solidBondStrikePriceUSD: 200,
    volatility: 0.2,
    periodSecBeforeMaturity: 30 * days,
    isDanger: true,
  },
  {
    errorMessage: "",
    rateETH2USD: 199,
    solidBondStrikePriceUSD: 100,
    volatility: 1.8,
    periodSecBeforeMaturity: 84 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
  {
    errorMessage: "",
    rateETH2USD: 200,
    solidBondStrikePriceUSD: 100,
    volatility: 2.00000001, // volatility > 2
    periodSecBeforeMaturity: 1 * days,
    isDanger: true, // The volatility is too high.
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.901,
    periodSecBeforeMaturity: 270 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
  {
    errorMessage: "",
    rateETH2USD: 230,
    solidBondStrikePriceUSD: 200,
    volatility: 0.902,
    periodSecBeforeMaturity: 270 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // The period until maturity is too long.
  },
  {
    errorMessage: "",
    rateETH2USD: 250.00000001,
    solidBondStrikePriceUSD: 100, // rateETH2USD > solidBondStrikePrice * 2.5
    volatility: 2.00000001, // volatility > 2
    periodSecBeforeMaturity: 14 * days - 1, // periodSecBeforeMaturity < 14
    isDanger: false, // solidBondStrikePrice * 2.5 < rateETH2USD && untilMaturity < 2 weeks
  },
  {
    errorMessage: "",
    rateETH2USD: 250,
    solidBondStrikePriceUSD: 100, // rateETH2USD <= solidBondStrikePrice * 2.5
    volatility: 2.00000001, // volatility > 2
    periodSecBeforeMaturity: 14 * days - 1, // periodSecBeforeMaturity < 84
    isDanger: true, // volatility > 2
  },
  {
    errorMessage: "",
    rateETH2USD: 250,
    solidBondStrikePriceUSD: 100, // rateETH2USD <= solidBondStrikePrice * 2.5
    volatility: 2, // volatility <= 2
    periodSecBeforeMaturity: 84 * days, // periodSecBeforeMaturity >= 84
    isDanger: true, // periodSecBeforeMaturity >= 84
  },
];

const testCases = {isDangerSolidBond, isInEmergency};
export default testCases;
