const fs = require('fs');

const BondMaker = artifacts.require('BondMaker');

const { maturityScale } = require('../test/constants.js');

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    await deployer.deploy(
        BondMaker,
        data.oracle,
        data.lienToken,
        data.bondTokenName,
        maturityScale
    );
    const bondMakerAddress = BondMaker.address;
    const output = {
        ...data,
        bondMaker: bondMakerAddress,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
