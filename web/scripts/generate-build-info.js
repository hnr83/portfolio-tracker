import fs from "fs";
import path from "path";
import packageJson from "../package.json" assert { type: "json" };

const buildInfo = {
  version: packageJson.version,
  buildDate: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
};

const output = `export const BUILD_INFO = ${JSON.stringify(
  buildInfo,
  null,
  2
)};\n`;

fs.writeFileSync(
  path.resolve("src/buildInfo.js"),
  output
);

console.log("buildInfo generado:", buildInfo);