import {BigNumber} from "bignumber.js";

import testCases from "../testCases";

const TestDigits = artifacts.require("TestDigits");

const ten = new BigNumber(10);
const decimal = 4;

contract("TestDigits", () => {
  describe("testToDigitsString", async () => {
    const cases = testCases["TestDigits"]["testToDigitsString"];
    cases.forEach(({value, digits, valueStr}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const testDigitsContract = await TestDigits.new();
        const actual = await testDigitsContract.testToDigitsString(
          value,
          digits
        );
        assert.equal(actual, valueStr, "the result differ from expected");
      });
    });
  });
});
