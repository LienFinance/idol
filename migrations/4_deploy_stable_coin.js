const fs = require('fs');

const StableCoin = artifacts.require('StableCoin');

const { auctionSpan, emergencyAuctionSpan } = require('../test/constants.js');

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    await deployer.deploy(
        StableCoin,
        data.oracle,
        data.bondMaker,
        auctionSpan,
        emergencyAuctionSpan
    );
    const idolTokenContract = await StableCoin.deployed();

    const output = {
        ...data,
        idolToken: idolTokenContract.address,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
