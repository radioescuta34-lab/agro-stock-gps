import { createApp } from "../server";

let app: Awaited<ReturnType<typeof createApp>> | null = null;

export default async function handler(req: any, res: any) {
  if (!app) {
    app = await createApp();
  }
  return app(req, res);
}
