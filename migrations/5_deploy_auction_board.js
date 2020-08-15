const fs = require('fs');

const AuctionBoard = artifacts.require('AuctionBoard');

const { maxPriceIndex, maxBoardIndex, maxBoardIndexAtEndPrice } = require('../test/constants.js');

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    const maxBidCountPerAddress = 100;
    await deployer.deploy(
        AuctionBoard,
        data.bondMaker,
        data.idolToken,
        maxPriceIndex,
        maxBoardIndex,
        maxBoardIndexAtEndPrice,
        maxBidCountPerAddress
    );
    const auctionBoardContract = await AuctionBoard.deployed();

    const output = {
        ...data,
        auctionBoard: auctionBoardContract.address,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
