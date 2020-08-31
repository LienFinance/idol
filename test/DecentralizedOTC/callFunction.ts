import {BigNumber} from "bignumber.js";

import {
  WrapperInstance,
  BondMakerInterfaceInstance,
  StableCoinInterfaceInstance,
  TestOracleInstance,
  BondMakerInstance,
  StableCoinInstance,
  Erc20ExchangeFactoryInterfaceInstance,
  TestLienTokenInstance,
} from "../../types/truffle-contracts";

const ExchangeFactory = artifacts.require("ERC20ExchangeFactory");
const BoxExchange = artifacts.require("ERC20BoxExchange");
const Calculator = artifacts.require("PriceCalculator");
const SpreadCalculator = artifacts.require("SpreadCalculator");
const LienToken = artifacts.require("TestLienToken");
const ERC20 = artifacts.require("IERC20");
const OracleInterface = artifacts.require("OracleInterface");

export async function setupExchangeAndLiquidity(
  oracleContract: TestOracleInstance,
  idolContract: StableCoinInterfaceInstance,
  lienTokenContract: TestLienTokenInstance,
  liquidityProvider: string
) {
  const calcContract = await Calculator.new();
  const spreadCalculatorContract = await SpreadCalculator.new();
  const calcAddress = calcContract.address;
  const IDOLAddress = idolContract.address;

  const idolERC20 = await ERC20.at(idolContract.address);

  const factoryContract = await ExchangeFactory.new(
    idolERC20.address,
    liquidityProvider,
    calcContract.address,
    spreadCalculatorContract.address
  );

  await lienTokenContract.mint(270000000, {
    from: liquidityProvider,
  });

  const lienAmount = await lienTokenContract.balanceOf(liquidityProvider);

  const idolAmount = await idolContract.balanceOf(liquidityProvider);

  await idolContract.approve(factoryContract.address, idolAmount.toString(), {
    from: liquidityProvider,
  });

  await lienTokenContract.approve(
    factoryContract.address,
    lienAmount.toString(),
    {
      from: liquidityProvider,
    }
  );

  console.log("lienAmount:", lienAmount.toString());
  console.log("idol amount:", idolAmount.toString());
  /*return {
        calcAddress: '',
        factoryAddress: '',
        exchangeAddress: '',
    };*/

  const erc20lien = await ERC20.at(lienTokenContract.address);
  const oracleInterface = await OracleInterface.at(oracleContract.address);

  const res = await factoryContract.launchExchange(
    erc20lien.address,
    idolAmount,
    lienAmount,
    10000000,
    oracleInterface.address,
    {
      from: liquidityProvider,
    }
  );

  const exchangeAddressString = res.logs.filter(function (x) {
    return x.event == "ExchangeLaunch";
  })[0].args.exchange;

  return {
    calcAddress: calcContract.address,
    factoryAddress: factoryContract.address,
    exchangeAddress: exchangeAddressString,
  };
}
