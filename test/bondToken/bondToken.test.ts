import testCases from "../testCases";

const BondToken = artifacts.require("TestBondToken");

contract("BondToken", (accounts) => {
  const describes = testCases["BondToken"];

  describe("getDeployer", () => {
    it(`case 0`, async () => {
      const bondTokenContract = await BondToken.new("", "");

      const res = await bondTokenContract.getDeployer();

      assert.equal(
        res,
        accounts[0],
        "the result of getDeployer differ from expected"
      );
    });
  });

  describe("setRate", () => {
    const cases = describes["setRate"];
    cases.forEach(
      ({rateNumerator, rateDenominator, errorMessage}, caseIndex) => {
        it(`case ${caseIndex}`, async () => {
          const bondTokenContract = await BondToken.new("", "");

          try {
            await bondTokenContract.setRate(rateNumerator, rateDenominator);
          } catch (err) {
            if (err.message === errorMessage) {
              return;
            }

            throw err;
          }

          if (errorMessage !== "") {
            assert.fail("should fail to execute setRate");
          }
        });
      }
    );
  });

  describe("getRate", () => {
    const {rateNumerator, rateDenominator} = describes["setRate"][0];
    let BondTokenAddress: string;

    before(async () => {
      const bondTokenContract = await BondToken.new("", "");
      BondTokenAddress = bondTokenContract.address;
      await bondTokenContract.setRate(rateNumerator, rateDenominator);
    });

    it(`case 0`, async () => {
      const bondTokenContract = await BondToken.at(BondTokenAddress);

      const res = await bondTokenContract.getRate();

      assert.equal(
        res[0].toString(),
        rateNumerator.toString(),
        "the result of getRate differ from expected"
      );
      assert.equal(
        res[1].toString(),
        rateDenominator.toString(),
        "the result of getRate differ from expected"
      );
    });
  });

  describe("violateOnlyMinter", () => {
    it(`case 0`, async () => {
      const errorMessage =
        "Returned error: VM Exception while processing transaction: revert only deployer is allowed to call this function -- Reason given: only deployer is allowed to call this function.";
      const bondTokenContract = await BondToken.new("", "", {
        from: accounts[0],
      });

      try {
        await bondTokenContract.mint(accounts[1], 1, {from: accounts[1]});
      } catch (err) {
        if (err.message === errorMessage) {
          return;
        }

        throw err;
      }

      assert.fail("should fail to execute mint");
    });
  });
});
