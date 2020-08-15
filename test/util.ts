import {BigNumber} from "bignumber.js";
import BN from "bn.js";
import Web3 from "web3";

declare const web3: Web3;

export const DECIMALS_OF_STRIKE_PRICE = 4;
export const DECIMALS_OF_BOND_AMOUNT = 8;
export const DECIMALS_OF_IDOL_AMOUNT = 8;
export const DECIMALS_OF_BOND_VALUE =
  DECIMALS_OF_BOND_AMOUNT + DECIMALS_OF_STRIKE_PRICE;
export const DECIMALS_OF_ETH2USD_RATE = 8;
export const DECIMALS_OF_VOLATILITY = 8;

export const days = 86400;

export const nullAddress = "0x0000000000000000000000000000000000000000";

export const noLowestLoseBidPrice = new BigNumber(2)
  .pow(64)
  .minus(1)
  .shiftedBy(-8)
  .toString(10); // (2**64-1) >> 8

function hasSendFunction(
  arg: any
): arg is Exclude<Web3["currentProvider"], string | number | null> {
  return typeof arg.send === "function";
}

export async function advanceTime(seconds: number) {
  return await new Promise((resolve, reject) => {
    const currentProvider = web3.currentProvider;
    if (!hasSendFunction(currentProvider)) {
      throw new Error("provider was not found");
    }

    const {send} = currentProvider;
    if (send === undefined) {
      throw new Error("provider was not found");
    }

    send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [seconds],
        id: new Date().getTime().toString(),
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export async function mineOneBlock() {
  return await new Promise((resolve, reject) => {
    const currentProvider = web3.currentProvider;
    if (!hasSendFunction(currentProvider)) {
      throw new Error("provider was not found");
    }

    const {send} = currentProvider;
    if (send === undefined) {
      throw new Error("provider was not found");
    }

    send(
      {
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: new Date().getTime().toString(),
      },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export async function getBlockTimestampSec() {
  // await mineOneBlock();
  const block = await web3.eth.getBlock("latest");
  const timestamp = Number(block.timestamp);
  if (Number.isNaN(timestamp)) {
    throw new Error("block timestamp was not a number");
  }

  return timestamp;
}

export const LineSegmentStructure = {
  x1: "uint64",
  y1: "uint64",
  x2: "uint64",
  y2: "uint64",
};

export type FlattenLineSegment = [
  BigNumber.Value,
  BigNumber.Value,
  BigNumber.Value,
  BigNumber.Value
];

export interface LineSegment {
  x1: BigNumber.Value;
  y1: BigNumber.Value;
  x2: BigNumber.Value;
  y2: BigNumber.Value;
}

// const abiEncode: (type: any, value: any) => string = web3.eth.abi.encodeParameter;

export function assertBondGroup(polylines: FlattenLineSegment[][]) {
  const breakpoints = polylines.reduce(
    (acc: {[bp: string]: boolean}, polyline) => {
      polyline.forEach((segment) => {
        acc[new BigNumber(segment[2]).toString()] = true;
      });
      return acc;
    },
    {}
  );

  Object.keys(breakpoints).forEach((breakpoint) => {
    const x = new BigNumber(breakpoint);
    const sumOfY = polylines.reduce(
      (acc, polyline) => {
        const goodSegments = polyline.filter((segment) => x.gte(segment[0]));
        const goodSegment = goodSegments[goodSegments.length - 1];
        const x1 = new BigNumber(goodSegment[0]);
        const y1 = new BigNumber(goodSegment[1]);
        const x2 = new BigNumber(goodSegment[2]);
        const y2 = new BigNumber(goodSegment[3]);

        const n = x.minus(x1).times(y2).plus(x2.minus(x).times(y1));
        const d = x2.minus(x1);
        return {
          ...acc,
          n: acc.n.times(d).plus(acc.d.times(n)),
          d: acc.d.times(d),
        };
      },
      {n: new BigNumber(0), d: new BigNumber(1)}
    );

    if (!sumOfY.n.isEqualTo(x.times(sumOfY.d))) {
      const y = sumOfY.n.div(sumOfY.d);
      throw new Error(
        `The total bond price (${y}) at rate ${x} is not same with the rate ${x}.`
      );
    }
  });
}

export function parseCoordinate(segment: FlattenLineSegment) {
  const x1 = segment[0].toString();
  const y1 = segment[1].toString();
  const x2 = segment[2].toString();
  const y2 = segment[3].toString();
  return {x1, y1, x2, y2};
}

export function lineSegmentToFnMap(
  polyline: FlattenLineSegment[],
  decimal: number = 4
) {
  const ten = new BigNumber(10);
  const data = polyline.map((segment) => {
    const {x1, y1, x2, y2} = parseCoordinate(segment);
    const payload =
      web3.eth.abi
        .encodeParameter("uint64", ten.pow(decimal).times(x1).toString())
        .slice(-16) +
      web3.eth.abi
        .encodeParameter("uint64", ten.pow(decimal).times(y1).toString())
        .slice(-16) +
      web3.eth.abi
        .encodeParameter("uint64", ten.pow(decimal).times(x2).toString())
        .slice(-16) +
      web3.eth.abi
        .encodeParameter("uint64", ten.pow(decimal).times(y2).toString())
        .slice(-16);

    return "0x" + payload.padStart(64, "0");
  });

  return web3.eth.abi.encodeParameter("bytes32[]", data) as string;
}

export function fnMapToLineSegment(fnMap: string, decimal: number = 4) {
  const ten = new BigNumber(10);
  const lineSegments = web3.eth.abi.decodeParameter(
    "bytes32[]",
    fnMap
  ) as string[];

  return lineSegments.map((lineSegment) => {
    const x1 = (web3.eth.abi.decodeParameter(
      "uint64",
      "0x" + lineSegment.slice(-64, -48).padStart(64, "0")
    ) as any) as string;
    const y1 = (web3.eth.abi.decodeParameter(
      "uint64",
      "0x" + lineSegment.slice(-48, -32).padStart(64, "0")
    ) as any) as string;
    const x2 = (web3.eth.abi.decodeParameter(
      "uint64",
      "0x" + lineSegment.slice(-32, -16).padStart(64, "0")
    ) as any) as string;
    const y2 = (web3.eth.abi.decodeParameter(
      "uint64",
      "0x" + lineSegment.slice(-16).padStart(64, "0")
    ) as any) as string;

    return [
      ten.pow(-decimal).times(x1).toNumber(),
      ten.pow(-decimal).times(y1).toNumber(),
      ten.pow(-decimal).times(x2).toNumber(),
      ten.pow(-decimal).times(y2).toNumber(),
    ] as FlattenLineSegment;
  });
}

export function getBondTokenName(fnMap: string, maturity: Date) {
  const yearStr = maturity.getUTCFullYear().toString().padStart(2, "0");
  const monthStr = (maturity.getUTCMonth() + 1).toString().padStart(2, "0");
  const dayStr = maturity.getUTCDate().toString().padStart(2, "0");
  const shortDateString = monthStr + dayStr;
  const dateString = yearStr + monthStr + dayStr;
  const solidStrikePrice = getSolidStrikePrice(fnMap);
  const rateLBTWorthless = getRateLBTWorthless(fnMap);

  let shortName: string;
  let longName: string;
  if (!solidStrikePrice.isEqualTo(0)) {
    const symbolPrefix = "SBT";
    const namePrefix = "SBT";
    const strikePriceStr = Math.floor(
      new BigNumber(solidStrikePrice).toNumber()
    );
    const shortStrikePriceStr = strikePriceStr
      .toString()
      .padStart(4, "0")
      .slice(-4);
    shortName = symbolPrefix + shortDateString + "" + shortStrikePriceStr;
    longName = namePrefix + " " + dateString + " " + strikePriceStr;
  } else if (rateLBTWorthless !== 0) {
    const symbolPrefix = "LBT";
    const namePrefix = "LBT";
    const strikePriceStr = Math.floor(
      new BigNumber(rateLBTWorthless).toNumber()
    );
    const shortStrikePriceStr = strikePriceStr
      .toString()
      .padStart(4, "0")
      .slice(-4);
    shortName = symbolPrefix + shortDateString + "" + shortStrikePriceStr;
    longName = namePrefix + " " + dateString + " " + strikePriceStr;
  } else {
    const symbolPrefix = "IMT";
    const namePrefix = "Immortal Option";
    const shortStrikePriceStr = "0000";
    const strikePriceStr = "0";
    shortName = symbolPrefix + shortDateString + "" + shortStrikePriceStr;
    longName = namePrefix + " " + dateString + " " + strikePriceStr;
  }

  return [shortName, longName];
}

export function E4(USD: number): BigNumber {
  return new BigNumber(`${USD}e+4`);
}

export function E8(USD: number): BigNumber {
  return new BigNumber(`${USD}e+8`);
}

export function E18(ETH: number): BigNumber {
  return new BigNumber(`${ETH}e+18`);
}

export function ceil(num: number, decimal: number): number {
  return Math.ceil(num * Math.pow(10, decimal)) / Math.pow(10, decimal);
}

export function floor(num: number, decimal: number): number {
  return Math.floor(num * Math.pow(10, decimal)) / Math.pow(10, decimal);
}

export function calcFnMap(solidStrikePrice: BigNumber.Value) {
  const ssp = new BigNumber(solidStrikePrice);
  const zero = new BigNumber(0);
  const fnMapSolid = [
    [zero, zero, ssp, ssp] as FlattenLineSegment,
    [ssp, ssp, ssp.times(2), ssp] as FlattenLineSegment,
  ];
  const fnMapLiquid = [
    [zero, zero, ssp, zero] as FlattenLineSegment,
    [ssp, zero, ssp.times(2), ssp] as FlattenLineSegment,
  ];
  const fnMaps = [
    {fnMap: lineSegmentToFnMap(fnMapSolid)},
    {fnMap: lineSegmentToFnMap(fnMapLiquid)},
  ];

  return fnMaps;
}

export function getSolidStrikePrice(fnMap: string) {
  const polyline = fnMapToLineSegment(fnMap);
  if (!(polyline[0][0] === 0 && polyline[0][1] === 0)) {
    return new BigNumber(0);
  }

  const solidStrikePrice = polyline[1][0];
  for (let i = 1; i < polyline.length; i++) {
    if (polyline[i][1] !== solidStrikePrice) {
      return new BigNumber(0);
    }
  }

  return new BigNumber(solidStrikePrice);
}

export function getRateLBTWorthless(fnMap: string) {
  const polyline = fnMapToLineSegment(fnMap);
  if (!(polyline[0][0] === 0 && polyline[0][1] === 0)) {
    return 0;
  }

  const rateLBTWorthless = polyline[1][0];
  for (let i = 1; i < polyline.length; i++) {
    if (
      !new BigNumber(polyline[i][1])
        .plus(rateLBTWorthless)
        .isEqualTo(polyline[i][0])
    ) {
      return 0;
    }
  }

  return rateLBTWorthless;
}

export const fromStrikePrice = (amount: BigNumber.Value) =>
  new BigNumber(amount.toString())
    .shiftedBy(DECIMALS_OF_STRIKE_PRICE)
    .dividedToIntegerBy(1)
    .toString(10);

export const toStrikePrice = (amount: BigNumber.Value | BN) =>
  new BigNumber(amount.toString()).shiftedBy(-DECIMALS_OF_STRIKE_PRICE);

export const fromBTAmount = (amount: BigNumber.Value) =>
  new BigNumber(amount.toString())
    .shiftedBy(DECIMALS_OF_BOND_AMOUNT)
    .dividedToIntegerBy(1)
    .toString(10);

export const toBTAmount = (amount: BigNumber.Value | BN) =>
  new BigNumber(amount.toString()).shiftedBy(-DECIMALS_OF_BOND_AMOUNT);

export const fromIDOLAmount = (amount: BigNumber.Value) =>
  new BigNumber(amount.toString())
    .shiftedBy(DECIMALS_OF_IDOL_AMOUNT)
    .dividedToIntegerBy(1)
    .toString(10);

export const toIDOLAmount = (amount: BigNumber.Value | BN) =>
  new BigNumber(amount.toString()).shiftedBy(-DECIMALS_OF_IDOL_AMOUNT);

export const fromBTValue = (amount: BigNumber.Value) =>
  new BigNumber(amount.toString())
    .shiftedBy(DECIMALS_OF_BOND_VALUE)
    .dividedToIntegerBy(1)
    .toString(10);

export const toBTValue = (amount: BigNumber.Value | BN) =>
  new BigNumber(amount.toString()).shiftedBy(-DECIMALS_OF_BOND_VALUE);

export const fromEtherAmount = (amount: BigNumber.Value) =>
  web3.utils.toWei(new BigNumber(amount.toString()).toString(10), "ether");

export const toEtherAmount = (amount: BigNumber.Value | BN) =>
  new BigNumber(web3.utils.fromWei(amount.toString(10), "ether"));

export function fromBids(bids: {price: BigNumber.Value; boardIndex: number}[]) {
  const res = new Array<string>();
  bids
    .sort(
      (
        {price: price1, boardIndex: boardIndex1},
        {price: price2, boardIndex: boardIndex2}
      ) => {
        const priceComparison = new BigNumber(price2).comparedTo(price1);
        return priceComparison !== 0
          ? priceComparison
          : boardIndex1 - boardIndex2;
      }
    )
    .forEach(({price, boardIndex}) => {
      res.push(fromIDOLAmount(price));
      res.push(boardIndex.toString());
    });
  return res;
}

export function diff(test: () => Promise<BigNumber>) {
  return async (callback: (...params: any[]) => Promise<any>) => {
    const before = await test();
    await callback();
    const after = await test();
    return after.minus(before);
  };
}

export function diffs(test: () => Promise<BigNumber[]>) {
  return async (callback: (...params: any[]) => Promise<any>) => {
    const beforeList = await test();
    await callback();
    const afterList = await test();
    return beforeList.map((before, i) => {
      return afterList[i].minus(before);
    });
  };
}

export function encodeUtf8(str: string) {
  const hex =
    "0x" +
    str
      .split("")
      .map((char) => char.charCodeAt(0).toString(16))
      .join("");
  return hex;
}

export function decodeUtf8(hex: string) {
  const chars = new Array<string>();
  for (
    let a = hex.startsWith("0x") ? hex.slice("0x".length) : hex;
    a.length !== 0;
    a = a.slice(2)
  ) {
    chars.push(String.fromCharCode(Number("0x" + a.slice(0, 2))));
  }
  const str = chars.join("");
  return str;
}

export const counterFactory = () => {
  let i = 0;
  return () => {
    i++;
    return String(i) + ". ";
  };
};

export class MarkDownLogger {
  protected contents: string = "";
  protected NEWLINE_STR: string = "\n";
  protected TAB_STR: string = "    ";
  protected HEADER_MARK = "#";
  protected ITEM_MARK_LIST: (() => string)[] = [];
  protected NUM_OF_EMPTY_LINES_BEFORE_PARAGRAPH = 1;

  constructor(options?: {
    NEWLINE_STR?: string;
    TAB_STR?: string;
    format: (value: any) => string;
  }) {
    this.NEWLINE_STR = options?.NEWLINE_STR ?? this.NEWLINE_STR;
    this.TAB_STR = options?.TAB_STR ?? this.TAB_STR;
    this.format = options?.format ?? this.format;
  }

  print = () => {
    console.log(this.contents);
  };

  toString = () => {
    return this.contents;
  };

  protected format = (value: any) => {
    if (value instanceof BigNumber) {
      value.toString(10);
    } else if (value instanceof BN) {
      value.toString();
    } else if (typeof value === "object") {
      return JSON.stringify(value, null, this.TAB_STR);
    }
    return String(value);
  };

  protected indent = () => {
    const indentCount = Math.max(this.ITEM_MARK_LIST.length - 1, 0);
    this.contents =
      this.contents +
      Array.from({length: indentCount}, () => this.TAB_STR).join("") +
      (indentCount < this.ITEM_MARK_LIST.length
        ? this.ITEM_MARK_LIST[indentCount]()
        : "");
    return this;
  };

  concat = (...args: any[]) => {
    this.contents += args.map(this.format).join(" ");
    return this;
  };

  removeTooManyNewLine = () => {
    const numOfNewLine = this.NUM_OF_EMPTY_LINES_BEFORE_PARAGRAPH + 1;
    this.contents = this.contents.replace(
      new RegExp(this.NEWLINE_STR + `{${numOfNewLine + 1},}` + "$"),
      Array.from({length: numOfNewLine}, () => this.NEWLINE_STR).join("")
    );
    return this;
  };

  log = (...args: any[]) => {
    if (
      new RegExp("^" + `(${this.NEWLINE_STR})*` + this.HEADER_MARK).test(
        String(args[0])
      )
    ) {
      this.newParagraph();
    }
    return this.indent()
      .concat(...args)
      .br()
      .removeTooManyNewLine();
  };

  warn = this.log;

  error = this.log;

  header = (level: number, ...args: any[]) => {
    this.ITEM_MARK_LIST = [];
    return this.log(
      Array.from({length: level}, () => this.HEADER_MARK).join(""),
      ...args
    ).br();
  };

  h1 = (...args: any[]) => this.header(1, ...args);
  h2 = (...args: any[]) => this.header(2, ...args);
  h3 = (...args: any[]) => this.header(3, ...args);
  h4 = (...args: any[]) => this.header(4, ...args);
  h5 = (...args: any[]) => this.header(5, ...args);
  h6 = (...args: any[]) => this.header(6, ...args);

  br = () => {
    this.contents += this.NEWLINE_STR;
    return this;
  };

  newParagraph = () => {
    const numOfNewLine = this.NUM_OF_EMPTY_LINES_BEFORE_PARAGRAPH + 1;
    this.contents = this.contents.replace(
      new RegExp(`(${this.NEWLINE_STR})+` + "$"),
      Array.from({length: numOfNewLine}, () => this.NEWLINE_STR).join("")
    );
    return this;
  };

  itemizeStart = (options?: {markGenerator?: () => string}) => {
    this.ITEM_MARK_LIST.push(options?.markGenerator || (() => ""));
    return this;
  };

  itemizeEnd = () => {
    this.ITEM_MARK_LIST.pop();
    return this;
  };

  group = (...label: any[]) => {
    return this.log(...label).itemizeStart({markGenerator: () => this.TAB_STR});
  };

  groupEnd = this.itemizeEnd;

  codeStart = () => {
    return this.br().log("```");
  };

  codeEnd = () => {
    return this.log("```").br();
  };

  static a(text: string, href: string, title?: string) {
    return `[${text}](${href}${title ? ' "' + title + '"' : ""})`;
  }

  static strong(text: string) {
    return `**${text}**`;
  }

  static i(text: string) {
    return `_${text}_`;
  }

  static code(text: string) {
    return `\`${text}\``;
  }
}
