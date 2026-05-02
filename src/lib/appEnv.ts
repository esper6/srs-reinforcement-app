export function isDevEnv(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.APP_ENV === "development";
}
