import express from "express";
import path from "path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createWorker } from "tesseract.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  buildLicenseAlertEmail,
  buildLoansAlertEmail,
  buildCampoAlertEmail,
  buildMaintenanceAlertEmail,
  buildIdleComponentsAlertEmail,
  getExpiringLicenses,
  sendAlertEmail,
  isCampoDue,
  isLoansDue,
  getIsoWeekId,
  todayStr,
  resolveSettingsEmails,
  getOverdueMaintenances,
  getCompletedMaintenances,
  getIdleComponents
} from "./alertEmailTemplates.js";

dotenv.config();
// Local dev convention (Vercel CLI): .env.local overrides .env when present
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// Accepts recipients as alertEmails (array) or legacy alertEmail (string, comma/semicolon separated)
function resolveEmails(body: any): string[] {
  if (Array.isArray(body?.alertEmails)) {
    const list: string[] = (body.alertEmails as unknown[])
      .filter((e): e is string => typeof e === 'string')
      .map((e: string) => e.trim())
      .filter(Boolean);
    if (list.length > 0) return [...new Set(list)];
  }
  if (typeof body?.alertEmail === 'string' && body.alertEmail.trim()) {
    const list: string[] = body.alertEmail.split(/[,;]/).map((e: string) => e.trim()).filter(Boolean);
    return [...new Set(list)];
  }
  return [];
}

const TRELLO_API_BASE = "https://api.trello.com/1";
const SUPPORT_ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
const SUPPORT_MAX_ATTACHMENTS = 4;
const SUPPORT_MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const HAS_FIRESTORE_CREDS = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

function generateFallbackTicketId(): string {
  const year = new Date().getFullYear();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SUP-${year}-${suffix}`;
}

// Allocates a readable sequential ticket id (e.g. SUP-2026-0001) via a Firestore
// transaction so concurrent creations never receive the same number. The counter
// resets automatically when the year changes.
async function allocateSequentialTicketId(): Promise<string> {
  if (!HAS_FIRESTORE_CREDS) return generateFallbackTicketId();
  const db = getFirestore();
  const counterRef = db.collection("counters").doc("support_ticket");
  const year = new Date().getFullYear();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    let next = 1;
    if (snap.exists) {
      const data = snap.data() as any;
      if (data?.year === year && typeof data.next === "number" && data.next >= 1) {
        next = data.next;
      }
    }
    tx.set(counterRef, { next: next + 1, year, updatedAt: FieldValue.serverTimestamp() });
    return `SUP-${year}-${String(next).padStart(4, "0")}`;
  });
}

// Maps a Trello list name to a user-facing status by keyword. Unknown lists keep
// the previously stored status.
const SUPPORT_STATUS_KEYWORDS: Array<[string, string]> = [
  ["conclu", "Concluído"],
  ["andamento", "Em Andamento"],
  ["estudo", "Em Estudo"],
  ["novo", "Novo"]
];

function mapTrelloListNameToStatus(name: string): string {
  const n = (name || "").toLowerCase();
  for (const [keyword, status] of SUPPORT_STATUS_KEYWORDS) {
    if (n.includes(keyword)) return status;
  }
  return "";
}

let trelloBoardIdCache: { id: string; fetchedAt: number } | null = null;
async function resolveTrelloBoardId(apiKey: string, apiToken: string, listId: string): Promise<string> {
  if (process.env.TRELLO_BOARD_ID) return process.env.TRELLO_BOARD_ID;
  if (trelloBoardIdCache && Date.now() - trelloBoardIdCache.fetchedAt < 10 * 60 * 1000) {
    return trelloBoardIdCache.id;
  }
  const res = await trelloFetch(`/lists/${listId}?key=${apiKey}&token=${apiToken}&fields=idBoard`);
  if (!res.ok) return "";
  const data = await res.json().catch(() => null);
  const boardId = typeof data?.idBoard === "string" ? data.idBoard : "";
  if (boardId) trelloBoardIdCache = { id: boardId, fetchedAt: Date.now() };
  return boardId;
}

// Cached map of Trello list id -> status label for all lists of the board.
let trelloListStatusCache: { map: Map<string, string>; fetchedAt: number } | null = null;
async function getTrelloListStatusMap(apiKey: string, apiToken: string, listId: string): Promise<Map<string, string>> {
  if (trelloListStatusCache && Date.now() - trelloListStatusCache.fetchedAt < 5 * 60 * 1000) {
    return trelloListStatusCache.map;
  }
  const map = new Map<string, string>();
  try {
    const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
    if (!boardId) return map;
    const res = await trelloFetch(`/boards/${boardId}/lists?key=${apiKey}&token=${apiToken}&fields=id,name`);
    if (!res.ok) return map;
    const lists = await res.json();
    if (Array.isArray(lists)) {
      for (const list of lists) {
        const status = mapTrelloListNameToStatus(list?.name || "");
        if (status && typeof list.id === "string") map.set(list.id, status);
      }
    }
    if (map.size > 0) trelloListStatusCache = { map, fetchedAt: Date.now() };
  } catch (error: any) {
    console.error("Erro ao carregar listas do quadro Trello:", error?.message || error);
  }
  return map;
}

const SUPPORT_PRIORITY_LABEL_NAMES: Record<string, string[]> = {
  baixa: ["baixa", "baixo", "low"],
  media: ["media", "medium"],
  alta: ["alta", "high", "urgente"]
};

const SUPPORT_PRIORITY_LABEL_COLORS: Record<string, string> = {
  baixa: "green",
  media: "yellow",
  alta: "red"
};

let trelloPriorityLabelCache: { map: Map<string, string>; fetchedAt: number } | null = null;

function normalizeTrelloLabelName(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function getTrelloPriorityLabelMap(apiKey: string, apiToken: string, listId: string): Promise<Map<string, string>> {
  if (trelloPriorityLabelCache && Date.now() - trelloPriorityLabelCache.fetchedAt < 5 * 60 * 1000) {
    return trelloPriorityLabelCache.map;
  }

  const map = new Map<string, string>();
  try {
    const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
    if (!boardId) return map;
    const res = await trelloFetch(`/boards/${boardId}/labels?key=${apiKey}&token=${apiToken}&fields=id,name,color&limit=1000`);
    if (!res.ok) return map;
    const labels = await res.json();
    if (!Array.isArray(labels)) return map;

    for (const priority of ["baixa", "media", "alta"]) {
      const names = SUPPORT_PRIORITY_LABEL_NAMES[priority];
      const byName = labels.find((label: any) => names.includes(normalizeTrelloLabelName(label?.name || "")));
      const byColor = labels.find((label: any) => label?.color === SUPPORT_PRIORITY_LABEL_COLORS[priority]);
      const match = byName || byColor;
      if (typeof match?.id === "string") map.set(priority, match.id);
    }

    trelloPriorityLabelCache = { map, fetchedAt: Date.now() };
  } catch (error: any) {
    console.error("Erro ao carregar etiquetas de prioridade do Trello:", error?.message || error);
  }
  return map;
}

interface SupportRequester {
  uid: string;
  email: string;
  name: string;
  verified: boolean;
  invalidToken: boolean;
}

// Resolves the requester identity for support routes. A valid Firebase ID token
// (real mode) takes precedence; otherwise falls back to the client-provided uid
// used by demo mode. An invalid token is rejected instead of falling back.
async function resolveSupportRequester(req: any): Promise<SupportRequester> {
  const header = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    try {
      const decoded = await getAuth().verifyIdToken(token);
      if (decoded?.uid) {
        return {
          uid: decoded.uid,
          email: typeof decoded.email === "string" ? decoded.email.trim() : "",
          name: typeof decoded.name === "string" ? decoded.name.trim() : "",
          verified: true,
          invalidToken: false
        };
      }
    } catch (error: any) {
      console.error("Token inválido em rota de suporte:", error?.message || error);
      return { uid: "", email: "", name: "", verified: false, invalidToken: true };
    }
  }
  const headerUid = typeof req.headers?.["x-client-uid"] === "string" ? (req.headers["x-client-uid"] as string).trim() : "";
  const headerEmail = typeof req.headers?.["x-client-email"] === "string" ? (req.headers["x-client-email"] as string).trim() : "";
  const headerName = typeof req.headers?.["x-client-name"] === "string" ? (req.headers["x-client-name"] as string).trim() : "";
  const bodyUid = typeof req.body?.autorUid === "string" ? req.body.autorUid.trim() : "";
  const bodyEmail = typeof req.body?.autorEmail === "string" ? req.body.autorEmail.trim() : "";
  const bodyName = typeof req.body?.autorNome === "string" ? req.body.autorNome.trim() : "";
  const queryUid = typeof req.query?.uid === "string" ? (req.query.uid as string).trim() : "";
  const uid = [headerUid, bodyUid, queryUid].find((v) => v && v.length <= 128) || "";
  return {
    uid,
    email: (headerEmail || bodyEmail).slice(0, 254),
    name: (headerName || bodyName).slice(0, 160),
    verified: false,
    invalidToken: false
  };
}

async function trelloFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(`${TRELLO_API_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSupportIdentity(value: string): string {
  return (value || "").trim().toLocaleLowerCase("pt-BR");
}

function parseTrelloCardCreatedAt(cardId: string): string | null {
  if (!/^[0-9a-f]{8}/i.test(cardId || "")) return null;
  const seconds = Number.parseInt(cardId.slice(0, 8), 16);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseSupportCardMetadata(description: string): { uid: string; email: string; name: string; prioridade: string } | null {
  const match = (description || "").match(/<!--\s*AGRO_STOCK_SUPPORT:([A-Za-z0-9_-]+)\s*-->/);
  if (!match) return null;
  try {
    const decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return {
      uid: typeof decoded?.uid === "string" ? decoded.uid : "",
      email: typeof decoded?.email === "string" ? decoded.email : "",
      name: typeof decoded?.name === "string" ? decoded.name : "",
      prioridade: ["baixa", "media", "alta"].includes(decoded?.prioridade) ? decoded.prioridade : "media"
    };
  } catch {
    return null;
  }
}

function parseLegacySupportAuthor(description: string): { email: string; name: string } {
  const line = (description || "").match(/(?:\*\*)?Aberto por:(?:\*\*)?\s*([^\r\n]+)/i)?.[1]?.trim() || "";
  const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() || "";
  const identityMarkerIndex = [line.indexOf("("), line.indexOf("[")]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const name = typeof identityMarkerIndex === "number" ? line.slice(0, identityMarkerIndex).trim() : line.trim();
  return { email, name };
}

function parseLegacySupportPriority(description: string): string {
  const label = (description || "").match(/(?:\*\*)?Prioridade:(?:\*\*)?[^\r\n]*(Baixa|M[eé]dia|Alta)/i)?.[1]?.toLocaleLowerCase("pt-BR") || "";
  if (label === "alta") return "alta";
  if (label === "baixa") return "baixa";
  return "media";
}

function supportCardBelongsToRequester(
  metadata: ReturnType<typeof parseSupportCardMetadata>,
  legacyAuthor: ReturnType<typeof parseLegacySupportAuthor>,
  requester: SupportRequester
): boolean {
  const requesterUid = normalizeSupportIdentity(requester.uid);
  const requesterEmail = normalizeSupportIdentity(requester.email);
  const requesterName = normalizeSupportIdentity(requester.name);
  const metadataUid = normalizeSupportIdentity(metadata?.uid || "");
  const metadataEmail = normalizeSupportIdentity(metadata?.email || "");
  const legacyEmail = normalizeSupportIdentity(legacyAuthor.email);
  const legacyName = normalizeSupportIdentity(legacyAuthor.name);

  if (requesterUid && metadataUid && requesterUid === metadataUid) return true;
  if (requesterEmail && metadataEmail && requesterEmail === metadataEmail) return true;
  if (requesterEmail && legacyEmail && requesterEmail === legacyEmail) return true;
  return Boolean(requesterName && legacyName && requesterName === legacyName);
}

type SupportComment = {
  id: string;
  text: string;
  createdAt: string | null;
  authorName: string;
  source: "app" | "trello";
  attachments?: Array<{ id: string; filename: string; url: string }>;
};

const SUPPORT_APP_COMMENT_HEADER = "Resposta do cliente via Agro Stock GPS";
const SUPPORT_WAITING_LABELS = {
  client: { name: "Aguardando cliente", color: "yellow", aliases: ["aguardando cliente", "aguardando usuario"] },
  support: { name: "Aguardando suporte", color: "sky", aliases: ["aguardando suporte", "aguardando equipe"] }
} as const;

type SupportWaitingSide = keyof typeof SUPPORT_WAITING_LABELS;

let trelloWaitingLabelCache: { map: Map<SupportWaitingSide, string>; fetchedAt: number } | null = null;
let trelloWaitingLabelPromise: Promise<Map<SupportWaitingSide, string>> | null = null;

async function getTrelloWaitingLabelMap(
  apiKey: string,
  apiToken: string,
  listId: string
): Promise<Map<SupportWaitingSide, string>> {
  if (trelloWaitingLabelCache && Date.now() - trelloWaitingLabelCache.fetchedAt < 5 * 60 * 1000) {
    return trelloWaitingLabelCache.map;
  }
  if (trelloWaitingLabelPromise) return trelloWaitingLabelPromise;

  trelloWaitingLabelPromise = (async () => {
    const map = new Map<SupportWaitingSide, string>();
    const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
    if (!boardId) return map;

    const query = new URLSearchParams({ key: apiKey, token: apiToken, fields: "id,name,color", limit: "1000" });
    const labelsRes = await trelloFetch(`/boards/${encodeURIComponent(boardId)}/labels?${query.toString()}`);
    if (!labelsRes.ok) throw new Error(`Não foi possível consultar as etiquetas do Trello (${labelsRes.status}).`);
    const labels = await labelsRes.json();
    const available = Array.isArray(labels) ? labels : [];

    for (const side of Object.keys(SUPPORT_WAITING_LABELS) as SupportWaitingSide[]) {
      const definition = SUPPORT_WAITING_LABELS[side];
      const match = available.find((label: any) =>
        definition.aliases.some((alias) => normalizeTrelloLabelName(label?.name || "") === alias)
      );
      if (typeof match?.id === "string") {
        map.set(side, match.id);
        continue;
      }

      const createQuery = new URLSearchParams({
        key: apiKey,
        token: apiToken,
        idBoard: boardId,
        name: definition.name,
        color: definition.color
      });
      const createRes = await trelloFetch(`/labels?${createQuery.toString()}`, { method: "POST" });
      if (!createRes.ok) {
        console.error(`Não foi possível criar a etiqueta "${definition.name}" no Trello (${createRes.status}).`);
        continue;
      }
      const created = await createRes.json();
      if (typeof created?.id === "string") map.set(side, created.id);
    }

    trelloWaitingLabelCache = { map, fetchedAt: Date.now() };
    return map;
  })();

  try {
    return await trelloWaitingLabelPromise;
  } finally {
    trelloWaitingLabelPromise = null;
  }
}

async function setTrelloWaitingState(
  apiKey: string,
  apiToken: string,
  listId: string,
  cardId: string,
  target: SupportWaitingSide | null
): Promise<void> {
  const labelMap = await getTrelloWaitingLabelMap(apiKey, apiToken, listId);
  const cardQuery = new URLSearchParams({ key: apiKey, token: apiToken, fields: "idLabels" });
  const cardRes = await trelloFetch(`/cards/${encodeURIComponent(cardId)}?${cardQuery.toString()}`);
  if (!cardRes.ok) throw new Error(`Não foi possível consultar o card do Trello (${cardRes.status}).`);
  const card = await cardRes.json();
  const current = new Set<string>(Array.isArray(card?.idLabels) ? card.idLabels : []);

  for (const side of Object.keys(SUPPORT_WAITING_LABELS) as SupportWaitingSide[]) {
    const labelId = labelMap.get(side);
    if (!labelId) continue;
    const shouldExist = target === side;
    if (shouldExist && !current.has(labelId)) {
      const addQuery = new URLSearchParams({ key: apiKey, token: apiToken, value: labelId });
      const addRes = await trelloFetch(`/cards/${encodeURIComponent(cardId)}/idLabels?${addQuery.toString()}`, { method: "POST" });
      if (!addRes.ok) throw new Error(`Não foi possível aplicar a etiqueta "${SUPPORT_WAITING_LABELS[side].name}" (${addRes.status}).`);
    } else if (!shouldExist && current.has(labelId)) {
      const removeQuery = new URLSearchParams({ key: apiKey, token: apiToken });
      const removeRes = await trelloFetch(
        `/cards/${encodeURIComponent(cardId)}/idLabels/${encodeURIComponent(labelId)}?${removeQuery.toString()}`,
        { method: "DELETE" }
      );
      if (!removeRes.ok) throw new Error(`Não foi possível remover a etiqueta "${SUPPORT_WAITING_LABELS[side].name}" (${removeRes.status}).`);
    }
  }
}

function isValidTrelloWebhookSignature(rawBody: Buffer, receivedSignature: string): boolean {
  const secret = process.env.TRELLO_API_SECRET || "";
  const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL || "";
  if (!secret || !callbackUrl || !receivedSignature) return false;
  const expected = createHmac("sha1", secret).update(Buffer.concat([rawBody, Buffer.from(callbackUrl)])).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parseSupportComment(action: any): SupportComment | null {
  const rawText = typeof action?.data?.text === "string" ? action.data.text.trim() : "";
  if (!rawText || typeof action?.id !== "string") return null;

  const isAppComment = rawText.includes(SUPPORT_APP_COMMENT_HEADER);
  const appAuthor = isAppComment
    ? rawText.match(/\*\*Nome:\*\*\s*([^\r\n]+)/i)?.[1]?.trim() || "Cliente"
    : "";
  const appBody = isAppComment
    ? rawText.split(/\r?\n\s*\r?\n/).slice(1).join("\n\n").trim()
    : rawText;
  const attachments: Array<{ id: string; filename: string; url: string }> = [];
  if (isAppComment) {
    const attachmentPattern = /\*\*Anexo:\*\*\s*\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/gi;
    for (const match of rawText.matchAll(attachmentPattern)) {
      const attachmentId = match[2].match(/\/attachments\/([a-f0-9]{24})(?:\/|$)/i)?.[1] || "";
      attachments.push({ id: attachmentId, filename: match[1].trim(), url: match[2] });
    }
  }
  const trelloAuthor = typeof action?.memberCreator?.fullName === "string" && action.memberCreator.fullName.trim()
    ? action.memberCreator.fullName.trim()
    : typeof action?.memberCreator?.username === "string" && action.memberCreator.username.trim()
      ? action.memberCreator.username.trim()
      : "Equipe de suporte";

  return {
    id: action.id,
    text: appBody || rawText,
    createdAt: typeof action?.date === "string" ? action.date : null,
    authorName: isAppComment ? appAuthor : trelloAuthor,
    source: isAppComment ? "app" : "trello",
    attachments
  };
}

async function loadTrelloCommentMap(
  apiKey: string,
  apiToken: string,
  boardId: string
): Promise<Map<string, SupportComment[]>> {
  const query = new URLSearchParams({
    key: apiKey,
    token: apiToken,
    filter: "commentCard",
    limit: "1000",
    fields: "id,date,data",
    memberCreator: "true",
    memberCreator_fields: "fullName,username"
  });
  const actionsRes = await trelloFetch(`/boards/${boardId}/actions?${query.toString()}`);
  if (!actionsRes.ok) {
    throw new Error(`Não foi possível consultar os comentários no Trello (${actionsRes.status}).`);
  }

  const actions = await actionsRes.json();
  const commentsByCard = new Map<string, SupportComment[]>();
  if (!Array.isArray(actions)) return commentsByCard;

  for (const action of actions) {
    const cardId = typeof action?.data?.card?.id === "string" ? action.data.card.id : "";
    const comment = parseSupportComment(action);
    if (!cardId || !comment) continue;
    const comments = commentsByCard.get(cardId) || [];
    comments.push(comment);
    commentsByCard.set(cardId, comments);
  }
  for (const comments of commentsByCard.values()) {
    comments.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aTime - bTime;
    });
  }
  return commentsByCard;
}

async function loadTrelloTicketsForRequester(
  apiKey: string,
  apiToken: string,
  listId: string,
  requester: SupportRequester
): Promise<any[]> {
  const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
  if (!boardId) throw new Error("Não foi possível identificar o quadro de suporte no Trello.");

  const statusMap = await getTrelloListStatusMap(apiKey, apiToken, listId);
  const cardsRes = await trelloFetch(`/boards/${boardId}/cards?key=${apiKey}&token=${apiToken}&fields=id,idList,name,desc,dateLastActivity,badges`);
  if (!cardsRes.ok) throw new Error(`Não foi possível consultar os chamados no Trello (${cardsRes.status}).`);
  const cards = await cardsRes.json();
  if (!Array.isArray(cards)) return [];

  let commentsByCard = new Map<string, SupportComment[]>();
  try {
    commentsByCard = await loadTrelloCommentMap(apiKey, apiToken, boardId);
  } catch (error: any) {
    // Comments are best-effort so a temporary Trello failure does not hide tickets.
    console.error("Erro ao carregar comentários dos chamados:", error?.message || error);
  }

  return cards.flatMap((card: any) => {
    const titleMatch = typeof card?.name === "string" ? card.name.match(/^\[([^\]]+)]\s*(.+)$/) : null;
    if (!titleMatch || typeof card?.id !== "string") return [];
    const description = typeof card.desc === "string" ? card.desc : "";
    const metadata = parseSupportCardMetadata(description);
    const legacyAuthor = parseLegacySupportAuthor(description);
    if (!supportCardBelongsToRequester(metadata, legacyAuthor, requester)) return [];

    return [{
      id: titleMatch[1],
      titulo: titleMatch[2],
      descricao: description.replace(/<!--\s*AGRO_STOCK_SUPPORT:[A-Za-z0-9_-]+\s*-->/, "").split(/\r?\n---\r?\n/).slice(1).join("\n---\n").trim(),
      prioridade: metadata?.prioridade || parseLegacySupportPriority(description),
      status: statusMap.get(card.idList) || "Novo",
      autorNome: metadata?.name || legacyAuthor.name,
      comments: commentsByCard.get(card.id) || [],
      anexosEnviados: typeof card?.badges?.attachments === "number" ? card.badges.attachments : 0,
      trelloCardId: card.id,
      createdAt: parseTrelloCardCreatedAt(card.id),
      updatedAt: typeof card.dateLastActivity === "string" ? card.dateLastActivity : null
    }];
  });
}

export async function createApp() {
  const app = express();

  // Initialize firebase-admin safely
  try {
    if (getApps().length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccount) {
        initializeApp({
          credential: JSON.parse(serviceAccount),
        });
        console.log("Firebase Admin initialized with service account");
      } else {
        initializeApp({
          projectId: "agrostock-gps",
        });
        console.log("Firebase Admin initialized with projectId only");
      }
    }
  } catch (error: any) {
    console.error("Failed to initialize Firebase Admin:", error.message || error);
  }

  // Crucial: Increase body size limit for base64 image uploads
  app.use(express.json({
    limit: "15mb",
    verify: (req: any, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    }
  }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // Trello validates the callback with HEAD before creating a webhook.
  app.head("/api/support/trello/webhook", (_req, res) => res.sendStatus(200));

  // Receives Trello events even when no user has the Agro Stock app open.
  app.post("/api/support/trello/webhook", async (req: any, res) => {
    const apiKey = process.env.TRELLO_API_KEY;
    const apiToken = process.env.TRELLO_TOKEN;
    const listId = process.env.TRELLO_LIST_ID;
    const signature = typeof req.headers?.["x-trello-webhook"] === "string" ? req.headers["x-trello-webhook"] : "";
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.alloc(0);

    if (!apiKey || !apiToken || !listId || !process.env.TRELLO_API_SECRET || !process.env.TRELLO_WEBHOOK_CALLBACK_URL) {
      return res.status(503).json({ error: "Webhook do Trello não configurado." });
    }
    if (!isValidTrelloWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: "Assinatura do webhook inválida." });
    }

    // Acknowledge only after processing so failed executions are visible in Trello's webhook diagnostics.
    try {
      const action = req.body?.action;
      const actionType = typeof action?.type === "string" ? action.type : "";
      const cardId = typeof action?.data?.card?.id === "string" ? action.data.card.id : "";
      if (!cardId) return res.sendStatus(200);

      if (actionType === "commentCard") {
        const text = typeof action?.data?.text === "string" ? action.data.text : "";
        await setTrelloWaitingState(apiKey, apiToken, listId, cardId, text.includes(SUPPORT_APP_COMMENT_HEADER) ? "support" : "client");
      } else if (actionType === "updateCard" && typeof action?.data?.listAfter?.id === "string") {
        const statusMap = await getTrelloListStatusMap(apiKey, apiToken, listId);
        const status = statusMap.get(action.data.listAfter.id) || "";
        if (status === "Concluído") await setTrelloWaitingState(apiKey, apiToken, listId, cardId, null);

        if (HAS_FIRESTORE_CREDS && status) {
          const db = getFirestore();
          const snapshot = await db.collection("supportTickets").where("trelloCardId", "==", cardId).limit(1).get();
          if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
          }
        }
      }

      return res.sendStatus(200);
    } catch (error: any) {
      console.error("Erro ao processar webhook do Trello:", error?.message || error);
      return res.status(500).json({ error: "Falha ao processar evento do Trello." });
    }
  });

  function getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai': return 'gpt-4o-mini';
      case 'deepseek': return 'deepseek-chat';
      case 'gemini': return 'gemini-3.5-flash';
      case 'claude': return 'claude-sonnet-4-20250514';
      default: return 'deepseek-chat';
    }
  }

  async function callAIProvider(
    systemPrompt: string,
    userPrompt: string,
    config: { provider: string; apiKey: string; model: string }
  ): Promise<string> {
    const { provider, apiKey, model } = config;

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 2000, temperature: 0.1
        })
      });
      if (!response.ok) throw new Error(`OpenAI API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Resposta em branco do modelo ${model}.`);
      return content;
    }

    if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 2000, temperature: 0.1
        })
      });
      if (!response.ok) throw new Error(`DeepSeek API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Resposta em branco do modelo ${model}.`);
      return content;
    }

    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
      });
      if (!response.ok) throw new Error(`Gemini API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Resposta em branco do modelo Gemini.');
      return text;
    }

    if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model, max_tokens: 2000, system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!response.ok) throw new Error(`Claude API (${response.status}): ${await response.text().catch(() => '')}`);
      const data = await response.json();
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('Resposta em branco do modelo Claude.');
      return text;
    }

    throw new Error(`Provedor não suportado: ${provider}`);
  }

  // Try new format (AI_API_KEY, AI_PROVIDER, AI_MODEL), fallback to old DEEPSEEK_API_KEY
  let aiConfig: { provider: string; apiKey: string; model: string } | null = null;
  const envApiKey = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const envProvider = process.env.AI_PROVIDER || 'deepseek';
  const envModel = process.env.AI_MODEL || getDefaultModel(envProvider);
  if (envApiKey) {
    aiConfig = { provider: envProvider, apiKey: envApiKey, model: envModel };
  }

  // Only try Firestore if a service account is configured
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const db = getFirestore();
      const configDoc = await db.collection('settings').doc('app_config').get();
      if (configDoc.exists) {
        const data = configDoc.data()!;
        if (data.aiApiKey) {
          aiConfig = {
            provider: data.aiProvider || 'deepseek',
            apiKey: data.aiApiKey,
            model: data.aiModel || getDefaultModel(data.aiProvider || 'deepseek')
          };
          console.log("[Settings] AI config loaded from Firestore");
        } else if (data.deepseekApiKey) {
          // Migrate old format
          aiConfig = { provider: 'deepseek', apiKey: data.deepseekApiKey, model: 'deepseek-chat' };
          console.log("[Settings] Legacy DeepSeek config loaded from Firestore");
        }
      }
    } catch (e: any) {
      console.log("[Settings] Could not load from Firestore: " + e.message);
    }
  }

  // API Route for parsing license images
  app.post("/api/licenses/parse-image", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64 || !mimeType) {
        return res.status(400).json({ error: "Dados de imagem inválidos ou ausentes na requisição." });
      }

      if (!aiConfig || !aiConfig.apiKey) {
        return res.status(500).json({ 
          error: "Chave de API não configurada no servidor. Acesse Configurações > Integrações > A.I. para configurar." 
        });
      }

      // Step 1: OCR local com Tesseract.js
      console.log("[OCR] Iniciando reconhecimento de texto na imagem...");
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const worker = await createWorker('por+eng');
      const { data } = await worker.recognize(imageBuffer);
      await worker.terminate();

      const extractedText = data.text?.trim();
      if (!extractedText || extractedText.length < 10) {
        throw new Error("Não foi possível extrair texto da imagem. Verifique se a imagem está legível e tente novamente.");
      }
      console.log(`[OCR] Texto extraído (${extractedText.length} caracteres):`, extractedText.substring(0, 300));

      // Step 2: AI estrutura o texto em JSON
      const systemPrompt = "Você é um assistente especializado em extrair dados estruturados de licenças agrícolas Trimble/Topcon. Sempre responda com um objeto JSON válido.";
      const userPrompt = `Analise o texto extraído de um documento de ativação de licença agrícola (Trimble ou Topcon) abaixo e extraia os campos solicitados.

Instruções Especiais de Extração:
1. Fabricante (brand): Identifique se é 'Trimble' ou 'Topcon'.
2. Serviço (subscriptionService): Extraia o nome exato do serviço (ex: 'Ag Regional CenterPoint RTX Plus 1 Year (Brazil Only)').
3. Datas (startDate, expirationDate): Converta datas como '18-JUL-2026' para ISO 'YYYY-MM-DD' (ex: '2026-07-18'). Mapeamento: JAN=01, FEV=02, MAR=03, ABR=04, MAI=05, JUN=06, JUL=07, AGO=08, SET=09, OUT=10, NOV=11, DEZ=12.
4. Número de Série (serialNumber): Extraia sob 'Número De Série' ou 'Serial Number'.
5. Modelo (model): Extraia o modelo (ex: 'XCN-2050' ou 'GFX-750').
6. Código de permissão de ativação (permissionCode): Código hash em Base64 ou chave alfanumérica, extraia o valor completo incluindo '=' no final.
7. Chave Master Unlock (masterUnlockKey): Se houver, extraia o valor completo.

Retorne APENAS um objeto JSON SEM formatação adicional (sem markdown, sem code blocks) com estes campos: subscriptionService, brand, startDate, expirationDate, serialNumber, model, permissionCode, masterUnlockKey

Texto extraído:
${extractedText}`;

      const content = await callAIProvider(systemPrompt, userPrompt, aiConfig);

      let jsonStr = content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsedData = JSON.parse(jsonStr);
      return res.json(parsedData);
    } catch (error: any) {
      console.error("Erro na análise OCR/AI de licença:", error);
      return res.status(500).json({ error: error.message || "Falha na análise da imagem da licença." });
    }
  });

  // Generic helper to persist AI config
  async function persistAiConfig(config: { provider: string; apiKey: string; model: string }) {
    aiConfig = config;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const dbs = getFirestore();
        await dbs.collection('settings').doc('app_config').set({
          aiProvider: config.provider,
          aiApiKey: config.apiKey,
          aiModel: config.model,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e: any) {
        console.log("[Settings] Could not persist to Firestore, saved in memory only (" + e.message + ")");
      }
    } else {
      console.log("[Settings] No FIREBASE_SERVICE_ACCOUNT_KEY, config saved in memory only");
    }
    console.log(`[Settings] AI config saved (provider: ${config.provider}, model: ${config.model})`);
  }

  // POST /api/settings/ai — new multi-provider endpoint
  app.post("/api/settings/ai", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "Chave da API não informada." });
      }
      const actualProvider = provider || 'deepseek';
      await persistAiConfig({
        provider: actualProvider,
        apiKey: apiKey.trim(),
        model: model || getDefaultModel(actualProvider)
      });
      return res.json({ success: true, provider: actualProvider, model: model || getDefaultModel(actualProvider) });
    } catch (error: any) {
      console.error("Erro ao salvar configuração AI:", error);
      return res.status(500).json({ error: error.message || "Erro ao salvar configuração AI." });
    }
  });

  // POST /api/settings/ai-key — backward-compatible (accepts just apiKey, defaults to deepseek)
  app.post("/api/settings/ai-key", async (req, res) => {
    try {
      const { apiKey, provider, model } = req.body;
      if (!apiKey) {
        return res.status(400).json({ error: "Chave da API não informada." });
      }
      const actualProvider = provider || 'deepseek';
      await persistAiConfig({
        provider: actualProvider,
        apiKey: apiKey.trim(),
        model: model || getDefaultModel(actualProvider)
      });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao salvar chave de API:", error);
      return res.status(500).json({ error: error.message || "Erro ao salvar chave de API." });
    }
  });

  // GET /api/settings/ai/status — new multi-provider status
  app.get("/api/settings/ai/status", async (req, res) => {
    try {
      let config = aiConfig;
      if (!config && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const dbs = getFirestore();
          const configDoc = await dbs.collection('settings').doc('app_config').get();
          if (configDoc.exists) {
            const data = configDoc.data()!;
            if (data.aiApiKey) {
              config = { provider: data.aiProvider || 'deepseek', apiKey: data.aiApiKey, model: data.aiModel || getDefaultModel(data.aiProvider || 'deepseek') };
            } else if (data.deepseekApiKey) {
              config = { provider: 'deepseek', apiKey: data.deepseekApiKey, model: 'deepseek-chat' };
            }
          }
        } catch (e) {}
      }
      return res.json({
        configured: !!(config?.apiKey),
        provider: config?.provider || null,
        model: config?.model || null
      });
    } catch (error: any) {
      return res.json({ configured: false, provider: null, model: null });
    }
  });

  // GET /api/settings/ai-key/status — backward-compatible (no longer returns the key)
  app.get("/api/settings/ai-key/status", async (req, res) => {
    try {
      let configured = !!(aiConfig?.apiKey);
      let providerName = aiConfig?.provider || 'deepseek';
      if (!aiConfig && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const dbs = getFirestore();
          const configDoc = await dbs.collection('settings').doc('app_config').get();
          if (configDoc.exists) {
            const data = configDoc.data()!;
            configured = !!(data.aiApiKey || data.deepseekApiKey);
            providerName = data.aiProvider || 'deepseek';
          }
        } catch (e) {}
      }
      return res.json({ configured, provider: providerName });
    } catch (error: any) {
      return res.json({ configured: !!(aiConfig?.apiKey), provider: aiConfig?.provider || 'deepseek' });
    }
  });

  // POST /api/settings/ai/test — test any provider
  app.post("/api/settings/ai/test", async (req, res) => {
    try {
      const { apiKey, provider, model } = req.body;
      const testProvider = provider || aiConfig?.provider || 'deepseek';
      const testKey = apiKey || aiConfig?.apiKey || '';
      const testModel = model || aiConfig?.model || getDefaultModel(testProvider);

      if (!testKey) {
        return res.status(400).json({ error: "Nenhuma chave para testar." });
      }

      await callAIProvider(
        "Você é um assistente útil.",
        "Responda apenas: OK",
        { provider: testProvider, apiKey: testKey, model: testModel }
      );

      return res.json({ success: true, provider: testProvider, model: testModel });
    } catch (error: any) {
      console.error("Erro ao testar conexão AI:", error);
      const message = error.message || "Falha ao testar conexão.";
      let errorType = 'api_error';

      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('quota') || message.includes('Quota')) {
        errorType = 'quota_exceeded';
      } else if (message.includes('503') || message.includes('UNAVAILABLE') || message.includes('high demand') || message.includes('temporarily')) {
        errorType = 'model_unavailable';
      } else if (message.includes('401') || message.includes('403') || message.includes('UNAUTHENTICATED') || message.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || message.includes('PERMISSION_DENIED')) {
        errorType = 'auth_error';
      } else if (message.includes('404') || message.includes('not found') || message.includes('NOT_FOUND')) {
        errorType = 'model_not_found';
      }

      return res.status(500).json({ error: message, errorType });
    }
  });

  // POST /api/settings/ai-key/test — backward-compatible
  app.post("/api/settings/ai-key/test", async (req, res) => {
    try {
      const { apiKey } = req.body;
      const testKey = apiKey || aiConfig?.apiKey || '';
      const testProvider = aiConfig?.provider || 'deepseek';
      const testModel = aiConfig?.model || getDefaultModel(testProvider);

      if (!testKey) {
        return res.status(400).json({ error: "Nenhuma chave para testar." });
      }

      await callAIProvider(
        "Você é um assistente útil.",
        "Responda apenas: OK",
        { provider: testProvider, apiKey: testKey, model: testModel }
      );

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao testar conexão AI:", error);
      return res.status(500).json({ error: error.message || "Falha ao testar conexão." });
    }
  });

  // API Route for sending license expiration email alerts
  app.post("/api/licenses/send-alert-email", async (req, res) => {
    try {
      const { days, licenses, mode } = req.body;
      const alertEmails = resolveEmails(req.body);
      if (alertEmails.length === 0) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!licenses || !Array.isArray(licenses) || licenses.length === 0) {
        return res.status(400).json({ error: "Nenhuma licença fornecida para o alerta." });
      }

      // Check if SMTP environment variables are defined
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";

      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      const isExpired = mode === 'expired';
      const { title, html } = buildLicenseAlertEmail(licenses, days, isExpired ? 'expired' : 'upcoming');

      if (isSmtpConfigured) {
        // Create Transporter
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465, // true for 465, false for other ports
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        // Send Email to all recipients
        for (const alertEmail of alertEmails) {
          await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: alertEmail,
            subject: title,
            html,
          });
          console.log(`✉️  [Nodemailer] Alerta de expiração enviado com SUCESSO para ${alertEmail}`);
        }

        return res.json({
          success: true,
          message: `${isExpired ? 'E-mail de alerta de licenças vencidas' : `E-mail de alerta de ${days} dias`} enviado com sucesso para ${alertEmails.join(', ')}!`,
          sentCount: licenses.length,
          simulated: false
        });
      } else {
        // Simulate sending and show detailed debug message in terminal + response
        console.log(`\n========================================================================`);
        console.log(`✉️  [SIMULAÇÃO DE EMAIL] ${isExpired ? 'LICENÇAS VENCIDAS' : `ALERTA DE VENCIMENTO DE LICENÇA (${days} DIAS)`}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`Para: ${alertEmails.join(', ')}`);
        console.log(`Assunto: ${title}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`[Aviso do Servidor] Configurações de SMTP do servidor não foram preenchidas.`);
        console.log(`Para envio em produção, cadastre as seguintes variáveis em Configurações > Secrets:`);
        console.log(`- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL`);
        console.log(`------------------------------------------------------------------------`);
        
        licenses.forEach((lic: any, idx: number) => {
          console.log(`  [Licença #${idx + 1}] ${lic.name} | S/N: ${lic.deviceSerialNumber || lic.associatedComponentSerial || 'Não cadastrado'} | Exp: ${lic.expirationDate}`);
        });
        console.log(`========================================================================\n`);

        return res.json({
          success: true,
          simulated: true,
          sentCount: licenses.length,
          message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o email com as licenças e seus respectivos Números de Série foi impresso no console de desenvolvimento. Para receber em sua caixa de entrada, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL nas configurações de Secrets do AI Studio.`
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de licença:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });

  // API Route for sending loan expiration/overdue email alerts
  app.post("/api/loans/send-alert-email", async (req, res) => {
    try {
      const { loans } = req.body;
      const alertEmails = resolveEmails(req.body);
      if (alertEmails.length === 0) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!loans || !Array.isArray(loans) || loans.length === 0) {
        return res.status(400).json({ error: "Nenhum empréstimo fornecido para o alerta." });
      }

      // Check if SMTP environment variables are defined
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";

      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      const { title, html } = buildLoansAlertEmail(loans);

      if (isSmtpConfigured) {
        // Create Transporter
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        // Send Email to all recipients
        for (const alertEmail of alertEmails) {
          await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: alertEmail,
            subject: title,
            html,
          });
          console.log(`✉️  [Nodemailer] Alerta de empréstimos vencidos enviado com SUCESSO para ${alertEmail}`);
        }

        return res.json({
          success: true,
          message: `E-mail de alerta de empréstimos vencidos enviado com sucesso para ${alertEmails.join(', ')}!`,
          sentCount: loans.length,
          simulated: false
        });
      } else {
        // Simulate sending
        console.log(`\n========================================================================`);
        console.log(`✉️  [SIMULAÇÃO DE EMAIL] ENVIANDO ALERTA DE EMPRÉSTIMOS VENCIDOS`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`Para: ${alertEmails.join(', ')}`);
        console.log(`Assunto: ${title}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`[Aviso do Servidor] Configurações de SMTP do servidor não foram preenchidas.`);
        console.log(`Para envio em produção, configure as variáveis em Secrets.`);
        console.log(`========================================================================\n`);

        return res.json({
          success: true,
          simulated: true,
          sentCount: loans.length,
          message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o email com as licenças e seus respectivos Números de Série foi impresso no console de desenvolvimento. Para receber em sua caixa de entrada, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL nas configurações de Secrets do AI Studio.`
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de empréstimo:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });

  // API Route for sending weekly field data collection pending fronts email alerts
  app.post("/api/field-data/send-alert-email", async (req, res) => {
    try {
      const { weekId, weekLabel, pendingMachinesCount, frentesPendente, frentesEmAndamento } = req.body;
      const alertEmails = resolveEmails(req.body);
      if (alertEmails.length === 0) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!weekId) {
        return res.status(400).json({ error: "Semana não especificada." });
      }

      // Check if SMTP environment variables are defined
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";

      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      const weekLabelSafe = weekLabel || weekId;
      const pendingTotal = typeof pendingMachinesCount === 'number' ? pendingMachinesCount : 0;
      const frentesPend = Array.isArray(frentesPendente) ? frentesPendente : [];
      const frentesAndamento = Array.isArray(frentesEmAndamento) ? frentesEmAndamento : [];

      const { title, html } = buildCampoAlertEmail({
        weekId,
        weekLabel: weekLabelSafe,
        pendingMachinesCount: pendingTotal,
        frentesPendente: frentesPend,
        frentesEmAndamento: frentesAndamento
      });

      if (isSmtpConfigured) {
        // Create Transporter
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        // Send Email to all recipients
        for (const alertEmail of alertEmails) {
          await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: alertEmail,
            subject: title,
            html,
          });
          console.log(`✉️  [Nodemailer] Alerta de recolhimento de dados de campo enviado com SUCESSO para ${alertEmail}`);
        }

        return res.json({
          success: true,
          message: `E-mail de alerta de recolhimento de dados de campo enviado com sucesso para ${alertEmails.join(', ')}!`,
          simulated: false
        });
      } else {
        // Simulate sending
        console.log(`\n========================================================================`);
        console.log(`✉️  [SIMULAÇÃO DE EMAIL] ENVIANDO ALERTA DE RECOLHIMENTO DE DADOS DE CAMPO`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`Para: ${alertEmails.join(', ')}`);
        console.log(`Assunto: ${title}`);
        console.log(`Semana: ${weekLabelSafe} (${weekId})`);
        console.log(`Máquinas pendentes: ${pendingTotal}`);
        console.log(`------------------------------------------------------------------------`);
        console.log(`[Aviso do Servidor] Configurações de SMTP do servidor não foram preenchidas.`);
        console.log(`Para envio em produção, configure as variáveis em Secrets.`);
        console.log(`========================================================================\n`);

        return res.json({
          success: true,
          simulated: true,
          message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o email com as frentes pendentes foi impresso no console de desenvolvimento. Para receber em sua caixa de entrada, configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM_EMAIL nas configurações de Secrets do AI Studio.`
        });
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de recolhimento de dados:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });


  // API Route for sending maintenance alerts (overdue / completed)
  app.post("/api/maintenances/send-alert-email", async (req, res) => {
    try {
      const { maintenances, kind, overdueDays } = req.body;
      const alertEmails = resolveEmails(req.body);
      if (alertEmails.length === 0) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!maintenances || !Array.isArray(maintenances) || maintenances.length === 0) {
        return res.status(400).json({ error: "Nenhuma manutenção fornecida para o alerta." });
      }

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";
      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      const decorated = (maintenances as any[]).map((m: any) => ({ ...m, overdueDays }));
      const { title, html } = buildMaintenanceAlertEmail(decorated, kind === 'completed' ? 'completed' : 'overdue');

      if (isSmtpConfigured) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass }
        });
        for (const alertEmail of alertEmails) {
          await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: alertEmail,
            subject: title,
            html
          });
          console.log(`✉️  [Nodemailer] Alerta de manutenções enviado com SUCESSO para ${alertEmail}`);
        }
        return res.json({
          success: true,
          message: `E-mail de alerta de manutenções enviado com sucesso para ${alertEmails.join(', ')}!`,
          sentCount: maintenances.length,
          simulated: false
        });
      }

      console.log(`\n========================================================================`);
      console.log(`✉️  [SIMULAÇÃO DE EMAIL] ALERTA DE MANUTENÇÕES (${kind})`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`Para: ${alertEmails.join(', ')}`);
      console.log(`Assunto: ${title}`);
      console.log(`========================================================================\n`);
      return res.json({
        success: true,
        simulated: true,
        sentCount: maintenances.length,
        message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o e-mail foi impresso no console de desenvolvimento.`
      });
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de manutenções:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });

  // API Route for sending idle components alert email
  app.post("/api/components/send-idle-alert-email", async (req, res) => {
    try {
      const { components, idleDays } = req.body;
      const alertEmails = resolveEmails(req.body);
      if (alertEmails.length === 0) {
        return res.status(400).json({ error: "E-mail de destino não especificado." });
      }
      if (!components || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ error: "Nenhum componente fornecido para o alerta." });
      }

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Agro Stock GPS";
      const isSmtpConfigured = !!(smtpHost && smtpUser && smtpPass);

      const decorated = (components as any[]).map((c: any) => ({ ...c, idleDays }));
      const { title, html } = buildIdleComponentsAlertEmail(decorated);

      if (isSmtpConfigured) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass }
        });
        for (const alertEmail of alertEmails) {
          await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: alertEmail,
            subject: title,
            html
          });
          console.log(`✉️  [Nodemailer] Alerta de componentes ociosos enviado com SUCESSO para ${alertEmail}`);
        }
        return res.json({
          success: true,
          message: `E-mail de alerta de componentes ociosos enviado com sucesso para ${alertEmails.join(', ')}!`,
          sentCount: components.length,
          simulated: false
        });
      }

      console.log(`\n========================================================================`);
      console.log(`✉️  [SIMULAÇÃO DE EMAIL] ALERTA DE COMPONENTES OCIOSOS`);
      console.log(`------------------------------------------------------------------------`);
      console.log(`Para: ${alertEmails.join(', ')}`);
      console.log(`Assunto: ${title}`);
      console.log(`========================================================================\n`);
      return res.json({
        success: true,
        simulated: true,
        sentCount: components.length,
        message: `O e-mail de alerta foi simulado com sucesso. Como as credenciais de SMTP não estão configuradas nas variáveis de ambiente do seu servidor, o e-mail foi impresso no console de desenvolvimento.`
      });
    } catch (error: any) {
      console.error("Erro ao enviar e-mail de alerta de componentes ociosos:", error);
      return res.status(500).json({ error: error.message || "Erro interno no servidor ao tentar enviar o e-mail de alertas." });
    }
  });

  // API Route for updating a user in Firebase Auth using Admin SDK
  app.post("/api/admin/users/update", async (req, res) => {
    try {
      const { uid, email, password, displayName } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID do usuário não informado." });
      }

      const updateParams: any = {};
      if (email) updateParams.email = email;
      if (password) updateParams.password = password;
      if (displayName) updateParams.displayName = displayName;

      await getAuth().updateUser(uid, updateParams);
      console.log(`User ${uid} updated in Firebase Auth successfully`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao atualizar usuário no Firebase Auth:", error);
      return res.status(500).json({ error: error.message || "Erro ao atualizar usuário no Firebase Auth." });
    }
  });

  // API Route for deleting a user from Firebase Auth using Admin SDK
  app.post("/api/admin/users/delete", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID do usuário não informado." });
      }

      await getAuth().deleteUser(uid);
      console.log(`User ${uid} deleted from Firebase Auth successfully`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao deletar usuário no Firebase Auth:", error);
      if (error.code === 'auth/user-not-found') {
        return res.json({ success: true, warning: "Usuário não existia no Firebase Auth." });
      }
      return res.status(500).json({ error: error.message || "Erro ao deletar usuário no Firebase Auth." });
    }
  });

  // API Route for support tickets: creates a card in the configured Trello list
  app.post("/api/support/tickets", async (req, res) => {
    try {
      const apiKey = process.env.TRELLO_API_KEY;
      const apiToken = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;

      if (!apiKey || !apiToken || !listId) {
        return res.status(503).json({ error: "O suporte por ticket não está configurado neste servidor. Contate o administrador do sistema." });
      }

      const requester = await resolveSupportRequester(req);
      if (requester.invalidToken) {
        return res.status(401).json({ error: "Sessão expirada. Recarregue a página e tente novamente." });
      }

      const titulo = typeof req.body?.titulo === "string" ? req.body.titulo.trim() : "";
      const descricao = typeof req.body?.descricao === "string" ? req.body.descricao.trim() : "";
      const prioridade = ["baixa", "media", "alta"].includes(req.body?.prioridade) ? req.body.prioridade : "media";
      const requestedName = typeof req.body?.autorNome === "string" && req.body.autorNome.trim() ? req.body.autorNome.trim() : "Desconhecido";
      const requestedEmail = typeof req.body?.autorEmail === "string" ? req.body.autorEmail.trim() : "";
      const autorNome = requester.verified && requester.name ? requester.name : requestedName;
      const autorEmail = requester.verified && requester.email ? requester.email : requestedEmail;
      const autorUid = requester.uid;

      if (!titulo) return res.status(400).json({ error: "O título do ticket é obrigatório." });
      if (titulo.length > 150) return res.status(400).json({ error: "O título deve ter no máximo 150 caracteres." });
      if (!descricao) return res.status(400).json({ error: "A descrição do problema é obrigatória." });
      if (descricao.length > 5000) return res.status(400).json({ error: "A descrição deve ter no máximo 5000 caracteres." });

      const rawAnexos: any[] = Array.isArray(req.body?.anexos) ? req.body.anexos : [];
      if (rawAnexos.length > SUPPORT_MAX_ATTACHMENTS) {
        return res.status(400).json({ error: `No máximo ${SUPPORT_MAX_ATTACHMENTS} anexos são permitidos por ticket.` });
      }

      const anexos: Array<{ filename: string; mimeType: string; buffer: Buffer }> = [];
      for (const raw of rawAnexos) {
        const base64 = typeof raw?.base64 === "string" ? raw.base64 : "";
        if (!base64) continue;
        const filename = typeof raw?.filename === "string" && raw.filename.trim() ? raw.filename.trim().slice(0, 120) : "anexo";
        const mimeType = typeof raw?.mimeType === "string" ? raw.mimeType : "";
        if (!SUPPORT_ALLOWED_MIME_TYPES.includes(mimeType)) {
          return res.status(400).json({ error: `Tipo de arquivo não permitido (${filename}). Use imagens PNG, JPG, WEBP, GIF ou PDF.` });
        }
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) {
          return res.status(400).json({ error: `Anexo inválido ou vazio: ${filename}.` });
        }
        if (buffer.length > SUPPORT_MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({ error: `O arquivo ${filename} excede o limite de 6MB.` });
        }
        anexos.push({ filename, mimeType, buffer });
      }

      let ticketId = "";
      try {
        ticketId = await allocateSequentialTicketId();
      } catch (error: any) {
        console.error("Erro ao alocar número sequencial do ticket:", error?.message || error);
        ticketId = generateFallbackTicketId();
      }
      const dataAbertura = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const prioridadeLabel = prioridade === "alta" ? "🔴 Alta" : prioridade === "media" ? "🟡 Média" : "🟢 Baixa";

      const cardDesc = [
        `**Prioridade:** ${prioridadeLabel}`,
        `**Aberto por:** ${autorNome}${autorEmail ? ` (${autorEmail})` : ""}`,
        `**Data:** ${dataAbertura}`,
        `**Origem:** App Agro Stock GPS`,
        "",
        "---",
        "",
        descricao
      ].join("\n");

      let priorityLabelId = "";
      let waitingSupportLabelId = "";
      try {
        priorityLabelId = (await getTrelloPriorityLabelMap(apiKey, apiToken, listId)).get(prioridade) || "";
      } catch (error: any) {
        console.error("Erro ao localizar etiqueta de prioridade no Trello:", error?.message || error);
      }
      try {
        waitingSupportLabelId = (await getTrelloWaitingLabelMap(apiKey, apiToken, listId)).get("support") || "";
      } catch (error: any) {
        console.error("Erro ao localizar etiqueta de espera no Trello:", error?.message || error);
      }

      const cardParams: Record<string, string> = {
        key: apiKey,
        token: apiToken,
        idList: listId,
        name: `[${ticketId}] ${titulo}`.slice(0, 256),
        desc: cardDesc
      };
      const initialLabelIds = [priorityLabelId, waitingSupportLabelId].filter(Boolean);
      if (initialLabelIds.length > 0) cardParams.idLabels = initialLabelIds.join(",");
      const cardQuery = new URLSearchParams(cardParams);

      let card: any;
      try {
        const cardRes = await trelloFetch(`/cards?${cardQuery.toString()}`, { method: "POST" });
        if (!cardRes.ok) {
          const detail = await cardRes.text().catch(() => "");
          console.error(`Erro ao criar card no Trello (${cardRes.status}):`, detail);
          return res.status(502).json({ error: "Não foi possível registrar seu ticket no momento. Tente novamente em instantes." });
        }
        card = await cardRes.json();
      } catch (error: any) {
        console.error("Erro de conexão com o Trello:", error?.message || error);
        return res.status(502).json({ error: "Falha de conexão com o serviço de tickets. Tente novamente em instantes." });
      }

      const attachmentsFailed: string[] = [];
      for (const anexo of anexos) {
        try {
          const form = new FormData();
          form.append("key", apiKey);
          form.append("token", apiToken);
          form.append("name", anexo.filename);
          form.append("setCover", "false");
          form.append("file", new Blob([new Uint8Array(anexo.buffer)], { type: anexo.mimeType }), anexo.filename);
          const attachRes = await trelloFetch(`/cards/${card.id}/attachments`, { method: "POST", body: form });
          if (!attachRes.ok) {
            attachmentsFailed.push(anexo.filename);
            console.error(`Falha ao anexar ${anexo.filename} ao card ${card.id} (${attachRes.status})`);
          }
        } catch (error: any) {
          attachmentsFailed.push(anexo.filename);
          console.error(`Falha ao anexar ${anexo.filename}:`, error?.message || error);
        }
      }

      console.log(`Ticket de suporte criado: ${ticketId} -> card Trello ${card.id} (${anexos.length - attachmentsFailed.length}/${anexos.length} anexos)`);

      // Persist the ticket so the author can track it inside the app. The Trello
      // card remains the source of truth for the status (synced on demand).
      if (HAS_FIRESTORE_CREDS) {
        try {
          const db = getFirestore();
          await db.collection("supportTickets").doc(ticketId).set({
            id: ticketId,
            titulo,
            descricao,
            prioridade,
            autorUid,
            autorNome,
            autorEmail,
            status: "Novo",
            trelloCardId: card.id,
            trelloShortUrl: card.shortUrl || card.url || "",
            anexosEnviados: anexos.length - attachmentsFailed.length,
            anexosFalhos: attachmentsFailed,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        } catch (error: any) {
          console.error(`Erro ao persistir ticket ${ticketId} no Firestore:`, error?.message || error);
        }
      }

      return res.json({
        success: true,
        ticketId,
        priorityLabelApplied: Boolean(priorityLabelId),
        attachmentsFailed
      });
    } catch (error: any) {
      console.error("Erro ao processar ticket de suporte:", error);
      return res.status(500).json({ error: error.message || "Erro interno ao criar o ticket de suporte." });
    }
  });

  // Lists the authenticated user's support tickets with statuses synced from Trello.
  app.get("/api/support/tickets", async (req, res) => {
    try {
      const requester = await resolveSupportRequester(req);
      if (requester.invalidToken) {
        return res.status(401).json({ error: "Sessão expirada. Recarregue a página e tente novamente." });
      }
      if (!requester.uid) {
        return res.status(401).json({ error: "Autenticação necessária para consultar os chamados." });
      }

      const apiKey = process.env.TRELLO_API_KEY;
      const apiToken = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;

      if (!HAS_FIRESTORE_CREDS) {
        if (!apiKey || !apiToken || !listId) {
          return res.status(503).json({ error: "A consulta de chamados não está configurada neste servidor." });
        }
        const tickets = await loadTrelloTicketsForRequester(apiKey, apiToken, listId, requester);
        tickets.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        return res.json({ success: true, tickets });
      }

      const db = getFirestore();
      const snap = await db.collection("supportTickets")
        .where("autorUid", "==", requester.uid)
        .limit(200)
        .get();

      const tickets: any[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          titulo: data.titulo || "",
          descricao: data.descricao || "",
          prioridade: data.prioridade || "media",
          status: data.status || "Novo",
          autorNome: data.autorNome || "",
          anexosEnviados: typeof data.anexosEnviados === "number" ? data.anexosEnviados : 0,
          trelloCardId: data.trelloCardId || "",
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null
        };
      });

      // On-demand status sync: one request lists every open card of the board.
      if (apiKey && apiToken && listId && tickets.some((t) => t.trelloCardId)) {
        try {
          const statusMap = await getTrelloListStatusMap(apiKey, apiToken, listId);
          if (statusMap.size > 0) {
            const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
            if (boardId) {
              const cardsRes = await trelloFetch(`/boards/${boardId}/cards?key=${apiKey}&token=${apiToken}&fields=id,idList`);
              if (cardsRes.ok) {
                const cards = await cardsRes.json();
                const cardToList = new Map<string, string>();
                if (Array.isArray(cards)) {
                  for (const c of cards) {
                    if (typeof c?.id === "string" && typeof c?.idList === "string") {
                      cardToList.set(c.id, c.idList);
                    }
                  }
                }

                const batch = db.batch();
                let pendingChanges = 0;
                for (const ticket of tickets) {
                  const currentList = cardToList.get(ticket.trelloCardId);
                  const newStatus = currentList ? statusMap.get(currentList) || "" : "";
                  if (newStatus && newStatus !== ticket.status) {
                    ticket.status = newStatus;
                    batch.update(db.collection("supportTickets").doc(ticket.id), {
                      status: newStatus,
                      updatedAt: FieldValue.serverTimestamp()
                    });
                    pendingChanges++;
                  }
                }
                if (pendingChanges > 0) {
                  await batch.commit();
                  console.log(`Status de ${pendingChanges} ticket(s) sincronizado(s) com o Trello.`);
                }
              } else {
                console.error(`Erro ao listar cards do quadro Trello (${cardsRes.status}).`);
              }
            }
          }
        } catch (error: any) {
          // Status sync is best-effort: stored statuses are returned as fallback.
          console.error("Erro na sincronização de status com o Trello:", error?.message || error);
        }
      }

      if (apiKey && apiToken && listId && tickets.some((t) => t.trelloCardId)) {
        try {
          const boardId = await resolveTrelloBoardId(apiKey, apiToken, listId);
          if (boardId) {
            const commentsByCard = await loadTrelloCommentMap(apiKey, apiToken, boardId);
            for (const ticket of tickets) {
              ticket.comments = commentsByCard.get(ticket.trelloCardId) || [];
            }
          }
        } catch (error: any) {
          // Keep the ticket list available even if Trello comments fail temporarily.
          console.error("Erro ao sincronizar comentários com o Trello:", error?.message || error);
        }
      }

      tickets.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      return res.json({ success: true, tickets });
    } catch (error: any) {
      console.error("Erro ao listar tickets de suporte:", error);
      return res.status(500).json({ error: error.message || "Erro interno ao consultar os chamados." });
    }
  });

  // Adds a customer reply to the same Trello card after confirming ticket ownership.
  app.post("/api/support/tickets/:ticketId/comments", async (req, res) => {
    try {
      const requester = await resolveSupportRequester(req);
      if (requester.invalidToken) {
        return res.status(401).json({ error: "Sessão expirada. Recarregue a página e tente novamente." });
      }
      if (!requester.uid) {
        return res.status(401).json({ error: "Autenticação necessária para responder ao chamado." });
      }

      const apiKey = process.env.TRELLO_API_KEY;
      const apiToken = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;
      if (!apiKey || !apiToken || !listId) {
        return res.status(503).json({ error: "A conversa do suporte não está configurada neste servidor." });
      }

      const ticketId = typeof req.params.ticketId === "string" ? req.params.ticketId.trim() : "";
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const requestedAuthorName = typeof req.body?.authorName === "string" ? req.body.authorName.trim() : "";
      const rawAnexos: any[] = Array.isArray(req.body?.anexos) ? req.body.anexos : [];
      if (!ticketId) return res.status(400).json({ error: "Chamado não informado." });
      if (!message && rawAnexos.length === 0) return res.status(400).json({ error: "Digite uma mensagem ou anexe uma imagem antes de enviar." });
      if (message.length > 2000) return res.status(400).json({ error: "A mensagem deve ter no máximo 2000 caracteres." });
      if (rawAnexos.length > 2) return res.status(400).json({ error: "No máximo 2 imagens são permitidas por resposta." });

      const anexos: Array<{ filename: string; mimeType: string; buffer: Buffer }> = [];
      for (const raw of rawAnexos) {
        const base64 = typeof raw?.base64 === "string" ? raw.base64 : "";
        const mimeType = typeof raw?.mimeType === "string" ? raw.mimeType : "";
        const filename = typeof raw?.filename === "string" && raw.filename.trim()
          ? raw.filename.replace(/[\[\]\r\n]+/g, " ").trim().slice(0, 120)
          : "captura-de-tela";
        if (!base64) continue;
        if (!mimeType.startsWith("image/") || !SUPPORT_ALLOWED_MIME_TYPES.includes(mimeType)) {
          return res.status(400).json({ error: `Formato não permitido (${filename}). Envie uma imagem PNG, JPG, WEBP ou GIF.` });
        }
        const buffer = Buffer.from(base64, "base64");
        if (buffer.length === 0) return res.status(400).json({ error: `Imagem inválida ou vazia: ${filename}.` });
        if (buffer.length > SUPPORT_MAX_ATTACHMENT_BYTES) {
          return res.status(400).json({ error: `A imagem ${filename} excede o limite de 6 MB.` });
        }
        anexos.push({ filename, mimeType, buffer });
      }

      let trelloCardId = "";
      if (HAS_FIRESTORE_CREDS) {
        const ticketDoc = await getFirestore().collection("supportTickets").doc(ticketId).get();
        const ticket = ticketDoc.exists ? ticketDoc.data() as any : null;
        if (!ticket || ticket.autorUid !== requester.uid) {
          return res.status(404).json({ error: "Chamado não encontrado." });
        }
        trelloCardId = typeof ticket.trelloCardId === "string" ? ticket.trelloCardId : "";
      } else {
        const tickets = await loadTrelloTicketsForRequester(apiKey, apiToken, listId, requester);
        const ticket = tickets.find((item) => item.id === ticketId);
        trelloCardId = typeof ticket?.trelloCardId === "string" ? ticket.trelloCardId : "";
      }
      if (!trelloCardId) {
        return res.status(404).json({ error: "Chamado não encontrado ou sem vínculo com o atendimento." });
      }

      const authorName = (requester.name || requestedAuthorName || "Cliente").replace(/[\r\n]+/g, " ").trim().slice(0, 160) || "Cliente";
      const uploadedAttachments: Array<{ id: string; filename: string; url: string }> = [];
      const attachmentsFailed: string[] = [];
      for (const anexo of anexos) {
        try {
          const form = new FormData();
          form.append("key", apiKey);
          form.append("token", apiToken);
          form.append("name", anexo.filename);
          form.append("setCover", "false");
          form.append("file", new Blob([new Uint8Array(anexo.buffer)], { type: anexo.mimeType }), anexo.filename);
          const attachRes = await trelloFetch(`/cards/${encodeURIComponent(trelloCardId)}/attachments`, { method: "POST", body: form });
          if (!attachRes.ok) {
            attachmentsFailed.push(anexo.filename);
            continue;
          }
          const uploaded = await attachRes.json();
          if (typeof uploaded?.url === "string" && typeof uploaded?.id === "string") {
            uploadedAttachments.push({ id: uploaded.id, filename: anexo.filename, url: uploaded.url });
          } else {
            attachmentsFailed.push(anexo.filename);
          }
        } catch (error: any) {
          attachmentsFailed.push(anexo.filename);
          console.error(`Erro ao anexar ${anexo.filename} à conversa do ticket ${ticketId}:`, error?.message || error);
        }
      }

      if (!message && anexos.length > 0 && uploadedAttachments.length === 0) {
        return res.status(502).json({ error: "Não foi possível enviar a imagem agora. Tente novamente em instantes." });
      }

      const attachmentLines = uploadedAttachments.map((attachment) => `**Anexo:** [${attachment.filename}](${attachment.url})`);
      const trelloText = [
        `💬 **${SUPPORT_APP_COMMENT_HEADER}**`,
        `**Nome:** ${authorName}`,
        ...attachmentLines,
        "",
        message || "Captura de tela enviada."
      ].join("\n");
      const commentQuery = new URLSearchParams({ key: apiKey, token: apiToken, text: trelloText });
      const commentRes = await trelloFetch(`/cards/${encodeURIComponent(trelloCardId)}/actions/comments?${commentQuery.toString()}`, {
        method: "POST"
      });
      if (!commentRes.ok) {
        console.error(`Erro ao adicionar comentário ao chamado (${commentRes.status}).`);
        return res.status(502).json({ error: "Não foi possível enviar sua mensagem agora. Tente novamente em instantes." });
      }
      const action = await commentRes.json();

      try {
        await setTrelloWaitingState(apiKey, apiToken, listId, trelloCardId, "support");
      } catch (error: any) {
        // The reply is already safely posted; label synchronization is best-effort.
        console.error(`Erro ao marcar o ticket ${ticketId} como aguardando suporte:`, error?.message || error);
      }

      if (HAS_FIRESTORE_CREDS) {
        try {
          await getFirestore().collection("supportTickets").doc(ticketId).update({
            updatedAt: FieldValue.serverTimestamp()
          });
        } catch (error: any) {
          console.error(`Erro ao atualizar data do ticket ${ticketId}:`, error?.message || error);
        }
      }

      return res.json({
        success: true,
        comment: {
          id: typeof action?.id === "string" ? action.id : `app-${Date.now()}`,
          text: message || "Captura de tela enviada.",
          createdAt: typeof action?.date === "string" ? action.date : new Date().toISOString(),
          authorName,
          source: "app",
          attachments: uploadedAttachments
        },
        attachmentsFailed
      });
    } catch (error: any) {
      console.error("Erro ao responder chamado de suporte:", error);
      return res.status(500).json({ error: error.message || "Erro interno ao responder ao chamado." });
    }
  });

  // Proxies a Trello attachment after validating that the authenticated user owns the ticket.
  app.get("/api/support/tickets/:ticketId/attachments/:attachmentId", async (req, res) => {
    try {
      const requester = await resolveSupportRequester(req);
      if (requester.invalidToken) return res.status(401).json({ error: "Sessão expirada." });
      if (!requester.uid) return res.status(401).json({ error: "Autenticação necessária." });

      const apiKey = process.env.TRELLO_API_KEY;
      const apiToken = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;
      if (!apiKey || !apiToken || !listId) return res.status(503).json({ error: "Anexos do suporte não configurados." });

      const ticketId = typeof req.params.ticketId === "string" ? req.params.ticketId.trim() : "";
      const attachmentId = typeof req.params.attachmentId === "string" ? req.params.attachmentId.trim() : "";
      if (!ticketId || !/^[a-f0-9]{24}$/i.test(attachmentId)) return res.status(400).json({ error: "Anexo inválido." });

      let trelloCardId = "";
      if (HAS_FIRESTORE_CREDS) {
        const ticketDoc = await getFirestore().collection("supportTickets").doc(ticketId).get();
        const ticket = ticketDoc.exists ? ticketDoc.data() as any : null;
        if (!ticket || ticket.autorUid !== requester.uid) return res.status(404).json({ error: "Chamado não encontrado." });
        trelloCardId = typeof ticket.trelloCardId === "string" ? ticket.trelloCardId : "";
      } else {
        const tickets = await loadTrelloTicketsForRequester(apiKey, apiToken, listId, requester);
        const ticket = tickets.find((item) => item.id === ticketId);
        trelloCardId = typeof ticket?.trelloCardId === "string" ? ticket.trelloCardId : "";
      }
      if (!trelloCardId) return res.status(404).json({ error: "Chamado não encontrado." });

      const authQuery = new URLSearchParams({ key: apiKey, token: apiToken });
      const metadataRes = await trelloFetch(
        `/cards/${encodeURIComponent(trelloCardId)}/attachments/${encodeURIComponent(attachmentId)}?${authQuery.toString()}`
      );
      if (!metadataRes.ok) return res.status(404).json({ error: "Anexo não encontrado." });
      const metadataPayload = await metadataRes.json();
      const metadata = Array.isArray(metadataPayload) ? metadataPayload[0] : metadataPayload;
      if (typeof metadata?.url !== "string") return res.status(404).json({ error: "Arquivo indisponível." });

      // Trello requires OAuth credentials in the Authorization header for private
      // attachment downloads; query-string credentials only authenticate metadata calls.
      const fileRes = await fetch(metadata.url, {
        redirect: "follow",
        headers: {
          Authorization: `OAuth oauth_consumer_key="${apiKey}", oauth_token="${apiToken}"`
        }
      });
      if (!fileRes.ok || !fileRes.body) return res.status(502).json({ error: "Não foi possível carregar a imagem." });

      res.setHeader("Content-Type", fileRes.headers.get("content-type") || metadata.mimeType || "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=300");
      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
      return res.send(fileBuffer);
    } catch (error: any) {
      console.error("Erro ao carregar anexo do suporte:", error?.message || error);
      return res.status(500).json({ error: "Erro interno ao carregar o anexo." });
    }
  });

  // Vercel Cron: hourly automation that sends due alert emails (idempotent via lastSent markers)
  app.get("/api/cron/alerts", async (req, res) => {
    try {
      const secret = process.env.CRON_SECRET;
      if (secret) {
        const headerAuth = req.headers.authorization || '';
        const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
        const provided = headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : querySecret;
        if (provided !== secret) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        return res.status(503).json({ error: "FIREBASE_SERVICE_ACCOUNT_KEY não configurada — o cron não pode acessar o Firestore." });
      }

      const db = getFirestore();
      const now = new Date();
      const result: any = {
        licenses: { checked: false },
        campo: { checked: false },
        loans: { checked: false },
        maintenance: { checked: false },
        idle: { checked: false },
        emailsSent: 0,
        simulated: 0
      };

      const [licSettingsDoc, campoSettingsDoc, loanSettingsDoc, maintSettingsDoc, idleSettingsDoc] = await Promise.all([
        db.collection("settings").doc("licenses").get(),
        db.collection("settings").doc("campo_alerts").get(),
        db.collection("settings").doc("loan_alerts").get(),
        db.collection("settings").doc("maintenance_alerts").get(),
        db.collection("settings").doc("idle_alerts").get()
      ]);
      const licSettings = licSettingsDoc.exists ? licSettingsDoc.data()! : null;
      const campoSettings = campoSettingsDoc.exists ? campoSettingsDoc.data()! : null;
      const loanSettings = loanSettingsDoc.exists ? loanSettingsDoc.data()! : null;
      const maintSettings = maintSettingsDoc.exists ? maintSettingsDoc.data()! : null;
      const idleSettings = idleSettingsDoc.exists ? idleSettingsDoc.data()! : null;

      // ---- Licenses (daily, per threshold, gated by enabled + thresholds) ----
      const licEmails = resolveSettingsEmails(licSettings);
      if (licSettings?.enabled && licEmails.length > 0) {
        result.licenses.checked = true;
        const licSnap = await db.collection("licenses").get();
        const allLicenses = licSnap.docs.map(d => d.data());
        const thresholds = licSettings.thresholds || { '15': true, '30': true, '60': true };
        const lastSent: any = {
          '15': licSettings.lastSent15 || '',
          '30': licSettings.lastSent30 || '',
          '60': licSettings.lastSent60 || ''
        };
        const today = todayStr(now);
        const licenseHistory: any[] = Array.isArray(licSettings.history) ? [...licSettings.history] : [];

        for (const [key, days] of [['15', 15], ['30', 30], ['60', 60]] as const) {
          if (!thresholds[key]) continue;
          if (lastSent[key] === today) continue;
          const expiring = getExpiringLicenses(allLicenses, days);
          if (expiring.length === 0) continue;

          const { title, html } = buildLicenseAlertEmail(expiring, days);
          let sentAny = false;
          for (const email of licEmails) {
            const outcome = await sendAlertEmail(email, title, html, `alerta de vencimento de licenças (${days} dias)`);
            if (outcome.sent) sentAny = true;
            else result.simulated += 1;
          }
          if (sentAny) {
            licenseHistory.push({
              type: key,
              date: now.toISOString(),
              recipient: licEmails.join(', '),
              status: 'Enviado'
            });
            if (licenseHistory.length > 50) licenseHistory.splice(0, licenseHistory.length - 50);

            await db.collection("settings").doc("licenses").update({
              [`lastSent${key}`]: today,
              history: licenseHistory,
              updatedAt: now.toISOString(),
              updatedBy: "Cron"
            });
            result.emailsSent += 1;
            result.licenses.sent = (result.licenses.sent || 0) + expiring.length;
          }
        }

        // Expired licenses (daily, gated by notifyExpired)
        if (licSettings.notifyExpired && licSettings.lastSentExpired !== today) {
          const expired = allLicenses.filter((l: any) => l.expirationDate && l.expirationDate < today);
          if (expired.length > 0) {
            const { title, html } = buildLicenseAlertEmail(expired, null, 'expired');
            let sentAny = false;
            for (const email of licEmails) {
              const outcome = await sendAlertEmail(email, title, html, "alerta de licenças vencidas");
              if (outcome.sent) sentAny = true;
              else result.simulated += 1;
            }
            if (sentAny) {
              licenseHistory.push({
                type: 'expired',
                date: now.toISOString(),
                recipient: licEmails.join(', '),
                status: 'Enviado'
              });
              if (licenseHistory.length > 50) licenseHistory.splice(0, licenseHistory.length - 50);

              await db.collection("settings").doc("licenses").update({
                lastSentExpired: today,
                history: licenseHistory,
                updatedAt: now.toISOString(),
                updatedBy: "Cron"
              });
              result.emailsSent += 1;
              result.licenses.expiredSent = expired.length;
            }
          }
        }
      }

      // ---- Campo (weekly, on configured weekday/time) ----
      if (isCampoDue(campoSettings, now)) {
        result.campo.checked = true;
        const [machSnap, fieldSnap] = await Promise.all([
          db.collection("machines").get(),
          db.collection("field_data_collections").get()
        ]);
        const machines = machSnap.docs.map(d => d.data());
        const fieldData = fieldSnap.docs.map(d => d.data());
        const weekId = getIsoWeekId(now);

        const fleeteGroups: Record<string, any[]> = {};
        machines.forEach((m: any) => {
          const fleet = m.fleet && String(m.fleet).trim() ? String(m.fleet).trim() : "Sem Frente Atribuída";
          if (!fleeteGroups[fleet]) fleeteGroups[fleet] = [];
          fleeteGroups[fleet].push(m);
        });

        const status = (machineId: string) => {
          const rec = fieldData.find((c: any) => c.machineId === machineId && c.weekId === weekId);
          return rec?.status === "Concluído" ? "Concluído" : "Pendente";
        };

        const frentesPendente: any[] = [];
        const frentesEmAndamento: any[] = [];
        let pendingTotal = 0;

        Object.keys(fleeteGroups).forEach(frente => {
          const group = fleeteGroups[frente];
          const completed = group.filter((m: any) => status(m.id) === "Concluído").length;
          const pending = group.length - completed;
          pendingTotal += pending;
          if (completed === 0) {
            frentesPendente.push({ frente, machines: group.map((m: any) => m.prefix) });
          } else if (pending > 0) {
            frentesEmAndamento.push({
              frente,
              totalCount: group.length,
              pendingCount: pending,
              machines: group.filter((m: any) => status(m.id) === "Pendente").map((m: any) => m.prefix)
            });
          }
        });

        if (pendingTotal > 0) {
          const weekLabel = `Semana ${weekId.split('-W')[1]}`;
          const { title, html } = buildCampoAlertEmail({
            weekId,
            weekLabel,
            pendingMachinesCount: pendingTotal,
            frentesPendente,
            frentesEmAndamento
          });
          const campoEmails = resolveSettingsEmails(campoSettings);
          let sentAny = false;
          for (const email of campoEmails) {
            const outcome = await sendAlertEmail(email, title, html, `alerta de pendências de campo (${weekId})`);
            if (outcome.sent) sentAny = true;
            else result.simulated += 1;
          }
          if (sentAny) {
            const campoHistory = Array.isArray(campoSettings.history) ? [...campoSettings.history] : [];
            campoHistory.push({
              type: 'campo',
              date: now.toISOString(),
              recipient: campoEmails.join(', '),
              status: 'Enviado'
            });
            if (campoHistory.length > 50) campoHistory.splice(0, campoHistory.length - 50);

            await db.collection("settings").doc("campo_alerts").update({
              lastSentWeek: weekId,
              history: campoHistory,
              updatedAt: now.toISOString(),
              updatedBy: "Cron"
            });
            result.emailsSent += 1;
            result.campo.pending = pendingTotal;
          }
        }
      }

      // ---- Empréstimos (daily, while overdue exist) ----
      const loanEmails = resolveSettingsEmails(loanSettings);
      if (loanSettings?.enabled && loanEmails.length > 0) {
        result.loans.checked = true;
        const loanSnap = await db.collection("loans").get();
        const allLoans = loanSnap.docs.map(d => d.data());
        const overdue = allLoans.filter((l: any) =>
          l.status === "Ativo" && l.estimatedReturnDate && l.estimatedReturnDate < todayStr(now)
        );

        if (isLoansDue(true, loanSettings.lastSentDate, overdue.length, now)) {
          const { title, html } = buildLoansAlertEmail(overdue);
          let sentAny = false;
          for (const email of loanEmails) {
            const outcome = await sendAlertEmail(email, title, html, "alerta de empréstimos vencidos");
            if (outcome.sent) sentAny = true;
            else result.simulated += 1;
          }
          if (sentAny) {
            const loanHistory = Array.isArray(loanSettings.history) ? [...loanSettings.history] : [];
            loanHistory.push({
              type: 'loans',
              date: now.toISOString(),
              recipient: loanEmails.join(', '),
              status: 'Enviado'
            });
            if (loanHistory.length > 50) loanHistory.splice(0, loanHistory.length - 50);

            await db.collection("settings").doc("loan_alerts").update({
              lastSentDate: todayStr(now),
              history: loanHistory,
              updatedAt: now.toISOString(),
              updatedBy: "Cron"
            });
            result.emailsSent += 1;
            result.loans.overdue = overdue.length;
          }
        }
      }

      // ---- Manutenções (overdue daily + completed once per maintenance) ----
      const maintEmails = resolveSettingsEmails(maintSettings);
      if (maintSettings?.enabled && maintEmails.length > 0) {
        result.maintenance.checked = true;
        const maintSnap = await db.collection("maintenances").get();
        const allMaintenances = maintSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const today = todayStr(now);
        const notifiedIds = Array.isArray(maintSettings.notifiedIds) ? [...maintSettings.notifiedIds] : [];
        const maintHistory: any[] = Array.isArray(maintSettings.history) ? [...maintSettings.history] : [];
        let updated = false;

        // Overdue: daily marker
        if (maintSettings.lastSentDate !== today) {
          const overdueDays = Number(maintSettings.overdueDays) || 7;
          const overdue = getOverdueMaintenances(allMaintenances, overdueDays, now);
          if (overdue.length > 0) {
            const { title, html } = buildMaintenanceAlertEmail(overdue.map((m: any) => ({ ...m, overdueDays })), 'overdue');
            let sentAny = false;
            for (const email of maintEmails) {
              const outcome = await sendAlertEmail(email, title, html, "alerta de manutenções atrasadas");
              if (outcome.sent) sentAny = true;
              else result.simulated += 1;
            }
            if (sentAny) {
              maintHistory.push({
                type: 'maintenance_overdue',
                date: now.toISOString(),
                recipient: maintEmails.join(', '),
                status: 'Enviado'
              });
              updated = true;
              result.emailsSent += 1;
              result.maintenance.overdue = overdue.length;
            }
          }
        }

        // Completed: one-time per maintenance
        if (maintSettings.notifyCompleted) {
          const completed = getCompletedMaintenances(allMaintenances, notifiedIds, now);
          if (completed.length > 0) {
            const { title, html } = buildMaintenanceAlertEmail(completed, 'completed');
            let sentAny = false;
            for (const email of maintEmails) {
              const outcome = await sendAlertEmail(email, title, html, "alerta de manutenção concluída");
              if (outcome.sent) sentAny = true;
              else result.simulated += 1;
            }
            if (sentAny) {
              completed.forEach((m: any) => {
                if (!notifiedIds.includes(m.id)) notifiedIds.push(m.id);
              });
              maintHistory.push({
                type: 'maintenance_completed',
                date: now.toISOString(),
                recipient: maintEmails.join(', '),
                status: 'Enviado'
              });
              updated = true;
              result.emailsSent += 1;
              result.maintenance.completed = completed.length;
            }
          }
        }

        if (updated) {
          if (maintHistory.length > 50) maintHistory.splice(0, maintHistory.length - 50);
          if (notifiedIds.length > 100) notifiedIds.splice(0, notifiedIds.length - 100);
          await db.collection("settings").doc("maintenance_alerts").update({
            lastSentDate: today,
            notifiedIds,
            history: maintHistory,
            updatedAt: now.toISOString(),
            updatedBy: "Cron"
          });
        }
      }

      // ---- Componentes ociosos (daily) ----
      const idleEmails = resolveSettingsEmails(idleSettings);
      if (idleSettings?.enabled && idleEmails.length > 0) {
        result.idle.checked = true;
        const today = todayStr(now);
        if (idleSettings.lastSentDate !== today) {
          const [compSnap, moveSnap] = await Promise.all([
            db.collection("components").get(),
            db.collection("movements").get()
          ]);
          const allComponents = compSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const allMovements = moveSnap.docs.map(d => d.data());
          const idleDays = Number(idleSettings.idleDays) || 30;
          const idleComponents = getIdleComponents(allComponents, allMovements, idleDays, now);

          if (idleComponents.length > 0) {
            const { title, html } = buildIdleComponentsAlertEmail(idleComponents.map((c: any) => ({ ...c, idleDays })));
            let sentAny = false;
            for (const email of idleEmails) {
              const outcome = await sendAlertEmail(email, title, html, "alerta de componentes ociosos");
              if (outcome.sent) sentAny = true;
              else result.simulated += 1;
            }
            if (sentAny) {
              const idleHistory = Array.isArray(idleSettings.history) ? [...idleSettings.history] : [];
              idleHistory.push({
                type: 'idle',
                date: now.toISOString(),
                recipient: idleEmails.join(', '),
                status: 'Enviado'
              });
              if (idleHistory.length > 50) idleHistory.splice(0, idleHistory.length - 50);

              await db.collection("settings").doc("idle_alerts").update({
                lastSentDate: today,
                history: idleHistory,
                updatedAt: now.toISOString(),
                updatedBy: "Cron"
              });
              result.emailsSent += 1;
              result.idle.count = idleComponents.length;
            }
          }
        }
      }

      return res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error("[Cron] Erro ao executar automação de alertas:", error);
      return res.status(500).json({ error: error.message || "Erro interno no cron de alertas." });
    }
  });

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = parseInt(process.env.PORT || '3003', 10);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Prevent service worker from being cached by the browser
    app.get('/sw.js', (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      next();
    });

    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        }
      }
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Run directly (local dev) or export for Vercel
if (process.env.VERCEL !== '1') {
  startServer();
}

export default createApp;
