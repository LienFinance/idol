import {BigNumber} from "bignumber.js";

import testCases from "../testCases";
import {parseCoordinate} from "../util";

const TestPolyLine = artifacts.require("TestPolyline");

const ten = new BigNumber(10);
const decimal = 4;

contract("PolyLine", () => {
  describe("zip", async () => {
    const cases = testCases["Polyline"]["zip"];
    cases.forEach(({unzipped, zipped}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        let testPolylineContract = await TestPolyLine.new();
        const {x1, y1, x2, y2} = parseCoordinate(unzipped);
        const actual = await testPolylineContract.testZipLineSegment(
          ten.pow(decimal).times(x1).toString(10),
          ten.pow(decimal).times(y1).toString(10),
          ten.pow(decimal).times(x2).toString(10),
          ten.pow(decimal).times(y2).toString(10)
        );
        assert.equal(actual, zipped, "zip failed");
      });
    });
  });

  describe("unzip", async () => {
    const cases = testCases["Polyline"]["unzip"];
    cases.forEach(({unzipped, zipped}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        let testPolylineContract = await TestPolyLine.new();
        const {x1, y1, x2, y2} = parseCoordinate(unzipped);
        const actual = await testPolylineContract.testUnzipLineSegment(zipped);
        assert.equal(
          ten.pow(-decimal).times(actual[0].toString()).toString(10),
          x1.toString(),
          "did not match x1"
        );
        assert.equal(
          ten.pow(-decimal).times(actual[1].toString()).toString(10),
          y1.toString(),
          "did not match y1"
        );
        assert.equal(
          ten.pow(-decimal).times(actual[2].toString()).toString(10),
          x2.toString(),
          "did not match x2"
        );
        assert.equal(
          ten.pow(-decimal).times(actual[3].toString()).toString(10),
          y2.toString(),
          "did not match y2"
        );
      });
    });
  });
});
