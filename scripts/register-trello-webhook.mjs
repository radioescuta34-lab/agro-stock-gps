import path from "node:path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const apiBase = "https://api.trello.com/1";
const apiKey = process.env.TRELLO_API_KEY;
const apiToken = process.env.TRELLO_TOKEN;
const listId = process.env.TRELLO_LIST_ID;
const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL;

if (!apiKey || !apiToken || !listId || !callbackUrl) {
  throw new Error("Configure TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_LIST_ID e TRELLO_WEBHOOK_CALLBACK_URL antes de registrar o webhook.");
}
if (!/^https:\/\//i.test(callbackUrl)) {
  throw new Error("TRELLO_WEBHOOK_CALLBACK_URL deve ser uma URL pública HTTPS.");
}

const auth = new URLSearchParams({ key: apiKey, token: apiToken });
let boardId = process.env.TRELLO_BOARD_ID || "";
if (!boardId) {
  const listResponse = await fetch(`${apiBase}/lists/${encodeURIComponent(listId)}?${auth.toString()}&fields=idBoard`);
  if (!listResponse.ok) throw new Error(`Não foi possível identificar o quadro do Trello (${listResponse.status}).`);
  const list = await listResponse.json();
  boardId = typeof list?.idBoard === "string" ? list.idBoard : "";
}
if (!boardId) throw new Error("O quadro do Trello não foi identificado.");

const existingResponse = await fetch(`${apiBase}/tokens/${encodeURIComponent(apiToken)}/webhooks?${auth.toString()}`);
if (!existingResponse.ok) throw new Error(`Não foi possível consultar os webhooks existentes (${existingResponse.status}).`);
const existing = await existingResponse.json();
const alreadyRegistered = Array.isArray(existing) && existing.some((webhook) =>
  webhook?.active !== false && webhook?.idModel === boardId && webhook?.callbackURL === callbackUrl
);

if (alreadyRegistered) {
  console.log("Webhook do Agro Stock GPS já está ativo para este quadro.");
  process.exit(0);
}

const createParams = new URLSearchParams({
  key: apiKey,
  token: apiToken,
  idModel: boardId,
  callbackURL: callbackUrl,
  description: "Agro Stock GPS - sincronização da central de suporte"
});
const createResponse = await fetch(`${apiBase}/webhooks?${createParams.toString()}`, { method: "POST" });
if (!createResponse.ok) {
  const detail = await createResponse.text().catch(() => "");
  throw new Error(`Não foi possível registrar o webhook (${createResponse.status})${detail ? `: ${detail}` : "."}`);
}

console.log("Webhook do Agro Stock GPS registrado com sucesso.");
