import {BigNumber} from "bignumber.js";
import * as fs from "fs";

import testCases from "../testCases";
import {WrapperInstance} from "../../types/truffle-contracts";
import {testPattern3Factory} from "../scenario/pattern3/testPattern3Factory";
import {pat3cases} from "../scenario/pattern3/testCases";
import {pat3Desc} from "../scenario/pattern3/pat3Logger";
import {init} from "../init";
import {callGetBond} from "../bondmaker/callFunction";
import {
  maybeIssueIDOL,
  maybeIssueLBT,
  calcExpectedIDOL,
  callIssueLBTAndIDOL,
  callIssueIDOL,
  callRegisterBondAndBondGroup,
  setupExchanges,
  setupLiquidity,
  waitUnexecutedBox,
} from "./callFunction";
import {
  getBlockTimestampSec,
  fromEtherAmount,
  toIDOLAmount,
  toBTAmount,
  MarkDownLogger,
  fromIDOLAmount,
  fromBTAmount,
} from "../util";

const describes = testCases["Wrapper"];

const Oracle = artifacts.require("TestOracle");
const BondMaker = artifacts.require("TestBondMaker");
const StableCoin = artifacts.require("TestStableCoin");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const BondToken = artifacts.require("TestBondToken");
const Wrapper = artifacts.require("Wrapper");
const LBTExchangeFactory = artifacts.require("LBTExchangeFactory");

contract("wrapper", (accounts) => {
  let contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
    auction: string;
    auctionBoard: string;
    wrapper: string;
    lienToken: string;
  };
  let exchangeAddresses: {
    calcAddress: string;
    factoryAddress: string;
  };
  let oracleContractAddress: string;
  let wrapperContract: WrapperInstance;

  let bondIDsList: string[][] = [];

  before(async () => {
    const now = await getBlockTimestampSec();
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
    const oracleContract = await Oracle.deployed();
    const wrapper = await Wrapper.at(contractAddresses.wrapper);
    const bondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
    const idolContract = await StableCoin.at(contractAddresses.idol);
    oracleContractAddress = oracleContract.address;

    exchangeAddresses = await setupExchanges(
      wrapper,
      oracleContract,
      bondMakerContract,
      idolContract
    );
    console.log("exchangeAddresses:", exchangeAddresses);

    const factory = await LBTExchangeFactory.at(
      exchangeAddresses.factoryAddress
    );
    wrapperContract = await Wrapper.at(wrapper.address);

    const idolBalanceFirst = await idolContract.balanceOf(
      wrapperContract.address
    );
    assert.equal("0", idolBalanceFirst.toString());

    // initialize register bond group and liquidity.
    const {registerBondAndBondGroup} = describes;

    for (let caseValue of registerBondAndBondGroup) {
      const {
        periodSecBeforeMaturity,
        SBTfnMap,
        LBTfnMap,
        expectBondGroupID,
      } = caseValue;
      const {bondGroupID, bondIDs} = await callRegisterBondAndBondGroup(
        wrapperContract,
        [SBTfnMap, LBTfnMap],
        now + periodSecBeforeMaturity
      );
      bondIDsList.push(bondIDs);
      assert.equal(bondGroupID, expectBondGroupID);

      const issuingBondAmount = 10;
      const paidETHAmount = new BigNumber(issuingBondAmount)
        .shiftedBy(18)
        .times(1002)
        .div(1000)
        .dp(0)
        .toString(10);

      await bondMakerContract.issueNewBonds(bondGroupID, {
        from: accounts[1],
        value: paidETHAmount,
      });

      const sbtInfo = await bondMakerContract.getBond(bondIDs[0]);
      const sbtInstance = await BondToken.at(sbtInfo[0]);
      await sbtInstance.approve(
        idolContract.address,
        fromBTAmount(issuingBondAmount),
        {
          from: accounts[1],
        }
      );
      await idolContract.mint(
        bondIDs[0],
        accounts[1],
        fromBTAmount(issuingBondAmount),
        {
          from: accounts[1],
        }
      );

      // setup liquidity.
      await setupLiquidity(
        factory,
        bondMakerContract,
        idolContract,
        wrapper,
        accounts[1],
        bondGroupID,
        bondIDs
      );
    }
  });

  describe("issueLBTAndIDOL", () => {
    const {issueLBTAndIDOL} = describes;
    issueLBTAndIDOL.forEach((caseValue, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const {bondGroupID, value} = caseValue;
        try {
          // prepare bond maker contract
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const idolContract = await StableCoin.at(contractAddresses.idol);
          const tester = accounts[3];

          const currentIDOLBalance = toIDOLAmount(
            await idolContract.balanceOf(tester)
          );

          /* const { sender, amount } = */ await callIssueLBTAndIDOL(
            wrapperContract,
            bondGroupID,
            {
              value: fromEtherAmount(
                new BigNumber(value).times(1002).div(1000)
              ),
              from: tester,
            }
          );

          // get solid info.
          const {solidStrikePrice: strikePrice} = await callGetBond(
            bondMakerContract,
            bondIDsList[caseIndex][0]
          );
          const liquidContract = await BondToken.at(
            (await callGetBond(bondMakerContract, bondIDsList[caseIndex][1]))
              .bondTokenAddress
          );

          // assert.equal(sender, tester);
          // Check the obtained iDOL amount.
          const expectedIDOL = new BigNumber(value)
            .times(strikePrice)
            .times(0.9);
          const afterIDOLBalance = toIDOLAmount(
            await idolContract.balanceOf(tester)
          );
          assert.equal(
            afterIDOLBalance.minus(currentIDOLBalance).toString(10),
            expectedIDOL.toString(10)
          );

          // Check the issued LBT amount.
          const actualLiquidBalance = await liquidContract.balanceOf(tester);
          assert.equal(
            new BigNumber(actualLiquidBalance.toString())
              .shiftedBy(-8)
              .toString(10),
            new BigNumber(value).toString(10),
            "the LBT balance differ from expected"
          );
        } catch (err) {
          throw err;
        }
      });
    });
  });

  describe("issueIDOLOnly", () => {
    const {issueLBTAndIDOL} = describes;
    issueLBTAndIDOL.forEach((caseValue, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const {bondGroupID, value} = caseValue;
        try {
          // prepare bond maker contract
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const idolContract = await StableCoin.at(contractAddresses.idol);
          const exchangeFactory = await LBTExchangeFactory.at(
            exchangeAddresses.factoryAddress
          );
          const tester = accounts[4];

          const liquidContract = await BondToken.at(
            (await callGetBond(bondMakerContract, bondIDsList[caseIndex][1]))
              .bondTokenAddress
          );

          const {sender} = await callIssueIDOL(
            wrapperContract,
            bondGroupID,
            10000,
            true,
            {
              value: fromEtherAmount(
                new BigNumber(value).times(1002).div(1000)
              ),
              from: tester,
            }
          );
          assert.equal(sender, tester);

          const beforeIDOLBalance = toIDOLAmount(
            await idolContract.balanceOf(tester)
          );
          const beforeLbtBalance = toBTAmount(
            await liquidContract.balanceOf(tester)
          );

          await waitUnexecutedBox(exchangeFactory, liquidContract.address);

          const afterIDOLBalance = toIDOLAmount(
            await idolContract.balanceOf(tester)
          );
          assert.ok(
            afterIDOLBalance.gt(beforeIDOLBalance),
            "invalid iDOL balance"
          );

          const afterLbtBalance = toBTAmount(
            await liquidContract.balanceOf(tester)
          );
          assert.ok(
            afterLbtBalance.gte(beforeLbtBalance),
            "invalid LBT balance"
          );
        } catch (err) {
          throw err;
        }
      });
    });
  });

  describe("issueLBTOnly", () => {
    const {issueLBTAndIDOL} = describes;
    issueLBTAndIDOL.forEach((caseValue, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const {bondGroupID, value} = caseValue;
        try {
          // prepare bond maker contract
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const idolContract = await StableCoin.at(contractAddresses.idol);
          const ethValue = new BigNumber(value).shiftedBy(18);
          const exchangeFactory = await LBTExchangeFactory.at(
            exchangeAddresses.factoryAddress
          );
          const tester = accounts[5];

          // get solid info.
          const {solidStrikePrice: strikePrice} = await callGetBond(
            bondMakerContract,
            bondIDsList[caseIndex][0]
          );
          const liquidContract = await BondToken.at(
            (await callGetBond(bondMakerContract, bondIDsList[caseIndex][1]))
              .bondTokenAddress
          );
          await idolContract.approve(
            wrapperContract.address,
            fromIDOLAmount("1e20"),
            {
              from: tester,
            }
          );

          await wrapperContract.issueLBTOnly(
            bondGroupID,
            bondIDsList[caseIndex][1],
            10000,
            true,
            {
              value: fromEtherAmount(
                new BigNumber(value).times(1002).div(1000)
              ),
              from: tester,
            }
          );
          await waitUnexecutedBox(exchangeFactory, liquidContract.address);

          // Check the obtained LBT amount.
          const expectedLBT = ethValue.plus(
            await maybeIssueLBT(
              exchangeFactory,
              liquidContract.address,
              calcExpectedIDOL(strikePrice.toString(), ethValue.toString())
            )
          );
          const actualLBTBalance = toBTAmount(
            await liquidContract.balanceOf(tester)
          );
          // Later: maybeIssueLBT is not equal....
          // assert.equal(
          //     expectedLBT.toString(),
          //     (await liquidContract.balanceOf(tester)).toString()
          // );
          console.log(
            "ExpectedLBT/ActualLBT",
            expectedLBT.dp(0).toString(),
            actualLBTBalance.toString()
          );

          // Check the issued IDOL amount.
          const actualIDOL = await idolContract.balanceOf(tester);
          assert.equal("0", actualIDOL.toString());
        } catch (err) {
          throw err;
        }
      });
    });
  });
});

contract("wrapper", (accounts) => {
  let contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
    auction: string;
    auctionBoard: string;
    wrapper: string;
    lienToken: string;
  };

  beforeEach(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("returnLockedPool", () => {
    const cases = describes["returnLockedPool"];
    cases.forEach(({pattern3TestCaseIndex}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const caseValue = pat3cases[pattern3TestCaseIndex];
        const summaryLogger = new MarkDownLogger();
        summaryLogger.log(pat3Desc());

        try {
          await testPattern3Factory(accounts, contractAddresses)(
            {
              ...caseValue,
              useWrapper: true,
            },
            summaryLogger
          );
        } catch (err) {
          summaryLogger.log(err.message);
          throw err;
        } finally {
          fs.writeFileSync(
            `./test/scenario/pattern3/summaries/${caseIndex}.md`,
            summaryLogger.toString()
          );
        }
      });
    });
  });
});
