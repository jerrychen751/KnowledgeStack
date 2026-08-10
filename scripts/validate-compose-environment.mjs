import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const environmentVariableNames = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "TENANT_POSTGRES_USER",
  "TENANT_POSTGRES_PASSWORD",
  "TENANT_POSTGRES_DB",
];

for (const environmentVariableName of environmentVariableNames) {
  const environmentVariableValue = process.env[environmentVariableName];

  if (!environmentVariableValue) {
    throw new Error(`${environmentVariableName} must have a value.`);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(environmentVariableValue)) {
    throw new Error(
      `${environmentVariableName} can contain only letters, digits, underscores, and hyphens.`,
    );
  }
}
