import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const resourceGroup = "rg-knowledgestack";

const command = process.argv[2];
if (command !== "what-if" && command !== "create") {
  throw new Error("Pass what-if to preview the change, or create to apply it.");
}

// infra/main.bicepparam reads every secret from the environment of the az process. The file is spread last, so a variable the shell already exports, such as OPENAI_API_KEY, never replaces the value written in infra/.env.
const azureEnvironment = { ...process.env, ...parseEnv(readFileSync("infra/.env", "utf8")) };

// infra/main.bicep sets the image of each app, so an apply with an older tag would put old code on a newer database. The tag that api runs now is the one to keep.
const shown = spawnSync(
  "az",
  ["containerapp", "show", "--name", "api", "--resource-group", resourceGroup, "--query", "properties.template.containers[0].image", "--output", "tsv"],
  { encoding: "utf8" },
);
if (shown.error) {
  throw shown.error;
}
let imageTag;
if (shown.status === 0) {
  const image = shown.stdout.trim();
  imageTag = image.slice(image.lastIndexOf(":") + 1);
} else if (shown.stderr.includes("ResourceNotFound")) {
  // The first apply: no app exists yet, so take the commit at the tip of main on GitHub. The publish job must have finished for that commit, or Azure finds no image under this tag.
  imageTag = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8" }).split("\t")[0];
} else {
  throw new Error(shown.stderr);
}

console.log(`Image tag: ${imageTag}`);
const applied = spawnSync(
  "az",
  [
    "deployment", "group", command,
    "--resource-group", resourceGroup,
    "--parameters", "infra/main.bicepparam",
    ...(command === "create" ? ["--query", "properties.outputs"] : []),
  ],
  { stdio: "inherit", env: { ...azureEnvironment, IMAGE_TAG: imageTag } },
);
process.exit(applied.status ?? 1);
