import testCases from "./testCases";
import BigNumber from "bignumber.js";

const SolidBondSafety = artifacts.require("TestSolidBondSafety");

contract("SolidBondSafety", (accounts) => {
  describe("isDangerSolidBond", () => {
    const cases = testCases["isDangerSolidBond"];
    cases.forEach(
      (
        {
          errorMessage,
          rateETH2USD,
          solidBondStrikePriceUSD,
          volatility,
          periodSecBeforeMaturity,
          isDanger,
        },
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const SolidBondSafetyContract = await SolidBondSafety.new();

          let actualIsDanger: boolean;
          try {
            const res = await SolidBondSafetyContract.isDangerSolidBond(
              new BigNumber(rateETH2USD).shiftedBy(8).dp(0).toString(10),
              new BigNumber(solidBondStrikePriceUSD)
                .shiftedBy(4)
                .dp(0)
                .toString(10),
              new BigNumber(volatility).shiftedBy(8).dp(0).toString(10),
              new BigNumber(periodSecBeforeMaturity).dp(0).toString(10)
            );

            actualIsDanger = res;
          } catch (err) {
            if (err.message !== errorMessage) {
              assert.fail(err.message);
            }
            return;
          }

          if (errorMessage !== "") {
            assert.fail("did not fail to isDangerSolidBond");
          }

          assert.equal(
            actualIsDanger,
            isDanger,
            "the result of isDangerSolidBond differ from expected"
          );
        });
      }
    );
  });
});
