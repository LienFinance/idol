import * as fs from "fs";

import {Pattern3TestCase} from "./utils";

const dirPath = __dirname + "/cases/";
fs.mkdirSync(dirPath, {recursive: true});
const files = fs.readdirSync(dirPath);
export const pat3cases = (() => {
  const testCases: {[caseIndex: number]: Pattern3TestCase} = {};
  for (const fileName of files) {
    if (fileName.includes(".json")) {
      const caseIndex = fileName.slice(0, -".json".length);
      const testCase = require(`${dirPath}${fileName}`) as Pattern3TestCase;
      testCases[caseIndex] = testCase;
    }
  }
  return testCases;
})();
