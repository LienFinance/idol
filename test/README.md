# test

This contains test scripts for contracts.

## ./

Contract-independent files with the exception of polyline.test.ts

| file             | desc                        |
| ---------------- | --------------------------- |
| init.ts          | Initializes contracts       |
| polyline.test.ts | Test script for PolyLine    |
| testCases.ts     | Contains various test cases |
| util.ts          | Contains utility functions  |

## auction/

| file                  | desc                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| auction.test.ts       | Script contains unit tests for following functions. <br/>`bid`, `cancelBid`, `generateSecret`, `revealBid`, `publishSettledAverageAuctionPrice`. |
| auction2.test.ts      | Script contains unit tests for `sortBidPrice` and `endAuction`.                                                                                  |
| auctionSecret.test.ts | Script contains unit tests for each function in AuctionSecret.                                                                                   |

## bondmaker/

| file               | desc                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| bondmaker.test.ts  | Script contains unit tests for following functions. <br/>`generateBondID`, `registerNewBond`, `getBond`         |
| bondmaker.test2.ts | Script contains unit tests for following functions <br>`registerNewBondGroup`, `issueNewBonds`, `liquidateBond` |
| bondmaker.test3.ts | Script contains unit tests for `getBondType`.                                                                   |
| callFunction.ts    | Call a contract function, get the result log and return it as the return value.                                 |

## bondToken/

| file              | desc                                                                            |
| ----------------- | ------------------------------------------------------------------------------- |
| bondToken.test.ts | Script contains unit tests for each function in `BondToken` contract.           |
| callFunction.ts   | Call a contract function, get the result log and return it as the return value. |

## scenario/

Test if the scenario envisaged by the use of the contract works well.

### pattern1/

It tests a series of scenarios that SBT and iDOLs as follows; from the registration of bonds to the issuance and unlocking of iDOLs, and the liquidation of receivables when maturity comes.

After running the scenario, verify that the ETH amount of the Bond converted by the liquidation of the bond is equal to the "expected" in the test case.

1. Register SBT and LBT.
2. Register bond group contains registered SBT and LBT in 1.
3. Issue bond group registered in 2.
4. Issue iDOL by locking SBT.
5. Burn iDOL and unlock SBT locked in 4.
6. Advance time until maturity and liquidate SBT and LBT.
7. Check ETH return amount.

### pattern3/

This will test a common auction scenario.

1. Register SBT and LBT, and layer them together to make a bond group. (registerNewBond, registerNewBondGroup)
2. Each account mints own SBT and iDOL. (issueNewBonds, mint)
3. Advance time to just before maturity of the SBT, and change ETH rate and its volatility
4. Start an auction for the SBT. (startAuctionOnMaturity, startAuctionByMarket)
5. Each account offer bid orders. (bidWithMemo)
6. Advance time until each bidder can reveal own bids
7. Each account reveal own bids. (revealBids)
8. Sort bid orders by their price. (sortBidPrice)
9. Calculate the lowest winner price. (makeEndInfo)
10. Each bidder receive SBT and iDOL decided by the auction results. (makeAuctionResult)
11. End the auction. If necessary, restart an auction for the SBT. (closeAuction)
12. Unlock the remainder of the pooled iDOL that were burned. (ReturnLockPool)

#### use preset test cases

Test the preset cases written in `test/scenario/pattern3/cases/`.

```sh
yarn test ./test/scenario/pattern3/index.test.ts
```

#### use additional test cases

Add test cases.

```sh
env JSON=/path/to/test_case.json yarn test:json
```

Make the JSON file in following format:

```jsonc
{
    "errorMessage": "", // The empty string means that no error occurs in this test.
    "users": [0, 1, 2],
    // Define a bond group.
    "bondGroups": [
        {
            "solidStrikePrice": 100, // The strike price of SBT belonged to this bond group is 100.0000 USD/SBT.
            "assets": {
                "1": {
                    "mintingBondAmount": 6, // Issue 6.00000000 SBT and 6.00000000 LBT.
                    "lockingSBTAmount": 6 // Lock 6.00000000 SBT to mint iDOL.
                },
                "2": {
                    "mintingBondAmount": 6,
                    "lockingSBTAmount": 6,
                    "burningIDOLValue": 100 // Burn iDOL  100.00000000 USD.
                }
            },
            "auctions": []
        },
        {
            "solidStrikePrice": 100,
            "assets": {
                "0": { "mintingBondAmount": 5, "lockingSBTAmount": 5 }
            },
            "auctions": [
                {
                    "priceType": "USD",
                    "bids": [
                        // Account 1 offer 3.00000000 SBT at 95.00000000 USD/SBT
                        // and reveal in the revealing period.
                        { "accountIndex": 1, "price": 95, "amount": 3, "random": 1 },
                        // Account 2 offer 2.00000000 SBT at 94.00000000 USD/SBT,
                        // but reveal the bid before the revealing period.
                        { "accountIndex": 2, "price": 94, "amount": 2, "random": 2, "early": true },
                        // Account 1 offer 2.00000000 SBT at 93.00000000 USD/SBT,
                        // and reveal in the revealing period.
                        { "accountIndex": 1, "price": 93, "amount": 2, "random": 3 },
                        // Account 2 offer 2.00000000 SBT at 92.00000000 USD/SBT,
                        // but reveal the bid after the revealing period.
                        {
                            "accountIndex": 2,
                            "price": 92,
                            "amount": 2,
                            "random": 4,
                            "unrevealed": true
                        }
                    ],
                    "actions": {
                        "1": {
                            // the parameters of makeAuctionResult()
                            "result": {
                                "myLowestPrice": 93,
                                "myWinBids": [{ "price": 95, "boardIndex": 0 }],
                                "myLoseBids": [
                                    { "price": 95, "boardIndex": 0 },
                                    { "price": 93, "boardIndex": 0 }
                                ]
                            }
                        },
                        "2": {
                            "result": {
                                "myLowestPrice": "NO_LOWEST_LOSE_BID_PRICE", // alias of uint64(-1)
                                "myWinBids": [{ "price": 100, "boardIndex": 0 }],
                                "myLoseBids": []
                            }
                        }
                    }
                }
            ]
        }
    ]
}
```

## solidBondSafety/

| file                      | desc                                                |
| ------------------------- | --------------------------------------------------- |
| isDangerSolidBond.test.ts | Script contains unit tests for `isDangerSolidBond`. |
| isInEmergency.test.ts     | Script contains unit tests for `isInEmergency`.     |

## stablecoin/

| file               | desc                                                                            |
| ------------------ | ------------------------------------------------------------------------------- |
| callFunction.ts    | Call a contract function, get the result log and return it as the return value. |
| stablecoin.test.ts | Script contains unit tests for each function in `StableCoin` contract.          |
