import {BigNumber} from "bignumber.js";

import testCases from "./testCases";

const LBTPricing = artifacts.require("LBTPricing");

contract("DecentralizedOTC", () => {
  it("1", async () => {
    const cases = testCases.DecentralizedOTC.pricing;
    let LBTPricingContract = await LBTPricing.new();
    for (let i = 1; i < cases.length; i++) {
      const res = await LBTPricingContract.pricing(
        cases[i][1] * 10000,
        cases[i][0] * 10000,
        cases[i][2] * 100000000,
        cases[i][3] * 365 * 3600 * 24
      );
      console.log(
        "pricing:",
        res.toString(),
        " compare: ",
        (cases[i][4] * 10000).toString()
      );
      assert(
        res >= cases[i][4] * cases[i][5] * 10000 &&
          res <= (cases[i][4] * 10000) / cases[i][5],
        "the theoretical LBT price differs from expected"
      );
    }
  });
});
