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
} from "../wrapper/callFunction";

import {setupExchangeAndLiquidity} from "./callFunction";

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
const ERC20ExchangeFactory = artifacts.require("ERC20ExchangeFactory");
const LienPriceOracle = artifacts.require("LienPriceOracle");
const ERC20 = artifacts.require("TestLienToken");
const BoxExchange = artifacts.require("ERC20BoxExchange");

contract("lienPriceOracle", (accounts) => {
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
  let wrapper: WrapperInstance;
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
    wrapper = await Wrapper.at(contractAddresses.wrapper);
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
    console.log("wrapperAddress: ", contractAddresses.wrapper);

    const factory = await ERC20ExchangeFactory.at(
      exchangeAddresses.factoryAddress
    );

    const idolBalanceFirst = await idolContract.balanceOf(wrapper.address);
    console.log("idol balance: ", idolBalanceFirst.toString());
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
        wrapper,
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
    }
  });

  describe("issueIDOLAndGetPoolPrice", () => {
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
          const lienTokenContract = await ERC20.at(contractAddresses.lienToken);
          const oracleContract = await Oracle.at(contractAddresses.oracle);
          const tester = accounts[3];

          const currentIDOLBalance = toIDOLAmount(
            await idolContract.balanceOf(tester)
          );

          /* const { sender, amount } = */ await callIssueLBTAndIDOL(
            wrapper,
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

          const setUpDone = await setupExchangeAndLiquidity(
            oracleContract,
            idolContract,
            lienTokenContract,
            tester
          );

          const LienPriceOracleContract = await LienPriceOracle.new(
            setUpDone.exchangeAddress,
            idolContract.address
          );

          const price = await LienPriceOracleContract.getPrice();
          const fairswap = await BoxExchange.at(setUpDone.exchangeAddress);
          const arrayRes = await fairswap.getExchangeData();
          console.log("idol pool", arrayRes[1].toString());
          console.log("lien pool", arrayRes[2].toString());

          console.log("Final Price Lien/USD:", price.toString());
        } catch (err) {
          throw err;
        }
      });
    });
  });
});
