import {BigNumber} from "bignumber.js";

import {
  Pattern3TestCase,
  splitBids,
  GIVE_UP_TO_MAKE_AUCTION_RESULT,
  getBidPriceLimit,
} from "../utils";
import {
  calcSettledPrice,
  getBoard,
  getEndInfo,
  sortPriceFromBoard,
} from "../generateRandomCase";

const LOCK_POOL_BORDER = 0.1;

BigNumber.set({ROUNDING_MODE: BigNumber.ROUND_DOWN});

class Pattern3LambdaSimulator {
  readonly LOCK_POOL_BORDER = LOCK_POOL_BORDER;
  totalLockedSBTValue = new BigNumber(0);
  totalIDOLSupply = new BigNumber(0);

  calcUSD2IDOL = (sbtValue: BigNumber.Value) => {
    if (this.totalLockedSBTValue.eq(0)) {
      return new BigNumber(sbtValue);
    }
    return new BigNumber(sbtValue)
      .dp(12)
      .times(this.totalIDOLSupply)
      .div(this.totalLockedSBTValue)
      .dp(8);
  };

  calcIDOL2USD = (idolAmount: BigNumber.Value) => {
    if (this.totalIDOLSupply.eq(0)) {
      return new BigNumber(idolAmount);
    }
    return new BigNumber(idolAmount)
      .dp(8)
      .times(this.totalLockedSBTValue)
      .div(this.totalIDOLSupply)
      .dp(12);
  };

  updateLambda = (bondGroup: Pattern3TestCase["bondGroups"][number]) => {
    let totalLockedSBTValue = new BigNumber(0);
    let totalIDOLSupply = new BigNumber(0);

    const {assets, solidStrikePrice: solidStrikePriceUSD, auctions} = bondGroup;
    const solidStrikePrice = new BigNumber(solidStrikePriceUSD).dp(4);

    let auctionSBTAmount = new BigNumber(0);
    let pooledIDOLAmountList: {[accountIndex: string]: BigNumber} = {};
    let totalUnlockedSBT = new BigNumber(0);
    let totalBurnedIDOL = new BigNumber(0);
    for (const [
      accountIndex,
      {lockingSBTAmount, burningIDOLValue},
    ] of Object.entries(assets)) {
      const lockedSBTValue = new BigNumber(lockingSBTAmount)
        .times(solidStrikePrice)
        .dp(12);
      const mintingIDOLAmount = this.calcUSD2IDOL(lockedSBTValue);
      const lockedIDOLAmount = mintingIDOLAmount
        .times(this.LOCK_POOL_BORDER)
        .dp(8);
      const burningIDOLAmount = this.calcUSD2IDOL(burningIDOLValue || 0);
      const unlockedSBTValue = this.calcIDOL2USD(burningIDOLAmount);
      const unlockedSBTAmount = unlockedSBTValue.div(solidStrikePrice).dp(8);
      pooledIDOLAmountList[accountIndex] = lockedIDOLAmount;
      totalLockedSBTValue = totalLockedSBTValue
        .plus(lockedSBTValue)
        .minus(unlockedSBTValue);
      totalIDOLSupply = totalIDOLSupply
        .plus(mintingIDOLAmount)
        .minus(burningIDOLAmount);
      totalUnlockedSBT = totalUnlockedSBT.plus(unlockedSBTAmount);
      totalBurnedIDOL = totalBurnedIDOL.plus(burningIDOLAmount);
      auctionSBTAmount = auctionSBTAmount
        .plus(new BigNumber(lockingSBTAmount).dp(8))
        .minus(unlockedSBTAmount);
    }

    let totalSoldSBTAmount = new BigNumber(0);
    let totalPaidIDOLAmount = new BigNumber(0);
    auctions.forEach(
      (
        {
          bids,
          actions,
          giveUpSortBidPrice,
          giveUpMakeEndInfo,
          isReceivingWinBidsLately,
        },
        auctionRestartedCount
      ) => {
        console.log(
          "auction " + auctionRestartedCount,
          totalSoldSBTAmount.toString(10),
          totalPaidIDOLAmount.toString(10)
        );

        if (auctionSBTAmount.eq(0)) {
          return;
        }

        const strikePriceIDOL = this.calcUSD2IDOL(solidStrikePrice);
        const {board, settledAmountForUnrevealed} = getBoard(
          strikePriceIDOL,
          splitBids(bids)
        );

        if (auctionSBTAmount.lte(settledAmountForUnrevealed)) {
          const paidIDOLAmount = this.calcUSD2IDOL(
            auctionSBTAmount.times(solidStrikePrice)
          );
          totalSoldSBTAmount = totalSoldSBTAmount.plus(auctionSBTAmount.dp(8));
          totalPaidIDOLAmount = totalPaidIDOLAmount.plus(paidIDOLAmount.dp(8));
          auctionSBTAmount = new BigNumber(0);
          return;
        }

        {
          const paidIDOLAmount = this.calcUSD2IDOL(
            settledAmountForUnrevealed.times(solidStrikePrice)
          );
          totalSoldSBTAmount = totalSoldSBTAmount.plus(
            settledAmountForUnrevealed.dp(8)
          );
          totalPaidIDOLAmount = totalPaidIDOLAmount.plus(paidIDOLAmount.dp(8));
          auctionSBTAmount = auctionSBTAmount.minus(settledAmountForUnrevealed);
        }

        if (giveUpSortBidPrice || giveUpMakeEndInfo) {
          return;
        }

        const {lowerBidPriceLimit: lowestBidPrice} = getBidPriceLimit(
          this.calcUSD2IDOL(solidStrikePrice),
          auctionRestartedCount
        );
        const {
          priceIndex: endPriceIndex,
          boardIndex,
          loseSBTAmount,
          winnerSBTAmountAtEndPrice,
        } = getEndInfo(auctionSBTAmount, board);
        console.log(
          "lambda simulator: end info",
          endPriceIndex,
          boardIndex,
          loseSBTAmount.toString(10),
          winnerSBTAmountAtEndPrice.toString(10)
        );
        const auctionPriceList = sortPriceFromBoard(board);
        const endPrice = auctionPriceList[endPriceIndex];

        let totalRewardedAmount = new BigNumber(0);
        Object.keys(actions).forEach((accountIndex) => {
          const {toPayIDOLAmount, rewardedSBTAmount} = calcSettledPrice(
            auctionSBTAmount,
            lowestBidPrice,
            board,
            Number(accountIndex)
          );
          const {isMakingAuctionResultLately, result} = actions[accountIndex];
          const paidIDOLAmount =
            result === null
              ? this.calcUSD2IDOL(rewardedSBTAmount.times(solidStrikePrice))
              : isReceivingWinBidsLately ||
                isMakingAuctionResultLately ||
                result.myLowestPrice === GIVE_UP_TO_MAKE_AUCTION_RESULT
              ? rewardedSBTAmount.times(endPrice).dp(8)
              : toPayIDOLAmount;
          totalPaidIDOLAmount = totalPaidIDOLAmount.plus(paidIDOLAmount.dp(8));
          totalSoldSBTAmount = totalSoldSBTAmount.plus(rewardedSBTAmount.dp(8));
          totalRewardedAmount = totalRewardedAmount.plus(
            rewardedSBTAmount.dp(8)
          );
        });
        auctionSBTAmount = auctionSBTAmount.minus(totalRewardedAmount.dp(8));
      }
    );

    if (auctionSBTAmount.lt(0)) {
      throw new Error(
        "the auction SBT amount must be more than or equal to zero"
      );
    }

    const isLast = auctionSBTAmount.eq(0);
    if (isLast) {
      const totalPooledIDOLAmount = Object.values(pooledIDOLAmountList).reduce(
        (acc, pooledIDOLAmount) => acc.plus(pooledIDOLAmount),
        new BigNumber(0)
      );

      // WARNING: expectedBurningIDOLAmount may differ from the total iDOL amount mining by locking the SBT.
      const expectedBurningIDOLAmount = totalPooledIDOLAmount
        .times(1 / this.LOCK_POOL_BORDER)
        .dp(8);
      console.log(
        "make auction result",
        totalSoldSBTAmount.toString(10),
        totalPaidIDOLAmount.toString(10),
        expectedBurningIDOLAmount.toString(10),
        totalPooledIDOLAmount.toString(10)
      );
      const totalBurningIDOLAmount = totalBurnedIDOL.plus(totalPaidIDOLAmount);
      const burnedIDOLAmount = totalBurningIDOLAmount.gt(
        expectedBurningIDOLAmount
      )
        ? totalPaidIDOLAmount.minus(totalBurnedIDOL)
        : totalBurningIDOLAmount.gt(
            expectedBurningIDOLAmount.minus(totalPooledIDOLAmount)
          )
        ? expectedBurningIDOLAmount.minus(totalBurnedIDOL)
        : totalPaidIDOLAmount.plus(totalPooledIDOLAmount);
      totalUnlockedSBT = totalUnlockedSBT.plus(totalSoldSBTAmount);
      totalBurnedIDOL = totalBurnedIDOL.plus(totalPaidIDOLAmount);
      totalIDOLSupply = totalIDOLSupply.minus(burnedIDOLAmount);
      totalLockedSBTValue = totalLockedSBTValue.minus(
        totalSoldSBTAmount.times(solidStrikePrice).dp(12)
      );
    }

    this.totalLockedSBTValue = this.totalLockedSBTValue.plus(
      totalLockedSBTValue
    );
    this.totalIDOLSupply = this.totalIDOLSupply.plus(totalIDOLSupply);

    return {
      totalLockedSBTValue,
      totalIDOLSupply,
      totalUnlockedSBT,
      totalBurnedIDOL,
      isLast,
    };
  };
}

export default Pattern3LambdaSimulator;
