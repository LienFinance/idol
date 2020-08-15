import BigNumber from "bignumber.js";

import testCases from "../testCases";
import {
  getBlockTimestampSec,
  toIDOLAmount,
  fromBTAmount,
  fromIDOLAmount,
  fromEtherAmount,
  calcFnMap,
  days,
  toBTAmount,
} from "../util";
import {
  callRegisterNewBond,
  callRegisterNewBondGroup,
} from "../bondmaker/callFunction";
import {init} from "../init";

const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const BondToken = artifacts.require("TestBondToken");

contract("StableCoin", async (accounts) => {
  let contractAddresses: {
    bondMaker: string;
    idol: string;
    auction: string;
  };

  beforeEach(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("unlockSBT", () => {
    const cases = testCases["StableCoin"]["unlockSBT"];

    cases.forEach(
      (
        {errorMessage, success, bondGroup, bondTypes, lockAmount, burnAmount},
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const minter = accounts[1];
          const now = await getBlockTimestampSec();

          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const IDOLContract = await StableCoin.at(contractAddresses.idol);

          const {
            bondID: solidBondID,
            bondTokenAddress: SBTAddress,
          } = await callRegisterNewBond(
            bondMakerContract,
            now + bondTypes[0].periodSecBeforeMaturity,
            bondTypes[0].fnMap
          );

          {
            const {bondID: liquidBondID} = await callRegisterNewBond(
              bondMakerContract,
              now + bondTypes[1].periodSecBeforeMaturity,
              bondTypes[1].fnMap
            );

            const {bondGroupID} = await callRegisterNewBondGroup(
              bondMakerContract,
              [solidBondID, liquidBondID],
              now + bondGroup.periodSecBeforeMaturity
            );

            if (!new BigNumber(lockAmount).isEqualTo(0)) {
              await bondMakerContract.issueNewBonds(bondGroupID, {
                from: minter,
                value: new BigNumber(lockAmount)
                  .shiftedBy(18)
                  .times(1002)
                  .div(1000)
                  .toString(10),
              });
            }
          }

          if (!new BigNumber(lockAmount).isEqualTo(0)) {
            const bondTokenInstance = await BondToken.at(SBTAddress);
            await bondTokenInstance.approve(
              IDOLContract.address,
              fromBTAmount(lockAmount),
              {
                from: minter,
              }
            );

            await IDOLContract.mint(
              solidBondID,
              minter,
              fromBTAmount(lockAmount),
              {
                from: minter,
              }
            );
          }

          const beforeIDOLBalance = await IDOLContract.balanceOf(minter);
          console.log(
            `IDOL after mint: $${toIDOLAmount(beforeIDOLBalance).toString()}`
          );

          try {
            await IDOLContract.unlockSBT(
              solidBondID,
              fromIDOLAmount(burnAmount),
              {
                from: minter,
              }
            );
          } catch (err) {
            if (err.message === errorMessage) {
              return;
            }
          }

          const afterIDOLBalance = await IDOLContract.balanceOf(minter);
          console.log(
            `IDOL after unlock: $${toIDOLAmount(afterIDOLBalance).toString()}`
          );
          if (!success) {
            assert.ok(
              toIDOLAmount(beforeIDOLBalance)
                .minus(toIDOLAmount(afterIDOLBalance))
                .isEqualTo(0),
              "should fail to execute unlockSBT"
            );
          }

          if (errorMessage !== "") {
            assert.fail("should fail to execute unlockSBT");
          }
        });
      }
    );
  });
});

contract("StableCoin", async (accounts) => {
  let now: number;
  let contractAddresses: {
    bondMaker: string;
    idol: string;
    auction: string;
  };

  let solidBondID: string;
  let SBTAddress: string;

  const minter = accounts[1];

  const untilMaturity = 4 * days;
  const solidStrikePrice = 100;
  const fnMaps = calcFnMap(solidStrikePrice);
  const issueAmount = new BigNumber(10.0);

  beforeEach(async () => {
    now = await getBlockTimestampSec();

    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );

    const bondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
    {
      const {bondID, bondTokenAddress} = await callRegisterNewBond(
        bondMakerContract,
        now + untilMaturity,
        fnMaps[0].fnMap
      );
      solidBondID = bondID;
      SBTAddress = bondTokenAddress;
    }

    {
      const {bondID: liquidBondID} = await callRegisterNewBond(
        bondMakerContract,
        now + untilMaturity,
        fnMaps[1].fnMap
      );

      const {bondGroupID} = await callRegisterNewBondGroup(
        bondMakerContract,
        [solidBondID, liquidBondID],
        now + untilMaturity
      );

      await bondMakerContract.issueNewBonds(bondGroupID, {
        from: minter,
        value: new BigNumber(issueAmount)
          .shiftedBy(18)
          .times(1002)
          .div(1000)
          .toString(10),
      });
    }
  });

  it(`check the pooled iDOL amount when one executes lockSBT and unlockSBT alternately`, async () => {
    const IDOLContract = await StableCoin.at(contractAddresses.idol);

    for (let i = 1; i <= 10; i++) {
      const lockAmount = new BigNumber(1.0);
      const bondTokenInstance = await BondToken.at(SBTAddress);
      await bondTokenInstance.approve(
        IDOLContract.address,
        fromBTAmount(lockAmount),
        {
          from: minter,
        }
      );

      await IDOLContract.mint(solidBondID, minter, fromBTAmount(lockAmount), {
        from: minter,
      });

      const poolID = await IDOLContract.getCurrentPoolID(solidBondID);
      const totalIDOLSupply = ((await IDOLContract.totalSupply()) as unknown) as BN;
      const lockedPoolInfo = await IDOLContract.lockedPoolE8(minter, poolID);
      const pooledIDOLAmount = lockedPoolInfo[0];
      const sbtAmountBasedPooledIDOL = lockedPoolInfo[1];
      console.log(
        "the total supply of iDOL",
        toIDOLAmount(totalIDOLSupply).toString(10)
      );
      console.log(
        "the pooled iDOL amount",
        toIDOLAmount(pooledIDOLAmount).toString(10)
      );
      console.log(
        "SBT value based in the pooled iDOL amount",
        toBTAmount(sbtAmountBasedPooledIDOL).toString(10)
      );

      const IDOLBalance = await IDOLContract.balanceOf(minter);
      console.log("IDOLBalance", toIDOLAmount(IDOLBalance).toString(10));

      const mintIDOLAmount = toIDOLAmount(
        await IDOLContract.calcSBT2IDOL(new BigNumber(100.0).shiftedBy(12))
      );
      const obtainedAmount = mintIDOLAmount.minus(
        mintIDOLAmount.times(0.1).dp(8, BigNumber.ROUND_DOWN)
      );
      console.log("obtainedAmount", obtainedAmount.toString(10));

      await IDOLContract.testSetLambda(
        fromIDOLAmount(1 + (-1) ** (i % 2) * 0.01 * i),
        {
          from: accounts[0],
        }
      );
      {
        const lambda = await IDOLContract.calcSBT2IDOL(10 ** 12);
        console.log("lambda", toIDOLAmount(lambda).toString(10));
      }

      await IDOLContract.unlockSBT(solidBondID, IDOLBalance, {
        from: minter,
      });

      await IDOLContract.testSetLambda(
        fromIDOLAmount(1 + (-1) ** (i % 2) * 0.01 * i),
        {
          from: accounts[0],
        }
      );
      {
        const lambda = await IDOLContract.calcSBT2IDOL(10 ** 12);
        console.log("lambda", toIDOLAmount(lambda).toString(10));
      }
    }

    {
      const poolID = await IDOLContract.getCurrentPoolID(solidBondID);
      const totalIDOLSupply = ((await IDOLContract.totalSupply()) as unknown) as BN;
      const lockedPoolInfo = await IDOLContract.lockedPoolE8(minter, poolID);
      const pooledIDOLAmount = (lockedPoolInfo[0] as unknown) as BN;
      const sbtAmountBasedPooledIDOL = lockedPoolInfo[1];
      console.log(
        "the total supply of iDOL",
        toIDOLAmount(totalIDOLSupply).toString(10)
      );
      console.log(
        "the pooled iDOL amount",
        toIDOLAmount(pooledIDOLAmount).toString(10)
      );
      console.log(
        "SBT value based in the pooled iDOL amount",
        toBTAmount(sbtAmountBasedPooledIDOL).toString(10)
      );
      assert.ok(
        pooledIDOLAmount.lte(totalIDOLSupply),
        "the pool iDOL amount should be less than or equal to the total supply of iDOL"
      );
    }
  });
});
