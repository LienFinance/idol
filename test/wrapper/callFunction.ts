import {
  WrapperInstance,
  BondMakerInterfaceInstance,
  StableCoinInterfaceInstance,
  TestOracleInstance,
  BondMakerInstance,
  StableCoinInstance,
  LbtExchangeFactoryInterfaceInstance,
} from "../../types/truffle-contracts";
import {callGetBond} from "../bondmaker/callFunction";
import {BigNumber} from "bignumber.js";
import {time} from "@openzeppelin/test-helpers";

export const LogRegisterBondAndBondGroup = "LogRegisterBondAndBondGroup";
export const LogIssueIDOL = "LogIssueIDOL";
export const LogExchangeLaunch = "ExchangeLaunch";
export const LogReturnLockedPoolFromIDOLContract =
  "LogReturnLockedPoolFromIDOLContract";

const ether45 = new BigNumber(45).shiftedBy(18);

export interface LogRegisterBondAndBondGroupType
  extends Truffle.TransactionLog {
  event: typeof LogRegisterBondAndBondGroup;
  args: {
    bondGroupID: string;
    bondIDs: string[];
  };
}

export interface LogIssueIDOLType extends Truffle.TransactionLog {
  event: typeof LogIssueIDOL;
  args: {
    bondID: string;
    sender: string;
    poolID: string;
    amount: BN;
  };
}

export interface LogExchangeLaunchType extends Truffle.TransactionLog {
  event: typeof LogExchangeLaunch;
  args: {
    exchange: string;
  };
}

export interface LogReturnLockedPoolFromIDOLContractType
  extends Truffle.TransactionLog {
  event: typeof LogReturnLockedPoolFromIDOLContract;
  args: {
    poolID: string;
    backIDOLAmount: string;
  };
}

function isLogRegisterBondAndBondGroupType(
  log: any
): log is LogRegisterBondAndBondGroupType {
  return log.event === LogRegisterBondAndBondGroup;
}

function isLogIssueIDOLType(log: any): log is LogIssueIDOLType {
  return log.event === LogIssueIDOL;
}

function isLogExchangeLaunchType(log: any): log is LogExchangeLaunchType {
  return log.event === LogExchangeLaunch;
}

function isLogReturnLockedPoolFromIDOLContractType(
  log: Truffle.TransactionLog
): log is LogReturnLockedPoolFromIDOLContractType {
  return log.event === LogReturnLockedPoolFromIDOLContract;
}

/**
 * register new bond and bond group.
 * @param wrapperContract Wrapper contract
 * @param params the parameters of registerBondAndBondGroup
 */
export async function callRegisterBondAndBondGroup(
  wrapperContract: WrapperInstance,
  ...params: Parameters<typeof wrapperContract["registerBondAndBondGroup"]>
) {
  const res = await wrapperContract.registerBondAndBondGroup(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogRegisterBondAndBondGroupType(log)) {
      const {bondGroupID, bondIDs} = log.args;
      return {bondGroupID, bondIDs};
    }
  }

  throw new Error("event `LogRegisterBondAndBondGroup` was not found");
}

/**
 * call issue lbt and idol.
 * @param wrapperContract Wrapper contract
 * @param params the parameters of issueLBTAndIDOL
 */
export async function callIssueLBTAndIDOL(
  wrapperContract: WrapperInstance,
  ...params: Parameters<typeof wrapperContract["issueLBTAndIDOL"]>
) {
  const res = await wrapperContract.issueLBTAndIDOL(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogIssueIDOLType(log)) {
      return log.args;
    }
  }

  throw new Error("event `LogIssueIDOL` was not found");
}

/**
 * call issue idol only.
 * @param wrapperContract Wrapper contract
 * @param params the parameters of issueIDOLOnly
 */
export async function callIssueIDOL(
  wrapperContract: WrapperInstance,
  ...prams: Parameters<typeof wrapperContract["issueIDOLOnly"]>
) {
  const res = await wrapperContract.issueIDOLOnly(...prams);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogIssueIDOLType(log)) {
      const {sender, amount} = log.args;
      return {sender, amount: new BigNumber(amount.toString()).shiftedBy(-8)};
    }
  }

  throw new Error("event `LogIssueIDOL` was not found");
}

/**
 * create wrapper contract and return the address.
 * @param wrapperContract
 */
// export async function callLaunchExchange(
//     exchangeFactory: TestExchangeFactoryInstance,
//     ...params: Parameters<typeof exchangeFactory['launchExchange']>
// ) {
//     const res = await exchangeFactory.launchExchange(...params);
//     for (let i = 0; i < res.logs.length; i++) {
//         const log = res.logs[i];
//         if (isLogExchangeLaunchType(log)) {
//             const { exchange } = log.args;
//             return exchange;
//         }
//     }

//     throw new Error('event `LogCreateWrapperContract` was not found');
// }

export async function waitUnexecutedBox(
  factory: LbtExchangeFactoryInterfaceInstance,
  liquidAddress: string
) {
  await time.advanceBlock();
  await time.advanceBlock();

  // resulted order.
  const exchangeContract = await BoxExchange.at(
    await factory.addressToExchangeLookup(liquidAddress)
  );
  await exchangeContract.executeUnexecutedBox(5);
}

export async function maybeIssueIDOL(
  exchangeFactory: LbtExchangeFactoryInterfaceInstance,
  lbtAddress: string,
  lbtAmount: string
) {
  const exchangeAddress = await exchangeFactory.addressToExchangeLookup(
    lbtAddress
  );
  const exchangeContract = await BoxExchange.at(exchangeAddress);
  const retArray = await exchangeContract.getExchangeData();
  const latestSpreadRate = retArray[4];
  const _sellPriceE18 = new BigNumber(retArray[0].toString())
    .div(retArray[1])
    .div(new BigNumber(1e18).plus(latestSpreadRate));

  // ? + 18 + 2 - 34 = 8
  // estimatedMaximumIDOL = sellPrice18 * LBTAmount * (maximum Limit);
  return _sellPriceE18
    .multipliedBy(new BigNumber(lbtAmount))
    .div(new BigNumber(10).pow(new BigNumber(34)));
}

export async function maybeIssueLBT(
  exchangeFactory: LbtExchangeFactoryInterfaceInstance,
  lbtAddress: string,
  idolAmount: string
) {
  const exchangeAddress = await exchangeFactory.addressToExchangeLookup(
    lbtAddress
  );
  const exchangeContract = await BoxExchange.at(exchangeAddress);
  const retArray = await exchangeContract.getExchangeData();
  const latestSpreadRate = retArray[4];
  const _buyPriceE18 = new BigNumber(retArray[0].toString())
    .div(retArray[1])
    .times(new BigNumber(1e18).plus(latestSpreadRate));

  // estimatedMaximumLBT = buyPrice18 * IDOLAmount * 1.05(maximum Limit);
  return _buyPriceE18
    .multipliedBy(new BigNumber(idolAmount))
    .div(new BigNumber(10).pow(new BigNumber(18)));
}

// strikePrice * solidAmount(8) * 0.9 / (10) = IDOLAmount(8).
export function calcExpectedIDOL(strikePrice: string, ethAmount: string) {
  return new BigNumber(strikePrice)
    .multipliedBy(new BigNumber(ethAmount))
    .multipliedBy(0.9)
    .toString();
}

const ExchangeFactory = artifacts.require("LBTExchangeFactory");
const BoxExchange = artifacts.require("LBTBoxExchange");
const Calculator = artifacts.require("PriceCalculator");
const SpreadCalculator = artifacts.require("SpreadCalculator");
const LienToken = artifacts.require("TestLienToken");
const BondToken = artifacts.require("TestBondToken");

export async function setupExchanges(
  wrapper: WrapperInstance,
  oracleContract: TestOracleInstance,
  bondMakerContract: BondMakerInterfaceInstance,
  idolContract: StableCoinInterfaceInstance
) {
  const calcContract = await Calculator.new();
  const spreadCalculatorContract = await SpreadCalculator.new();
  const lienTokenContract = await LienToken.new();
  const lienTokenAddress = lienTokenContract.address;
  const calcAddress = calcContract.address;
  const bondMakerAddress = bondMakerContract.address;
  const IDOLAddress = idolContract.address;
  const factoryContract = await ExchangeFactory.new(
    IDOLAddress,
    bondMakerAddress,
    calcAddress,
    lienTokenAddress,
    spreadCalculatorContract.address,
    oracleContract.address
  );

  // set Exchange Factory.
  await wrapper.setExchangeLBTAndIDOLFactory(factoryContract.address);
  return {
    calcAddress: calcContract.address,
    factoryAddress: factoryContract.address,
  };
}

export async function setupLiquidity(
  factory: LbtExchangeFactoryInterfaceInstance,
  bondMaker: BondMakerInstance,
  stable: StableCoinInstance,
  wrapper: WrapperInstance,
  liquidityProvider: string,
  bondGroupID: string,
  bondIDs: string[]
) {
  const {bondTokenAddress} = await callGetBond(bondMaker, bondIDs[1]);
  const bondContract = await BondToken.at(bondTokenAddress);

  const lbtAmount = await bondContract.balanceOf(liquidityProvider);
  const idolAmount = await stable.balanceOf(liquidityProvider);

  // add initial liquidity.
  await bondContract.approve(factory.address, lbtAmount.toString(), {
    from: liquidityProvider,
  });
  await stable.approve(factory.address, idolAmount.toString(), {
    from: liquidityProvider,
  });
  await factory.launchExchange(
    bondGroupID,
    1,
    idolAmount.toString(),
    lbtAmount.toString(),
    {
      from: liquidityProvider,
    }
  );

  await wrapper.issueLBTAndIDOL(bondGroupID, {
    from: liquidityProvider,
    value: ether45.times(1002).div(1000).dividedToIntegerBy(1).toString(10),
  });

  console.log("setup LBT/iDOL", lbtAmount.toString(), idolAmount.toString());
}
