import fs from "fs";
import path from "path";

const packageJson = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf-8")
);

const buildInfo = {
    version: packageJson.version || "0.0.0",
    buildDate: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
};

const output = `export const BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)};\n`;

fs.writeFileSync(path.resolve("src/buildInfo.js"), output);

console.log("buildInfo generado:", buildInfo);