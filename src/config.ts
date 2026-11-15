function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  port: Number(env("PORT", "8080")),
  frigateUrl: env("FRIGATE_URL", "https://127.0.0.1:8971").replace(/\/+$/, ""),
  frigateUser: env("FRIGATE_USER"),
  frigatePassword: env("FRIGATE_PASSWORD"),
  insecureTls: env("FRIGATE_INSECURE_TLS", "true").toLowerCase() === "true",
  token: env("LOOKOUT_TOKEN"),
  // where saved (trimmed) clips are kept; map this folder to appdata in Unraid
  dataDir: env("LOOKOUT_DATA", "./data"),
  ffmpegPath: env("FFMPEG_PATH", "ffmpeg"),
};

export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.frigateUser) missing.push("FRIGATE_USER");
  if (!config.frigatePassword) missing.push("FRIGATE_PASSWORD");
  return missing;
}
