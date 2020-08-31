const fs = require('fs');

const Oracle = artifacts.require('TestOracle');
const LienToken = artifacts.require('TestLienToken');
const BondTokenName = artifacts.require('BondTokenName');

module.exports = async (deployer, network) => {
    let marketOracleAddress = '';
    let lienTokenAddress = '';
    if (network === 'ropsten') {
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

    const output = {
        oracle: marketOracleAddress,
        lienToken: lienTokenAddress,
        bondTokenName: bondTokenNameAddress,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
