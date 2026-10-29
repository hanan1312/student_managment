import fs from "fs";
import path from "path";

const MASTER_ACCOUNT_PATH = path.join(__dirname, "..", "master-account.json");

export type MasterAccount = { username: string; password: string; fullName: string };

// The master account lives outside the users table entirely — it's a fixed login defined by
// this file, always available regardless of what's in the database, with unconditional
// access to every module. Everyone else (admins included) is created through the app's own
// Control page (see routes/users.ts) rather than seeded from configuration.
function loadOrCreateMasterAccount(): MasterAccount {
  if (fs.existsSync(MASTER_ACCOUNT_PATH)) {
    return JSON.parse(fs.readFileSync(MASTER_ACCOUNT_PATH, "utf-8"));
  }

  const defaults: MasterAccount = { username: "master", password: "change-me", fullName: "Master Account" };
  // mode 0o600: this file is a plaintext credential, same as server/.env's ADMIN_PASSWORD was.
  fs.writeFileSync(MASTER_ACCOUNT_PATH, JSON.stringify(defaults, null, 2) + "\n", { mode: 0o600 });
  console.log(
    `Created ${MASTER_ACCOUNT_PATH} with a default password — edit it to set a real one, then restart.`
  );
  return defaults;
}

export const masterAccount = loadOrCreateMasterAccount();
