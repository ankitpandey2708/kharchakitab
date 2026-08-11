// Post-build release step: deploys the Cloudflare signaling worker, then notifies
// IndexNow.
//
// Guarded, because worker/wrangler.toml declares a single worker name with no
// [env.*] sections — every deploy targets the same production worker. Running
// this unguarded from a Vercel preview build would overwrite the live signaling
// worker (and apply Durable Object migrations) from unreviewed code.
//
// Runs when VERCEL_ENV === "production", or locally with --force.
import { spawnSync } from "node:child_process";

const forced = process.argv.includes("--force");
const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv !== "production" && !forced) {
  console.log(
    `[release] skipped — VERCEL_ENV=${vercelEnv ?? "unset"}. Use \`npm run release\` to run it here.`,
  );
  process.exit(0);
}

function run(label, args) {
  console.log(`[release] ${label}`);
  const { status } = spawnSync("npm", args, { stdio: "inherit", shell: true });
  return status === 0;
}

// The worker is the app's signaling backend — a failure here is a real failure.
if (!run("deploying signaling worker", ["run", "deploy:worker"])) {
  console.error("[release] worker deploy failed");
  process.exit(1);
}

// IndexNow is a search-engine notification. It is not part of the deploy
// contract, so a transient 4xx/5xx must not fail a build whose artifacts and
// worker already shipped.
if (!run("pinging IndexNow", ["run", "ping:indexnow"])) {
  console.warn("[release] IndexNow ping failed — continuing, deploy is unaffected.");
}
