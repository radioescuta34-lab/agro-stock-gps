import { createApp } from "../server";

let app: Awaited<ReturnType<typeof createApp>> | null = null;

// Allows the /api/cron/alerts route (and any API) to run up to 30s
export const config = {
  maxDuration: 30
};

export default async function handler(req: any, res: any) {
  if (!app) {
    app = await createApp();
  }
  return app(req, res);
}
