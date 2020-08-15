const fs = require('fs');

const Wrapper = artifacts.require('Wrapper');

const nullAddress = '0x0000000000000000000000000000000000000000';

module.exports = async (deployer) => {
    const inputFile = process.env.DUMP || 'dump.json';
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    await deployer.deploy(
        Wrapper,
        data.oracle,
        data.bondMaker,
        data.idolToken,
        nullAddress // set exchange factory later
    );
    const wrapperContract = await Wrapper.deployed();

    const output = {
        ...data,
        wrapper: wrapperContract.address,
    };
    const dump = process.env.DUMP || 'dump.json';
    fs.writeFileSync(dump, JSON.stringify(output, null, 2));
};
