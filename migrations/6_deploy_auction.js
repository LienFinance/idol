const fs = require('fs');

const StableCoin = artifacts.require('StableCoin');
const AuctionBoard = artifacts.require('AuctionBoard');
const Auction = artifacts.require('Auction');

const {
    minNormalAuctionPeriod,
    minEmergencyAuctionPeriod,
    normalAuctionRevealSpan,
    emergencyAuctionRevealSpan,
    auctionWithdrawSpan,
    emergencyAuctionWithdrawSpan,
} = require('../test/constants.js');

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    await deployer.deploy(
        Auction,
        data.bondMaker,
        data.idolToken,
        data.auctionBoard,
        minNormalAuctionPeriod,
        minEmergencyAuctionPeriod,
        normalAuctionRevealSpan,
        emergencyAuctionRevealSpan,
        auctionWithdrawSpan,
        emergencyAuctionWithdrawSpan
    );
    const auctionContract = await Auction.deployed();

    const idolTokenContract = await StableCoin.deployed();
    await idolTokenContract.setAuctionContract(auctionContract.address);

    const auctionBoardContract = await AuctionBoard.deployed();
    await auctionBoardContract.setAuctionContract(auctionContract.address);

    const output = {
        ...data,
        auction: auctionContract.address,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
