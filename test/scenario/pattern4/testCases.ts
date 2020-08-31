import {BigNumber} from "bignumber.js";
import {days} from "../../util";
import {
  NO_LOWEST_LOSE_BID_PRICE,
  UPPER_BID_PRICE_LIMIT,
} from "../pattern3/utils";

/**
 * @param invalidMyLowestPrice is true if myWinBids and myLoseBids is valid and myLowestPrice is invalid.
 */
type AuctionResult = {
  invalidMyLowestPrice?: boolean;
  myLowestPrice:
    | BigNumber.Value
    | typeof NO_LOWEST_LOSE_BID_PRICE
    | typeof UPPER_BID_PRICE_LIMIT; // unit: iDOL/BT, dp: 8
  myLoseBids: {
    boardIndex: number;
    price: BigNumber.Value; // unit: iDOL/BT, dp: 8
  }[];
  myWinBids: {
    boardIndex: number;
    price: BigNumber.Value; // unit: iDOL/BT, dp: 8
  }[];
};

type AuctionInfo = {
  priceType?: "iDOL" | "USD";
  bids: {
    accountIndex: number;
    price: BigNumber.Value;
    amount: BigNumber.Value;
    random?: BigNumber.Value;
    early?: boolean;
    unrevealed?: boolean;
  }[];
  actions: {
    [accountIndex: string]: {
      result: null | AuctionResult;
    };
  };
};

interface AuctionInfoIDOL extends AuctionInfo {
  priceType: "iDOL";
}

type EtherStatus = {
  untilMaturity?: number;
  rateETH2USD: BigNumber.Value; // unit: USD/ETH, dp: 8
  volatility: BigNumber.Value; // unit: 1, dp: 8
};

/**
 * @param etherStatus can simulate the ETH rate when executing a certain action.
 */
type Pattern4BondGroup = {
  solidStrikePrice: BigNumber.Value; // unit: USD/BT, dp: 4
  untilMaturity?: number;
  schedules: {
    assets: {
      [accountIndex: string]: {
        mintingBondAmount: BigNumber.Value; // unit: BT, dp: 8
        lockingSBTAmount: BigNumber.Value; // unit: BT, dp: 8
        burningIDOLValue?: BigNumber.Value; // unit: USD, dp: 12
      };
    };
    etherStatus?: {
      beforeMintingBonds?: EtherStatus;
      beforeStartingAuction?: EtherStatus;
    };
    auctions: AuctionInfo[];
  }[];
};

/**
 * @param errorMessage is the error message encountered at first. It is the empty string if no error occurs.
 * @param users is the indices of accounts whose balance of iDOL and SBT track.
 */
export type Pattern4TestCase = {
  abstraction?: string;
  errorMessage: string;
  users: number[];
  bondGroups: Pattern4BondGroup[];
};

const pat4case0: Pattern4TestCase = {
  errorMessage: "",
  users: [1, 2],
  bondGroups: [
    {
      solidStrikePrice: 100,
      schedules: [
        {
          assets: {
            "1": {mintingBondAmount: 3, lockingSBTAmount: 3},
            "2": {mintingBondAmount: 3, lockingSBTAmount: 3},
          },
          auctions: [],
        },
      ],
    },
    {
      solidStrikePrice: 100,
      untilMaturity: 17 * days,
      schedules: [
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 16 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 15 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "1": {mintingBondAmount: 3, lockingSBTAmount: 3},
            "2": {mintingBondAmount: 2, lockingSBTAmount: 2},
          },
          auctions: [
            {
              bids: [
                {accountIndex: 1, price: 95, amount: 3, random: 1},
                {accountIndex: 2, price: 94, amount: 2, random: 2},
                {accountIndex: 1, price: 93, amount: 2, random: 3},
                {accountIndex: 2, price: 92, amount: 2, random: 4},
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: 93,
                    myWinBids: [{price: 95, boardIndex: 0}],
                    myLoseBids: [{price: 93, boardIndex: 0}],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [{price: 94, boardIndex: 0}],
                    myLoseBids: [{price: 92, boardIndex: 0}],
                  },
                },
              },
            },
          ],
        },
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 6 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 5 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "1": {mintingBondAmount: 3, lockingSBTAmount: 3},
            "2": {mintingBondAmount: 2, lockingSBTAmount: 2},
          },
          auctions: [
            {
              bids: [
                {accountIndex: 1, price: 95, amount: 3, random: 1},
                {accountIndex: 2, price: 94, amount: 2, random: 2},
                {accountIndex: 1, price: 93, amount: 2, random: 3},
                {accountIndex: 2, price: 92, amount: 2, random: 4},
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: 93,
                    myWinBids: [{price: 95, boardIndex: 0}],
                    myLoseBids: [{price: 93, boardIndex: 0}],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [{price: 94, boardIndex: 0}],
                    myLoseBids: [{price: 92, boardIndex: 0}],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

const pat4case1: Pattern4TestCase = {
  errorMessage: "",
  users: [1, 2],
  bondGroups: [
    {
      solidStrikePrice: 100,
      schedules: [
        {
          assets: {
            "1": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
            "2": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
          },
          auctions: [],
        },
      ],
    },
    {
      solidStrikePrice: 100,
      untilMaturity: 17 * days,
      schedules: [
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 16 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 15 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "1": {
              mintingBondAmount: 3.5,
              lockingSBTAmount: 3.5,
            },
            "2": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
          },
          auctions: [
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    invalidMyLowestPrice: true,
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 6 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 5 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "1": {
              mintingBondAmount: 3.5,
              lockingSBTAmount: 3.5,
            },
            "2": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
          },
          auctions: [
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              priceType: "USD",
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    invalidMyLowestPrice: true,
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
const pat4case2: Pattern4TestCase = {
  abstraction:
    "Test to ensure that each account redeems the precise amount from iDOL pool when someone unlocks SBT.",
  errorMessage: "",
  users: [1, 2],
  bondGroups: [
    {
      solidStrikePrice: 100,
      schedules: [
        {
          assets: {
            "1": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
            "2": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
          },
          auctions: [],
        },
      ],
    },
    {
      solidStrikePrice: 100,
      schedules: [
        {
          assets: {
            "1": {
              mintingBondAmount: 3.5,
              lockingSBTAmount: 3.5,
            },
            "2": {
              mintingBondAmount: 5.0,
              lockingSBTAmount: 5.0,
            },
          },
          auctions: [
            {
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
            {
              bids: [
                {
                  accountIndex: 1,
                  price: 93,
                  amount: 1.0,
                  random: 1,
                },
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 1.0,
                  random: 2,
                },
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 1.0,
                  random: 3,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {
                        price: 93,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: 92,
                    myWinBids: [
                      {
                        price: 94,
                        boardIndex: 0,
                      },
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                    myLoseBids: [
                      {
                        price: 92,
                        boardIndex: 0,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      solidStrikePrice: 100,
      schedules: [
        {
          assets: {
            "1": {mintingBondAmount: 6, lockingSBTAmount: 6},
            "2": {mintingBondAmount: 6, lockingSBTAmount: 6},
          },
          auctions: [],
        },
      ],
    },
    {
      solidStrikePrice: 100,
      untilMaturity: 17 * days,
      schedules: [
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 16 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 15 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "0": {
              mintingBondAmount: 6,
              lockingSBTAmount: 6,
              burningIDOLValue: 100,
            },
          },
          auctions: [
            {
              priceType: "USD",
              bids: [
                {accountIndex: 1, price: 95, amount: 3, random: 1},
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 2,
                  random: 2,
                  early: true,
                },
                {accountIndex: 1, price: 93, amount: 2, random: 3},
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 2,
                  random: 4,
                  unrevealed: true,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: 93,
                    myWinBids: [{price: 95, boardIndex: 0}],
                    myLoseBids: [
                      {price: 95, boardIndex: 0},
                      {price: 93, boardIndex: 0},
                    ],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {price: "UPPER_BID_PRICE_LIMIT", boardIndex: 0},
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
          ],
        },
        {
          etherStatus: {
            beforeMintingBonds: {
              untilMaturity: 6 * days,
              rateETH2USD: 200,
              volatility: 0,
            },
            beforeStartingAuction: {
              untilMaturity: 5 * days,
              rateETH2USD: 100,
              volatility: 1,
            },
          },
          assets: {
            "0": {
              mintingBondAmount: 6,
              lockingSBTAmount: 6,
              burningIDOLValue: 100,
            },
          },
          auctions: [
            {
              priceType: "USD",
              bids: [
                {accountIndex: 1, price: 95, amount: 3, random: 1},
                {
                  accountIndex: 2,
                  price: 94,
                  amount: 2,
                  random: 2,
                  early: true,
                },
                {accountIndex: 1, price: 93, amount: 2, random: 3},
                {
                  accountIndex: 2,
                  price: 92,
                  amount: 2,
                  random: 4,
                  unrevealed: true,
                },
              ],
              actions: {
                "1": {
                  result: {
                    myLowestPrice: 93,
                    myWinBids: [{price: 95, boardIndex: 0}],
                    myLoseBids: [
                      {price: 95, boardIndex: 0},
                      {price: 93, boardIndex: 0},
                    ],
                  },
                },
                "2": {
                  result: {
                    myLowestPrice: "NO_LOWEST_LOSE_BID_PRICE",
                    myWinBids: [
                      {price: "UPPER_BID_PRICE_LIMIT", boardIndex: 0},
                    ],
                    myLoseBids: [],
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

export const pat4cases = [pat4case0, pat4case1, pat4case2];
