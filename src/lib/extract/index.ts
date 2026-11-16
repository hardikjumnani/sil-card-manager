import { CONTACTS_JSON_SCHEMA, EXTRACTION_PROMPT } from "./prompt";
import { normalizeContact } from "./normalize";
import type { ContactData } from "@/lib/fields";

export type ExtractResult = { contacts: ContactData[]; provider: string; raw: unknown };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_API_REVISION = process.env.GEMINI_API_REVISION || "2026-05-20";
const DEFAULT_GEMINI_MODELS = "gemini-3.5-flash-lite,gemini-3.8-flash";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

/** Short waits are retried in place; longer ones move on to the next model. */
const MAX_INLINE_WAIT_MS = 8000;
/** Whole extraction must finish well inside the serverless limit (route maxDuration = 60s). */
const TOTAL_BUDGET_MS = Number(process.env.EXTRACT_BUDGET_MS) || 50_000;
/** One model call may take at most this long before we move on to the next model. */
const CALL_TIMEOUT_MS = Number(process.env.EXTRACT_CALL_TIMEOUT_MS) || 22_000;
/** An overloaded / timed-out model is skipped for this long. */
const BUSY_COOLDOWN_MS = 2 * 60_000;

class QuotaError extends Error {
  constructor(message: string, public retryAfterMs: number, public daily: boolean) {
    super(message);
  }
}
/** Transient problems (malformed output) worth one more try on the same model. */
class TransientError extends Error {}
/** The model is overloaded (5xx) or too slow: move on to the next model right away. */
class BusyError extends Error {}
/** The request shape was rejected (used to fall back from Interactions to the legacy endpoint). */
class BadRequestError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Models that ran out of free quota are skipped until their cooldown ends (per server instance). */
const cooldownUntil = new Map<string, number>();
const coolingDown = (model: string) => (cooldownUntil.get(model) ?? 0) > Date.now();

function msUntilPacificMidnight() {
  const now = new Date();
  const pt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const next = new Date(pt);
  next.setHours(24, 0, 30, 0);
  return next.getTime() - pt.getTime();
}

function quotaFromGemini(status: number, body: string): QuotaError | null {
  if (status !== 429) return null;
  let retryMs = 30_000;
  const delay = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (delay) retryMs = Math.ceil(parseFloat(delay[1]) * 1000);
  const daily = /per\s*day|PerDay|RequestsPerDay/i.test(body);
  return new QuotaError(`Gemini quota: ${body.slice(0, 200)}`, daily ? msUntilPacificMidnight() : retryMs, daily);
}

function checkResponse(provider: string, status: number, body: string) {
  if (status >= 200 && status < 300) return;
  if (status >= 500) throw new BusyError(`${provider} ${status}: ${body.slice(0, 300)}`);
  if (status === 400 || status === 404) throw new BadRequestError(`${provider} ${status}: ${body.slice(0, 300)}`);
  throw new Error(`${provider} ${status}: ${body.slice(0, 300)}`);
}

/** Current Gemini API: POST /v1beta/interactions */
async function geminiInteractions(model: string, b64: string, mime: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY!,
      "Api-Revision": GEMINI_API_REVISION,
    },
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: EXTRACTION_PROMPT },
        { type: "image", data: b64, mime_type: mime },
      ],
      response_format: { type: "text", mime_type: "application/json", schema: CONTACTS_JSON_SCHEMA },
      generation_config: { thinking_level: "low" },
    }),
  });
  const body = await res.text();
  const quota = quotaFromGemini(res.status, body);
  if (quota) throw quota;
  checkResponse("Gemini", res.status, body);
  const text = interactionText(JSON.parse(body));
  if (!text) throw new TransientError("Gemini returned no text output");
  return parseJson(text);
}

/** Pulls the model's text out of an Interactions response. */
function interactionText(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string") return json.output_text;
  const texts: string[] = [];
  const visit = (steps: unknown) => {
    if (!Array.isArray(steps)) return;
    for (const step of steps as Record<string, unknown>[]) {
      if (step?.type && step.type !== "model_output" && step.type !== "text") continue;
      if (step?.type === "text" && typeof step.text === "string") texts.push(step.text);
      if (Array.isArray(step?.content))
        for (const c of step.content as Record<string, unknown>[]) if (c?.type === "text" && typeof c.text === "string") texts.push(c.text);
    }
  };
  visit(json.steps);
  visit(json.outputs);
  return texts.join("");
}

/** Legacy Gemini API (still supported): POST /v1beta/models/{model}:generateContent */
async function geminiGenerateContent(model: string, b64: string, mime: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: CONTACTS_JSON_SCHEMA },
    }),
  });
  const body = await res.text();
  const quota = quotaFromGemini(res.status, body);
  if (quota) throw quota;
  checkResponse("Gemini (generateContent)", res.status, body);
  const json = JSON.parse(body);
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text) throw new TransientError(`Gemini returned no content (${json?.candidates?.[0]?.finishReason ?? "unknown"})`);
  return parseJson(text);
}

/** Interactions first; if that request shape is rejected, the legacy endpoint is tried once. */
let interactionsRejected = false;
async function gemini(model: string, b64: string, mime: string, signal: AbortSignal) {
  if (!interactionsRejected) {
    try {
      return await geminiInteractions(model, b64, mime, signal);
    } catch (e) {
      if (!(e instanceof BadRequestError)) throw e;
      console.warn("Gemini Interactions request rejected, using generateContent:", e.message);
      if (/not found|unknown|invalid json payload|cannot find field|api-revision/i.test(e.message)) interactionsRejected = true;
    }
  }
  return geminiGenerateContent(model, b64, mime, signal);
}

async function groq(model: string, b64: string, mime: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  const body = await res.text();
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    throw new QuotaError(`Groq quota: ${body.slice(0, 200)}`, Number.isFinite(after) && after > 0 ? after * 1000 : 60_000, /day/i.test(body));
  }
  checkResponse("Groq", res.status, body);
  return parseJson(JSON.parse(body)?.choices?.[0]?.message?.content ?? "");
}

function parseJson(text: string) {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // reasoning models may prepend their thoughts
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
    throw new TransientError("Model did not return valid JSON");
  }
}

function toContacts(raw: unknown): ContactData[] {
  const list = Array.isArray(raw) ? raw : (raw as { contacts?: unknown })?.contacts;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map(normalizeContact)
    .filter((c) => Object.values(c).some((v) => v && v.trim()));
}

type Provider = { name: string; run: (b64: string, mime: string, signal: AbortSignal) => Promise<unknown> };

function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.GEMINI_API_KEY) {
    const models = (process.env.GEMINI_MODELS || DEFAULT_GEMINI_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
    for (const m of models) list.push({ name: m, run: (b, t, sig) => gemini(m, b, t, sig) });
  }
  if (process.env.GROQ_API_KEY) {
    const m = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    list.push({ name: `groq:${m}`, run: (b, t, sig) => groq(m, b, t, sig) });
  }
  return list;
}

/**
 * Extract contacts from one card image.
 * Tries each configured model in order (best first). A model that hits its free quota is skipped
 * until the quota resets, so a big batch keeps flowing on the next model instead of stalling.
 */
export async function extractCard(image: Buffer, mime: string): Promise<ExtractResult> {
  const chain = providers();
  if (chain.length === 0) throw new Error("No vision model configured. Set GEMINI_API_KEY (and optionally GROQ_API_KEY).");
  const b64 = image.toString("base64");
  const errors: string[] = [];
  let soonestRetry = Infinity;
  let busy = false;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  // If every model is cooling down, still try the one whose cooldown ends first rather than failing instantly.
  const available = chain.filter((p) => !coolingDown(p.name));
  const queue = available.length ? available : [...chain].sort((a, b) => (cooldownUntil.get(a.name) ?? 0) - (cooldownUntil.get(b.name) ?? 0)).slice(0, 1);
  for (const p of chain) if (!queue.includes(p)) soonestRetry = Math.min(soonestRetry, cooldownUntil.get(p.name)! - Date.now());

  for (const p of queue) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 4000) {
        errors.push(`${p.name}: skipped (out of time)`);
        busy = true;
        break;
      }
      const timeout = Math.min(CALL_TIMEOUT_MS, remaining - 1000);
      try {
        const raw = await p.run(b64, mime, AbortSignal.timeout(timeout));
        cooldownUntil.delete(p.name);
        return { contacts: toContacts(raw), provider: p.name, raw };
      } catch (e) {
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof BusyError)) {
          const why = e instanceof BusyError ? e.message.slice(0, 160) : `no answer within ${Math.round(timeout / 1000)}s`;
          console.warn(`extract: ${p.name} busy/slow, trying next model:`, why);
          cooldownUntil.set(p.name, Date.now() + BUSY_COOLDOWN_MS);
          errors.push(`${p.name}: busy (${why})`);
          busy = true;
          break;
        }
        if (e instanceof QuotaError) {
          if (!e.daily && e.retryAfterMs <= MAX_INLINE_WAIT_MS && attempt < 2) {
            await sleep(e.retryAfterMs + 250);
            continue;
          }
          cooldownUntil.set(p.name, Date.now() + e.retryAfterMs);
          soonestRetry = Math.min(soonestRetry, e.retryAfterMs);
          errors.push(`${p.name}: rate limited${e.daily ? " (daily quota used up)" : ""}`);
          break;
        }
        if (e instanceof TransientError && attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
  }
  const msg = errors.length ? errors.join(" | ") : "All models are cooling down after hitting their free quota";
  if (busy) throw new Error(`AI busy: ${msg}`);
  if (soonestRetry !== Infinity) throw new Error(`429 quota: ${msg} (retry in ~${Math.ceil(soonestRetry / 60000)} min)`);
  throw new Error(msg);
}
