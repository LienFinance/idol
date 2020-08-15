const fs = require('fs');

const Oracle = artifacts.require('TestOracle');
const LienToken = artifacts.require('TestLienToken');
const BondTokenName = artifacts.require('BondTokenName');
const LBTPricing = artifacts.require('LBTPricing');

module.exports = async (deployer, network) => {
    let marketOracleAddress = '';
    let lienTokenAddress = '';
    if (network === 'mainnet') {
        marketOracleAddress = '0x120a078fdc516a1a98bbecb9e961f8741ac7ac82';
        lienTokenAddress = '0xab37e1358b639fd877f015027bb62d3ddaa7557e';
    } else if (network === 'ropsten') {
        marketOracleAddress = '0xac1034b36286C9e8B7bE09ED7e6Cc90C7FEE5098';
        lienTokenAddress = '0x618659f3035D453bB5320b42722488E8761c8aAf';
    } else {
        const initRateETH2USD = 200;
        const initVolatility = 0;
        await deployer.deploy(Oracle, initRateETH2USD * 100000000, initVolatility * 100000000);
        marketOracleAddress = Oracle.address;
        await deployer.deploy(LienToken);
        lienTokenAddress = LienToken.address;
    }

    await deployer.deploy(BondTokenName);
    const bondTokenNameAddress = BondTokenName.address;

    await deployer.deploy(LBTPricing);
    const LBTPricingAddress = await LBTPricing.address;

    const output = {
        oracle: marketOracleAddress,
        lienToken: lienTokenAddress,
        bondTokenName: bondTokenNameAddress,
        lbtPricing: LBTPricingAddress,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
