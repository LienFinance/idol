import {
  lineSegmentToFnMap,
  days,
  FlattenLineSegment,
  assertBondGroup,
} from "./util";
import {BigNumber} from "bignumber.js";
import {Pattern3TestCase} from "./scenario/pattern3/utils";

const BN = BigNumber;

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

const auctionIDList = [
  "0xd512dcc04c148e00a9ed8c4b8f3fc930d54ff841e58d0923b19f504717aecc66",
  "0x692b69ed857cf210706dca48eebdf766504c3950dad35c5a67f6e9a258715d12",
];

const testCases = {
  BondMaker: {
    generateBondID: [
      {
        success: true,
        maturity: 0,
        fnMap: fnMapSolid1,
        bondID:
          "0x50eb17bb96454ca9674fa37f077ac7e37b34b66d52e12dcca25e1236764201a3",
      },
    ],
    registerNewBond: [
      {
        errorMessage: "",
        periodSecBeforeMaturity: 4 * days,
        fnMap: fnMapSolid1,
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 46,
        fnMap: fnMapSolid1,
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 4 * days,
        fnMap: fnMapLiquid1,
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 4 * days,
        fnMap: fnMapImmortal1,
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
          "Returned error: VM Exception while processing transaction: revert failed to burn bond token -- Reason given: failed to burn bond token.",
        mintSBTAmount: "0.01",
        burnSBTAmount: "0.011",
        expired: false,
      },
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert the maturity has already expired -- Reason given: the maturity has already expired.",
        mintSBTAmount: "0.01",
        burnSBTAmount: "0.01",
        expired: true,
      },
    ],
    exchangeEquivalentBonds: [
      {
        errorMessage: "",
        periodSecBeforeMaturity: 3 * days,
        inputBondGroup: {
          fnMaps: [fnMapSolid2, fnMapLiquid2],
        },
        outputBondGroup: {
          fnMaps: [
            lineSegmentToFnMap([
              [0, 0, 100, 100],
              [100, 100, 240, 140],
            ]),
            lineSegmentToFnMap([
              [0, 0, 100, 0],
              [100, 0, 240, 60],
            ]),
            lineSegmentToFnMap([
              [0, 0, 100, 0],
              [100, 0, 240, 40],
            ]),
          ],
        },
        mintingAmount: "0.01",
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 3 * days,
        inputBondGroup: {
          fnMaps: [fnMapSolid2, fnMapLiquid2],
        },
        outputBondGroup: {
          fnMaps: [fnMapSolid2, fnMapImmortal1, fnMapImmortal2, fnMapImmortal3],
        },
        mintingAmount: "0.01",
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 3 * days,
        inputBondGroup: {
          fnMaps: [fnMapSolid2, fnMapImmortal1, fnMapImmortal2, fnMapImmortal3],
        },
        outputBondGroup: {
          fnMaps: [fnMapSolid2, fnMapImmortal1, fnMapImmortal2, fnMapImmortal3],
        },
        mintingAmount: "0.01",
      },
      {
        errorMessage: "",
        periodSecBeforeMaturity: 3 * days,
        inputBondGroup: {
          fnMaps: [
            lineSegmentToFnMap([
              [0, 0, 100, 100],
              [100, 100, 200, 100],
              [200, 100, 240, 100],
            ]),
            lineSegmentToFnMap([
              [0, 0, 5, 0],
              [5, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 10, 0],
              [10, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 15, 0],
              [15, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 20, 0],
              [20, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 25, 0],
              [25, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 30, 0],
              [30, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 35, 0],
              [35, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 40, 0],
              [40, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 45, 0],
              [45, 0, 100, 0],
              [100, 0, 200, 5],
            ]),
            lineSegmentToFnMap([
              [0, 0, 100, 0],
              [100, 0, 200, 55],
            ]),
          ],
        },
        outputBondGroup: {
          fnMaps: [
            lineSegmentToFnMap([
              [0, 0, 100, 100],
              [100, 100, 200, 100],
            ]),
            lineSegmentToFnMap([
              [0, 0, 100, 0],
              [100, 0, 200, 100],
              [200, 100, 300, 0],
              [300, 0, 400, 300],
              [400, 300, 500, 0],
              [500, 0, 600, 500],
              [600, 500, 700, 0],
              [700, 0, 800, 700],
              [800, 700, 900, 0],
              [900, 0, 1000, 900],
              [1000, 900, 1100, 0],
              [1100, 0, 1200, 1100],
              [1200, 1100, 1300, 0],
              [1300, 0, 1400, 1300],
              [1400, 1300, 1500, 0],
              [1500, 0, 1600, 1500],
              [1600, 1500, 1700, 0],
              [1700, 0, 1800, 1700],
              [1800, 1700, 1900, 0],
              [1900, 0, 2000, 1900],
              [2000, 1900, 2100, 0],
              [2100, 0, 2200, 2100],
              [2200, 2100, 2300, 0],
              [2300, 0, 2400, 2300],
              [2400, 2300, 2500, 0],
              [2500, 0, 2600, 2500],
              [2600, 2500, 2700, 0],
              [2700, 0, 2800, 2700],
              [2800, 2700, 2900, 0],
              [2900, 0, 3000, 2900],
              [3000, 2900, 3100, 0],
              [3100, 0, 3200, 0],
            ]),
            lineSegmentToFnMap([
              [0, 0, 200, 0],
              [200, 0, 300, 200],
              [300, 200, 400, 0],
              [400, 0, 500, 400],
              [500, 400, 600, 0],
              [600, 0, 700, 600],
              [700, 600, 800, 0],
              [800, 0, 900, 800],
              [900, 800, 1000, 0],
              [1000, 0, 1100, 1000],
              [1100, 1000, 1200, 0],
              [1200, 0, 1300, 1200],
              [1300, 1200, 1400, 0],
              [1400, 0, 1500, 1400],
              [1500, 1400, 1600, 0],
              [1600, 0, 1700, 1600],
              [1700, 1600, 1800, 0],
              [1800, 0, 1900, 1800],
              [1900, 1800, 2000, 0],
              [2000, 0, 2100, 2000],
              [2100, 2000, 2200, 0],
              [2200, 0, 2300, 2200],
              [2300, 2200, 2400, 0],
              [2400, 0, 2500, 2400],
              [2500, 2400, 2600, 0],
              [2600, 0, 2700, 2600],
              [2700, 2600, 2800, 0],
              [2800, 0, 2900, 2800],
              [2900, 2800, 3000, 0],
              [3000, 0, 3100, 3000],
              [3100, 3000, 3200, 3100],
            ]),
          ],
        },
        mintingAmount: "0.01",
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
          periodSecBeforeMaturity: 4 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 4 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 4 * days,
            fnMap: fnMapLiquid1,
          },
        ],
        bondGroupID: "1",
      },
      {
        errorMessage:
          "Returned error: VM Exception while processing transaction: revert the maturity of the bonds must be same -- Reason given: the maturity of the bonds must be same.",
        bondGroup: {
          periodSecBeforeMaturity: 4 * days,
        },
        bondTypes: [
          {
            periodSecBeforeMaturity: 4 * days,
            fnMap: fnMapSolid1,
          },
          {
            periodSecBeforeMaturity: 4 * days + 1,
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
              auctionID: auctionIDList[0],
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
              auctionID: auctionIDList[0],
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
              auctionID: auctionIDList[1],
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
          [auctionIDList[0]],
          [auctionIDList[0], auctionIDList[1]],
          [auctionIDList[1]],
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
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.10000000", amount: 1},
                  {accountIndex: 2, price: "90.20000000", amount: 1},
                  {accountIndex: 1, price: "90.30000000", amount: 1},
                  {accountIndex: 2, price: "90.40000000", amount: 1},
                  {accountIndex: 1, price: "90.50000000", amount: 1},
                  {accountIndex: 2, price: "90.60000000", amount: 1},
                  {accountIndex: 1, price: "90.70000000", amount: 1},
                  {accountIndex: 2, price: "90.80000000", amount: 1},
                  {accountIndex: 1, price: "90.90000000", amount: 1},
                  {accountIndex: 2, price: "91.00000000", amount: 1},
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
        errorMessage: "",
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
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
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
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                  {accountIndex: 2, price: "90.00000000", amount: 1},
                  {accountIndex: 1, price: "90.00000000", amount: 1},
                ],
                actions: {
                  "1": {
                    result: {
                      myLowestPrice: "90.00000000",
                      myWinBids: [
                        {price: "90.00000000", boardIndex: 0},
                        {price: "90.00000000", boardIndex: 2},
                        {price: "90.00000000", boardIndex: 4},
                        {price: "90.00000000", boardIndex: 6},
                        {price: "90.00000000", boardIndex: 8},
                      ],
                      // In the case of too many bids at the lowest winner price,
                      // the end board index may be less than expected.
                      // The max board index at the lowest winner price is 9 in this test,
                      // so this bid is not a winner bid.
                      myLoseBids: [{price: "90.00000000", boardIndex: 10}],
                    },
                  },
                  "2": {
                    result: {
                      myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                      myWinBids: [
                        {price: "90.00000000", boardIndex: 1},
                        {price: "90.00000000", boardIndex: 3},
                        {price: "90.00000000", boardIndex: 5},
                        {price: "90.00000000", boardIndex: 7},
                        {price: "90.00000000", boardIndex: 9},
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
      manyPriceIndex: {
        errorMessage: "",
        users: [0, 1, 2],
        bondGroups: [
          {
            solidStrikePrice: 100,
            assets: {
              "1": {
                mintingBondAmount: 11.2,
                lockingSBTAmount: 11.2,
              },
              "2": {
                mintingBondAmount: 11.2,
                lockingSBTAmount: 11.2,
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
                bids: [
                  {
                    accountIndex: 1,
                    amount: 3.3,
                    bidInfoList: Array.from({length: 33}, (_v, i) => ({
                      price: 96.7 + 0.1 * i,
                      amount: 0.1,
                    })),
                  },
                  {
                    accountIndex: 1,
                    amount: 6.7,
                    bidInfoList: Array.from({length: 67}, (_v, i) => ({
                      price: 90 + 0.1 * i,
                      amount: 0.1,
                    })),
                  },
                  {
                    accountIndex: 2,
                    amount: 3.3,
                    bidInfoList: Array.from({length: 33}, (_v, i) => ({
                      price: 96.7 + 0.1 * i,
                      amount: 0.1,
                    })),
                  },
                  {
                    accountIndex: 2,
                    amount: 6.7,
                    bidInfoList: Array.from({length: 67}, (_v, i) => ({
                      price: 90 + 0.1 * i,
                      amount: 0.1,
                    })),
                  },
                ],
                actions: {
                  "1": {
                    result: {
                      myLowestPrice: "99.00000000",
                      myLoseBids: Array.from({length: 95}, (_v, i) => ({
                        price: 90 + 0.1 * i,
                        boardIndex: 0,
                      })),
                      myWinBids: [
                        {price: "99.50000000", boardIndex: 0},
                        {price: "99.60000000", boardIndex: 0},
                        {price: "99.70000000", boardIndex: 0},
                        {price: "99.80000000", boardIndex: 0},
                        {price: "99.90000000", boardIndex: 0},
                      ],
                    },
                  },
                  "2": {
                    result: {
                      myLowestPrice: "99.00000000",
                      myLoseBids: Array.from({length: 95}, (_v, i) => ({
                        price: 90 + 0.1 * i,
                        boardIndex: 1,
                      })),
                      myWinBids: [
                        {price: "99.50000000", boardIndex: 1},
                        {price: "99.60000000", boardIndex: 1},
                        {price: "99.70000000", boardIndex: 1},
                        {price: "99.80000000", boardIndex: 1},
                        {price: "99.90000000", boardIndex: 1},
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      } as Pattern3TestCase,
      manyBoardIndex: {
        errorMessage: "",
        users: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        bondGroups: [
          {
            solidStrikePrice: 100,
            assets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].reduce<{
              [accountIndex: string]: {
                mintingBondAmount: number;
                lockingSBTAmount: number;
              };
            }>((acc, accountIndex) => {
              acc[accountIndex.toString()] = {
                mintingBondAmount: 11.2,
                lockingSBTAmount: 11.2,
              };
              return acc;
            }, {}),
            auctions: [],
          },
          {
            solidStrikePrice: 100,
            assets: {
              "0": {mintingBondAmount: 100, lockingSBTAmount: 99.9},
            },
            auctions: [
              {
                bids: Array.from({length: 20}, (_v, i) => ({
                  accountIndex: Math.floor(i / 2),
                  amount: 5,
                  bidInfoList: Array.from({length: 50}, (_v) => ({
                    price: 95,
                    amount: 0.1,
                  })),
                })),
                actions: {
                  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].reduce<{
                    [accountIndex: string]: {
                      result: any;
                    };
                  }>((acc, accountIndex) => {
                    acc[accountIndex.toString()] = {
                      result: {
                        myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                        myWinBids: Array.from({length: 100}, (_v, i) => ({
                          price: 95,
                          boardIndex: accountIndex * 100 + i,
                        })),
                        myLoseBids: [],
                      },
                    };
                    return acc;
                  }, {}),
                  "9": {
                    result: {
                      myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                      myWinBids: Array.from({length: 49}, (_v, i) => ({
                        price: 95,
                        boardIndex: 900 + i,
                      })),
                      myLoseBids: [
                        {
                          price: 95,
                          boardIndex: 949,
                        },
                      ],
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
