import {
  BondMakerInstance,
  StableCoinInstance,
} from "../../../types/truffle-contracts";
import {callGetBond} from "../../bondmaker/callFunction";
import {
  toBTAmount,
  MarkDownLogger,
  counterFactory,
  toIDOLAmount,
} from "../../util";

const BondToken = artifacts.require("TestBondToken");

export function pat3Desc() {
  return new MarkDownLogger()
    .h1("Pattern 3 Test")
    .h2("Description")
    .log("This will test a common auction scenario.")
    .itemizeStart({markGenerator: counterFactory()})
    .log(
      "Register SBT and LBT, and layer them together to make a bond group.",
      "(registerNewBond, registerNewBondGroup)"
    )
    .log("Each account mints own SBT and iDOL.", "(issueNewBonds, mint)")
    .log(
      "Advance time to just before maturity of the SBT, and change ETH rate and its volatility"
    )
    .log(
      "Start an auction for the SBT. (startAuctionOnMaturity, startAuctionByMarket)"
    )
    .log("Each account offer bid orders.", "(bidWithMemo)")
    .log("Advance time until each bidder can reveal own bids")
    .log("Each account reveal own bids.", "(revealBids)")
    .log("Sort bid orders by their price.", "(sortBidPrice)")
    .log("Calculate the lowest winner price.", "(makeEndInfo)")
    .log(
      "Each bidder receive SBT and iDOL decided by the auction results.",
      "(makeAuctionResult)"
    )
    .log(
      "End the auction. If necessary, restart an auction for the SBT.",
      "(closeAuction)"
    )
    .log(
      "Unlock the remainder of the pooled iDOL that were burned.",
      "(ReturnLockPool)"
    )
    .itemizeEnd()
    .br()
    .toString();
}

export function balanceLoggerFactory(
  accounts: Truffle.Accounts,
  users: number[],
  IDOLContract: StableCoinInstance,
  bondMakerContract: BondMakerInstance
) {
  return async (name: string, bondIDs: string[], gasUsed?: number) => {
    const logger = new MarkDownLogger()
      .log(name)
      .br()
      .log("Balance")
      .br()
      .itemizeStart();

    for (const accountIndex of users) {
      const iDOLBalance = await IDOLContract.balanceOf(accounts[accountIndex]);
      logger
        .log(`account${accountIndex}:`)
        .itemizeStart()
        .log(`iDOL: ${toIDOLAmount(iDOLBalance).toString(10)}`)
        .itemizeEnd();

      const balanceList = await Promise.all(
        bondIDs.map(async (bondID) => {
          const {bondTokenAddress} = await callGetBond(
            bondMakerContract,
            bondID
          );
          const bondTokenContract = await BondToken.at(bondTokenAddress);
          const balance = await bondTokenContract.balanceOf(
            accounts[accountIndex]
          );
          return {bondID, balance};
        })
      );

      for (const {bondID, balance} of balanceList) {
        logger
          .itemizeStart()
          .log(
            `bond ${bondID.slice(0, 7)}...: ${toBTAmount(balance).toString(10)}`
          )
          .itemizeEnd();
      }
    }

    logger.itemizeEnd().br();
    if (gasUsed !== undefined) {
      logger.log(`Gas: ${gasUsed}`);
    }

    return logger.toString();
  };
}
