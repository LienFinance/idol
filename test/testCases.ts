import {
  nullAddress,
  lineSegmentToFnMap,
  days,
  FlattenLineSegment,
  assertBondGroup,
} from "./util";
import {BigNumber} from "bignumber.js";
import {Pattern3TestCase} from "./scenario/pattern3/utils";

const BN = BigNumber;

const unixTimeSecNow = 0 * days;
const unixTimeSecOneDayLater = 1 * days;

const lineSegmentList = [
  [0, 0, 100, 100], // 0
  [100, 100, 200, 100], // 1
  [0, 0, 100, 0],
  [100, 0, 200, 100],
  [0, 0, 120, 120], // 4
  [120, 120, 240, 120], // 5
  [0, 0, 120, 0], // 6
  [120, 0, 240, 120], // 7
  [120, 0, 240, 0],
  [240, 0, 360, 120],
  [120, 0, 240, 60],
  [240, 60, 360, 120],
  [360, 120, 480, 120],
  [240, 60, 360, 0],
  [360, 0, 480, 0],
  [100000.0001, 100000.0003, 100000.0005, 100000.0007],
] as FlattenLineSegment[];

export const fnMapSolid1 = lineSegmentToFnMap([
  lineSegmentList[0],
  lineSegmentList[1],
]);
export const fnMapLiquid1 = lineSegmentToFnMap([
  lineSegmentList[2],
  lineSegmentList[3],
]);

assertBondGroup([
  [lineSegmentList[0], lineSegmentList[1]],
  [lineSegmentList[2], lineSegmentList[3]],
]);

export const fnMapSolid2 = lineSegmentToFnMap([
  lineSegmentList[4],
  lineSegmentList[5],
]);
export const fnMapLiquid2 = lineSegmentToFnMap([
  lineSegmentList[6],
  lineSegmentList[7],
]);

// fnMapImmortal1, fnMapImmortal2 and fnMapImmortal3 is immortal options corresponding to fnMapSolid2.
export const fnMapImmortal1 = lineSegmentToFnMap([
  lineSegmentList[6],
  lineSegmentList[8],
  lineSegmentList[9],
]);
export const fnMapImmortal2 = lineSegmentToFnMap([
  lineSegmentList[6],
  lineSegmentList[10],
  lineSegmentList[11],
  lineSegmentList[12],
]);
export const fnMapImmortal3 = lineSegmentToFnMap([
  lineSegmentList[6],
  lineSegmentList[10],
  lineSegmentList[13],
  lineSegmentList[14],
]);

assertBondGroup([
  [lineSegmentList[4], lineSegmentList[5]],
  [lineSegmentList[6], lineSegmentList[7]],
]);

assertBondGroup([
  [lineSegmentList[4], lineSegmentList[5]],
  [lineSegmentList[6], lineSegmentList[8], lineSegmentList[9]],
  [
    lineSegmentList[6],
    lineSegmentList[10],
    lineSegmentList[11],
    lineSegmentList[12],
  ],
  [
    lineSegmentList[6],
    lineSegmentList[10],
    lineSegmentList[13],
    lineSegmentList[14],
  ],
]);

const addressList = ["0xAA14806cE5Ab8e55F04dd7EF038a5B26839B8651"];

const bondIDList = [
  "0x50eb17bb96454ca9674fa37f077ac7e37b34b66d52e12dcca25e1236764201a3",
  "0xbd20116eb6f14261f4a8cb2e5ede7dc2e23a76cef57fa2f3d2a77dd530c67e19",
  "0x817a240f34cdb467b0786fdd4bc87cc3677d71cceffc7a55b41578df688fe107",
  "0x5da32112abcdde26b6bfc592a94847f83269205831e0c64c5995fe507eaee5ca",
];

const secretList = [
  "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
  "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
];

const auctionIDList = [
  "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
  "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
];

const testCases = {
  BondMaker: {
    generateBondID: [
      {
        success: true,
        maturity: unixTimeSecNow,
        fnMap: fnMapSolid1,
        bondID: bondIDList[0],
      },
    ],
    registerNewBond: [
      {
        errorMessage: "",
        maturity: unixTimeSecNow,
        fnMap: fnMapSolid1,
        bondID: bondIDList[0],
      },
      {
        errorMessage: "",
        maturity: unixTimeSecOneDayLater,
        fnMap: fnMapSolid1,
        bondID: bondIDList[2],
      },
      {
        errorMessage: "",
        maturity: unixTimeSecNow,
        fnMap: fnMapLiquid1,
        bondID: bondIDList[3],
      },
      {
        errorMessage: "",
        maturity: unixTimeSecOneDayLater - 1,
        fnMap: fnMapImmortal1,
        bondID:
          "0x988545023035c4b17bb9d61e0ad19509464e8f8ab0e9c7352c947282490d136e",
      },
    ],
    reverseBondToETH: [
      {
        errorMessage: "",
        mintSBTAmount: "0.01",
        burnSBTAmount: "0.01",
        expired: false,
      },
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert insufficient bond token balance -- Reason given: insufficient bond token balance.",
        mintSBTAmount: "0.01",
        burnSBTAmount: "0.011",
        expired: false,
      },
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert already expired -- Reason given: already expired.",
        mintSBTAmount: "0.01",
        burnSBTAmount: "0.01",
        expired: true,
      },
    ],
    exchangeEquivalentBonds: [
      {
        errorMessage: "",
        BTAmount: "0.01",
      },
    ],
    getBond: [
      {
        maturity: unixTimeSecNow,
        stableStrikePrice: lineSegmentList[0][2],
        fnMap: fnMapSolid1,
        bondID: bondIDList[0],
      },
    ],
    getBondType: [
      {
        success: true,
        maturity: unixTimeSecNow,
        fnMap: fnMapSolid1,
        bondID: bondIDList[0],
      },
      {
        success: false,
        maturity: unixTimeSecNow,
        fnMap: fnMapSolid1,
        bondID: bondIDList[1],
      },
    ],
    testGetFnMapProperties: [
      {
        fnMap: fnMapSolid1,
        solidStrikePrice: "100.0000",
        rateLBTWorthless: "0.0000",
      },
      {
        fnMap: fnMapLiquid1,
        solidStrikePrice: "0.0000",
        rateLBTWorthless: "100.0000",
      },
      {
        fnMap: fnMapImmortal1,
        solidStrikePrice: "0.0000",
        rateLBTWorthless: "0.0000",
      },
    ],
    registerNewBondGroup: [
      {
        errorMessage: "",
        bondGroup: {
          maturity: unixTimeSecNow,
        },
        bondTypes: [
          {
            maturity: unixTimeSecNow,
            fnMap: fnMapSolid1,
          },
          {
            maturity: unixTimeSecNow,
            fnMap: fnMapLiquid1,
          },
        ],
        bondGroupID: "1",
      },
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert the maturity of the bonds must be same -- Reason given: the maturity of the bonds must be same.",
        bondGroup: {
          maturity: unixTimeSecNow,
        },
        bondTypes: [
          {
            maturity: unixTimeSecNow,
            fnMap: fnMapSolid1,
          },
          {
            maturity: unixTimeSecNow + 1,
            fnMap: fnMapLiquid1,
          },
        ],
        bondGroupID: "2",
      },
    ],
    issueNewBonds: [
      {
        success: true,
        underlyingAmount: 0.001,
      },
    ],
    liquidateBond: [
      {
        success: true,
        bondGroupID: "1",
        timestampLiquidate: unixTimeSecOneDayLater,
        returnedCollaterals: 0,
        price: "0",
      },
    ],
  },
  StableCoin: {
    isAcceptableSBT: [
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert maturity has passed or the time to mature is too short -- Reason given: maturity has passed or the time to mature is too short.",
        periodSecBeforeMaturity: 14 * days, // no more than AUCTION_SPAN (= 2 weeks)
        fnMap: fnMapSolid1,
        rateETH2USD: 200,
        volatility: 0,
        isAcceptable: false,
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 15 * days,
        fnMap: fnMapSolid1,
        rateETH2USD: 200,
        volatility: 0,
        isAcceptable: true,
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 15 * days,
        fnMap: fnMapSolid1,
        rateETH2USD: 90, // currently not acceptable
        volatility: 0,
        isAcceptable: false,
      },
    ],
    unlockSBT: [
      {
        errorMessage: "",
        success: true,
        bondGroup: {
          periodSecBeforeMaturity: 19 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapLiquid1,
          },
        ],
        lockAmount: 1.0,
        burnAmount: 90,
      },
      {
        errorMessage: "",
        success: false,
        bondGroup: {
          periodSecBeforeMaturity: 19 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapLiquid1,
          },
        ],
        lockAmount: 1.0,
        burnAmount: 0,
      },
      {
        errorMessage: "",
        success: true,
        bondGroup: {
          periodSecBeforeMaturity: 19 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapLiquid1,
          },
        ],
        lockAmount: 1.0,
        burnAmount: 89,
      },
      {
        errorMessage: "",
        success: false,
        bondGroup: {
          periodSecBeforeMaturity: 19 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 19 * days,
            fnMap: fnMapLiquid1,
          },
        ],
        lockAmount: 1.0,
        burnAmount: 91,
      },
    ],
  },
  Auction: {
    getWeeklyAuctionStatus: [
      {
        closingTime: {
          [auctionIDList[0]]: [
            {isEmergency: false, timestamp: 7 * days},
            {isEmergency: false, timestamp: 14 * days},
          ],
          [auctionIDList[1]]: [{isEmergency: false, timestamp: 21 * days}],
        },
        listingTime: {
          from: 0 * days,
          to: 21 * days,
        },
        output: [
          [],
          [
            {
              auctionID:
                "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
              closingTime: 1209600,
              auctionAmount: "0",
              rewardedAmount: "0",
              totalSBTAmountBid: "0",
              isEmergency: false,
              doneFinalizeWinnerAmount: false,
              doneSortPrice: false,
            },
          ],
          [
            {
              auctionID:
                "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
              closingTime: 1209600,
              auctionAmount: "0",
              rewardedAmount: "0",
              totalSBTAmountBid: "0",
              isEmergency: false,
              doneFinalizeWinnerAmount: false,
              doneSortPrice: false,
            },
          ],
          [
            {
              auctionID:
                "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
              closingTime: 1814400,
              auctionAmount: "0",
              rewardedAmount: "0",
              totalSBTAmountBid: "0",
              isEmergency: false,
              doneFinalizeWinnerAmount: false,
              doneSortPrice: false,
            },
          ],
        ],
      },
    ],
  },
  AuctionTimeControl: {
    listAuction: [
      {
        closingTime: {
          [auctionIDList[0]]: [
            {isEmergency: false, timestamp: 7 * days},
            {isEmergency: false, timestamp: 14 * days},
          ],
          [auctionIDList[1]]: [
            {isEmergency: false, timestamp: 21 * days},
            {isEmergency: false, timestamp: 14 * days},
          ],
        },
        listingTime: {
          from: 0 * days,
          to: 21 * days,
        },
        output: [
          [],
          [
            "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
          ],
          [
            "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
            "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
          ],
          [
            "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
          ],
        ],
      },
    ],
  },
  AuctionBoard: {
    revealBids: {
      maxPriceIndex: {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert price range exceeded -- Reason given: price range exceeded.",
        users: [0, 1, 2],
        bondGroups: [
          {
            solidStrikePrice: 100,
            assets: {
              "1": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
              "2": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
            },
            auctions: [],
          },
          {
            solidStrikePrice: 100,
            assets: {
              "0": {mintingBondAmount: 1, lockingSBTAmount: 1},
            },
            auctions: [
              {
                priceType: "USD",
                bids: [
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0100", amount: 1},
                  {accountIndex: 2, price: "90.0200", amount: 1},
                  {accountIndex: 1, price: "90.0300", amount: 1},
                  {accountIndex: 2, price: "90.0400", amount: 1},
                  {accountIndex: 1, price: "90.0500", amount: 1},
                  {accountIndex: 2, price: "90.0600", amount: 1},
                  {accountIndex: 1, price: "90.0700", amount: 1},
                  {accountIndex: 2, price: "90.0800", amount: 1},
                  {accountIndex: 1, price: "90.0900", amount: 1},
                  {accountIndex: 2, price: "90.1000", amount: 1},
                ],
                actions: {
                  "1": {result: null},
                  "2": {result: null},
                },
              },
            ],
          },
        ],
      } as Pattern3TestCase,
      maxBoardIndex: {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert too many bids -- Reason given: too many bids.",
        users: [0, 1, 2],
        bondGroups: [
          {
            solidStrikePrice: 100,
            assets: {
              "1": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
              "2": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
            },
            auctions: [],
          },
          {
            solidStrikePrice: 100,
            assets: {
              "0": {mintingBondAmount: 1, lockingSBTAmount: 1},
            },
            auctions: [
              {
                priceType: "USD",
                bids: [
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                ],
                actions: {
                  "1": {result: null},
                  "2": {result: null},
                },
              },
            ],
          },
        ],
      } as Pattern3TestCase,
      maxBoardIndexAtEndPrice: {
        errorMessage: "isLast differ from expected",
        users: [0, 1, 2],
        bondGroups: [
          {
            solidStrikePrice: 100,
            assets: {
              "1": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
              "2": {
                mintingBondAmount: 10,
                lockingSBTAmount: 10,
              },
            },
            auctions: [],
          },
          {
            solidStrikePrice: 100,
            assets: {
              "0": {mintingBondAmount: 11, lockingSBTAmount: 11},
            },
            auctions: [
              {
                priceType: "USD",
                bids: [
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                  {accountIndex: 2, price: "90.0000", amount: 1},
                  {accountIndex: 1, price: "90.0000", amount: 1},
                ],
                actions: {
                  "1": {
                    result: {
                      myLowestPrice: "90.0000",
                      myWinBids: [
                        {price: "90.0000", boardIndex: 0},
                        {price: "90.0000", boardIndex: 2},
                        {price: "90.0000", boardIndex: 4},
                        {price: "90.0000", boardIndex: 6},
                        {price: "90.0000", boardIndex: 8},
                      ],
                      // In the case of too many bids at the lowest winner price,
                      // the end board index may be less than expected.
                      // The max board index at the lowest winner price is 9 in this test,
                      // so this bid is not a winner bid.
                      myLoseBids: [{price: "90.0000", boardIndex: 10}],
                    },
                  },
                  "2": {
                    result: {
                      myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                      myWinBids: [
                        {price: "90.0000", boardIndex: 1},
                        {price: "90.0000", boardIndex: 3},
                        {price: "90.0000", boardIndex: 5},
                        {price: "90.0000", boardIndex: 7},
                        {price: "90.0000", boardIndex: 9},
                      ],
                      myLoseBids: [],
                    },
                  },
                },
              },
            ],
          },
        ],
      } as Pattern3TestCase,
    },
  },
  AuctionSecret: {},
  BondToken: {
    setRate: [
      {
        rateNumerator: new BN(2).pow(128).minus(1).toString(10),
        rateDenominator: "1",
        errorMessage: "",
      },
      {
        rateNumerator: "1",
        rateDenominator: new BN(2).pow(128).minus(1).toString(10),
        errorMessage: "",
      },
      {
        rateNumerator: "0",
        rateDenominator: "1",
        errorMessage: "",
      },
      {
        rateNumerator: "1",
        rateDenominator: "0",
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert system error: the exchange rate must be non-negative number -- Reason given: system error: the exchange rate must be non-negative number.",
      },
    ],
  },
  Polyline: {
    zip: [
      {
        unzipped: lineSegmentList[0],
        zipped:
          "0x0000000000000000000000000000000000000000000f424000000000000f4240",
      },
      {
        unzipped: lineSegmentList[1],
        zipped:
          "0x00000000000f424000000000000f424000000000001e848000000000000f4240",
      },
      {
        unzipped: lineSegmentList[15],
        zipped:
          "0x000000003b9aca01000000003b9aca03000000003b9aca05000000003b9aca07",
      },
    ],
    unzip: [
      {
        unzipped: lineSegmentList[0],
        zipped:
          "0x0000000000000000000000000000000000000000000f424000000000000f4240",
      },
      {
        unzipped: lineSegmentList[1],
        zipped:
          "0x00000000000f424000000000000f424000000000001e848000000000000f4240",
      },
      {
        unzipped: lineSegmentList[15],
        zipped:
          "0x000000003b9aca01000000003b9aca03000000003b9aca05000000003b9aca07",
      },
    ],
  },
  TestDigits: {
    testToDigitsString: [
      {
        value: "0",
        digits: "0",
        valueStr: "",
      },
      {
        value: "0",
        digits: "1",
        valueStr: "0",
      },
      {
        value: "0",
        digits: "2",
        valueStr: "00",
      },
      {
        value: "102",
        digits: "0",
        valueStr: "",
      },
      {
        value: "102",
        digits: "1",
        valueStr: "2",
      },
      {
        value: "102",
        digits: "2",
        valueStr: "02",
      },
      {
        value: "102",
        digits: "3",
        valueStr: "102",
      },
      {
        value: "102",
        digits: "4",
        valueStr: "0102",
      },
      {
        value: "102",
        digits: "5",
        valueStr: "00102",
      },
      {
        value: "102",
        digits: "77",
        valueStr: "102".padStart(77, "0"),
      },
      {
        value: "102",
        digits: "78",
        valueStr: "102".padStart(78, "0"),
      },
      {
        value: new BigNumber(2).pow(256).minus(1).toString(10),
        digits: "77",
        valueStr: new BigNumber(2)
          .pow(256)
          .minus(1)
          .minus(new BigNumber(10).pow(77))
          .toString(10),
      },
      {
        value: new BigNumber(2).pow(256).minus(1).toString(10),
        digits: "78",
        valueStr: new BigNumber(2).pow(256).minus(1).toString(10),
      },
      {
        value: new BigNumber(2).pow(256).minus(1).toString(10),
        digits: "79",
        valueStr: "0" + new BigNumber(2).pow(256).minus(1).toString(10),
      },
    ],
  },
  Wrapper: {
    registerBondAndBondGroup: [
      {
        periodSecBeforeMaturity: 20 * days,
        SBTfnMap: fnMapSolid1,
        LBTfnMap: fnMapLiquid1,
        expectBondGroupID: "1",
      },
      {
        periodSecBeforeMaturity: 24 * days,
        SBTfnMap: fnMapSolid1,
        LBTfnMap: fnMapLiquid1,
        expectBondGroupID: "2",
      },
    ],
    issueLBTAndIDOL: [
      {
        bondGroupID: "1",
        value: 0.01,
      },
      {
        bondGroupID: "2",
        value: 0.02,
      },
    ],
    returnLockedPool: [
      {pattern3TestCaseIndex: 2},
      {pattern3TestCaseIndex: 10},
      {pattern3TestCaseIndex: 15},
    ],
  },
};

export default testCases;
