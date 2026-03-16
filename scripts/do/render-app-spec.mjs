#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const workspaceRoot = process.cwd();
const envPath = path.join(workspaceRoot, ".env");
const templatePath = path.join(workspaceRoot, "deploy/digitalocean/app-platform.yaml");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    entries[key] = value;
  }

  return entries;
}

function resolveJwtSecret(env) {
  const value = env.JWT_SECRET ?? "";
  if (value && !value.includes("replace-with")) {
    return value;
  }

  return crypto.randomBytes(32).toString("hex");
}

const fileEnv = loadEnvFile(envPath);
const mergedEnv = {
  ...fileEnv,
  ...process.env
};

const replacements = {
  DATABASE_URL: mergedEnv.DO_APP_DATABASE_URL || mergedEnv.DATABASE_URL || "",
  JWT_SECRET: resolveJwtSecret(mergedEnv)
};

let spec = fs.readFileSync(templatePath, "utf8");
for (const [key, value] of Object.entries(replacements)) {
  spec = spec.replaceAll(`\${${key}}`, value);
}

process.stdout.write(spec);
