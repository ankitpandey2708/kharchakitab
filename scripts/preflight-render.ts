import "dotenv/config";

async function validateSarvamKey(): Promise<void> {
  const key = process.env.SARVAM_KEY;
  if (!key) throw new Error("SARVAM_KEY is not set.");
  const res = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ input: "hi", source_language_code: "auto", target_language_code: "gu-IN" }),
  });
  if (res.status === 401 || res.status === 403) throw new Error(`SARVAM_KEY is invalid (status=${res.status}).`);
}

export async function run(): Promise<void> {
  const checks: Array<[string, () => Promise<void>]> = [
    ["SARVAM_KEY", validateSarvamKey],
  ];

  for (const [name, check] of checks) {
    process.stdout.write(`[Preflight:Render] Checking ${name}... `);
    await check();
    console.log("OK");
  }
}
