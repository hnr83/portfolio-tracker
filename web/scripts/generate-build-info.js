import { writeFileSync } from "fs";
import { execSync } from "child_process";

let commit = "local";

try {
  commit = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const buildDate = new Date().toISOString();

const content = `export const BUILD_INFO = {
  version: "1.0.0",
  buildDate: "${buildDate}",
  commit: "${commit}"
};
`;

writeFileSync("src/buildInfo.js", content);