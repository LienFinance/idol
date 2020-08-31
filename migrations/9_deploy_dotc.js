const fs = require('fs');

const DecentralizedOTC = artifacts.require('DecentralizedOTC');
const LBTPricing = artifacts.require('LBTPricing');

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    await deployer.deploy(LBTPricing);
    const LBTPricingContract = await LBTPricing.deployed();

    await deployer.deploy(DecentralizedOTC, data.bondMaker, data.oracle, data.lienToken);
    const DecentralizedOTCContract = await DecentralizedOTC.deployed();

    const output = {
        ...data,
        lbtPricing: LBTPricingContract.address,
        decentralizedOTC: DecentralizedOTCContract.address,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
