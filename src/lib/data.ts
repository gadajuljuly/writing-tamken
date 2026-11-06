/**
 * All reads and writes go straight to Supabase. Security lives in the database
 * (row level security + functions in supabase/schema.sql), not in this file.
 */
import { supabase } from "./supabase";
import type { Comp } from "./i18n";
import { emptyMinute, normalizeMinute, type MinuteContent } from "./minute";

export class ApiError extends Error {
  constructor(public code: string, public data: Record<string, unknown> = {}) { super(code); }
}

const KNOWN = ["duplicate", "only_uploader", "bad_code", "title_required", "not_found", "already_added", "bad_minute", "ai_off", "ai_failed", "no_text", "unauthorized"];
function fail(error: { message?: string; code?: string; details?: string; hint?: string } | null): never {
  const msg = error?.message ?? "error";
  const code = KNOWN.find((k) => msg.includes(k)) ?? (error?.code === "23505" ? "duplicate" : "error");
  throw new ApiError(code, { duplicateTitle: error?.details, duplicateOf: error?.hint ? Number(error.hint) : undefined });
}
async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(error);
  notifyChange();
  return data;
}
async function read<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(error);
  return data;
}

// ---------- change notifications: every open view refetches ----------
const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const notifyChange = () => listeners.forEach((l) => l());

// Realtime: other members' changes arrive instantly (plus a polling fallback in useData).
let channel: ReturnType<typeof supabase.channel> | null = null;
export function startRealtime() {
  if (channel) return;
  channel = supabase.channel("wt-changes");
  for (const table of ["wt_tasks", "wt_task_items", "wt_minutes", "wt_suggestions", "wt_members", "wt_audit"])
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => notifyChange());
  channel.subscribe();
}

// ---------- auth ----------
export type Me = { id: string; email: string; name: string | null };

export async function me(): Promise<Me | null> {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  const { data: p } = await supabase.from("wt_profiles").select("name").eq("id", u.id).maybeSingle();
  return { id: u.id, email: u.email ?? "", name: p?.name ?? null };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(error.message.includes("confirm") ? "confirm_email" : "bad_login");
}

export async function signUp(name: string, email: string, password: string, code: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw new ApiError(/already/i.test(error.message) ? "email_taken" : /password/i.test(error.message) ? "invalid" : "error");
  if (!data.session) throw new ApiError("confirm_email"); // email confirmation is on: join after first login
  await join(code, name);
}

export async function join(code: string, name: string) {
  const { error } = await supabase.rpc("wt_join", { p_code: code, p_name: name });
  if (error) fail(error);
}

export const signOut = () => supabase.auth.signOut();

// ---------- tasks ----------
export type TaskItem = { id: number; kind: "file" | "image" | "link" | "suggestion"; label: string; url: string; body: string; file_path: string | null; mime: string | null };
export type Task = {
  id: number; competition: Comp; axis: number; title: string; description: string; assignees: string[];
  status: "not_started" | "in_progress" | "done"; notes: string; proposal_approved: boolean;
  decision_minute_id: number | null; source_minute_id: number | null; created_at: string; completed_at: string | null;
  items: TaskItem[]; source_minute: { title: string } | null; decision_minute: { title: string } | null;
};

export const listTasks = (comp: Comp) =>
  read<Task[]>(supabase.from("wt_tasks")
    .select("*, items:wt_task_items(*), source_minute:wt_minutes!wt_tasks_source_minute_id_fkey(title), decision_minute:wt_minutes!wt_tasks_decision_minute_id_fkey(title)")
    .eq("competition", comp).order("axis").order("created_at").order("id").order("id", { referencedTable: "wt_task_items" }) as any);

export type TaskInput = Partial<Pick<Task, "title" | "description" | "axis" | "assignees" | "status" | "notes" | "proposal_approved" | "decision_minute_id">>;

export const createTask = (comp: Comp, t: TaskInput) =>
  must<{ id: number }>(supabase.from("wt_tasks").insert({ ...t, competition: comp }).select("id").single() as any);

export const updateTask = (id: number, t: TaskInput) => must(supabase.from("wt_tasks").update(t).eq("id", id) as any);
export const deleteTask = (id: number) => must(supabase.from("wt_tasks").delete().eq("id", id) as any);

export const documentDecision = (taskId: number, minuteId: number, text: string) =>
  must(supabase.rpc("wt_document_decision", { p_task: taskId, p_minute: minuteId, p_text: text }) as any);

export const MAX_FILE = 10 * 1024 * 1024;

async function uploadFile(prefix: string, file: File): Promise<string> {
  if (file.size > MAX_FILE) throw new ApiError("file_too_large");
  const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const path = `${prefix}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from("wt-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new ApiError("upload_failed");
  return path;
}

export async function addFileItem(task: Task, file: File) {
  const path = await uploadFile(`${task.competition}/tasks/${task.id}`, file);
  const kind = /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.type) ? "image" : "file";
  return must(supabase.from("wt_task_items").insert({ task_id: task.id, kind, label: file.name, file_path: path, mime: file.type }) as any);
}
export const addLinkItem = (taskId: number, url: string, label: string) => {
  if (!/^https?:\/\//i.test(url)) throw new ApiError("bad_url");
  return must(supabase.from("wt_task_items").insert({ task_id: taskId, kind: "link", url, label }) as any);
};
export const addSuggestionItem = (taskId: number, body: string) =>
  must(supabase.from("wt_task_items").insert({ task_id: taskId, kind: "suggestion", body }) as any);
export async function deleteItem(item: TaskItem) {
  await must(supabase.from("wt_task_items").delete().eq("id", item.id) as any);
  if (item.file_path) await supabase.storage.from("wt-files").remove([item.file_path]);
}

/** Short-lived signed link to a private file (only signed-in members can get one). */
export async function fileUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from("wt-files").createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error) throw new ApiError("not_found");
  return data.signedUrl;
}

// ---------- members ----------
export const listMembers = (comp: Comp) =>
  read<{ id: number; name: string }[]>(supabase.from("wt_members").select("id, name").eq("competition", comp).order("id") as any);
export const addMember = (comp: Comp, name: string) =>
  must(supabase.from("wt_members").upsert({ competition: comp, name: name.trim() }, { onConflict: "competition,name", ignoreDuplicates: true }) as any);

// ---------- minutes ----------
export type MinuteRow = {
  id: number; competition: Comp; title: string; meeting_date: string; status: string; has_pending_changes: boolean;
  current_version: number; archived: boolean; created_at: string; uploaded_by: string; uploader: { name: string } | null;
};
export type Suggestion = { id: number; title: string; description: string; axis: number; assignees: string[]; state: string; duplicate: { title: string } | null };
export type Minute = MinuteRow & {
  raw_text: string; draft: MinuteContent | null; ai_organized: boolean; source_file_path: string | null; source_file_name: string | null;
  versions: { version: number; content: MinuteContent; created_at: string; approver: { name: string } | null }[];
  suggestions: Suggestion[]; linked: { id: number; title: string; status: string }[];
};

export function listMinutes(comp: Comp, opts: { archived?: boolean; q?: string; limit?: number } = {}) {
  let query = supabase.from("wt_minutes")
    .select("id, competition, title, meeting_date, status, has_pending_changes, current_version, archived, created_at, uploaded_by, uploader:wt_profiles(name)")
    .eq("competition", comp).order("created_at", { ascending: false });
  if (opts.archived !== undefined) query = query.eq("archived", opts.archived);
  const q = opts.q?.trim().toLowerCase();
  if (q) query = query.ilike("search_text", `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
  if (opts.limit) query = query.limit(opts.limit);
  return read<MinuteRow[]>(query as any);
}

export const getMinute = (id: number) =>
  read<Minute>(supabase.from("wt_minutes").select(`*, uploader:wt_profiles(name),
    versions:wt_minute_versions(version, content, created_at, approver:wt_profiles(name)),
    suggestions:wt_suggestions(id, title, description, axis, assignees, state, duplicate:wt_tasks!wt_suggestions_duplicate_of_fkey(title)),
    linked:wt_tasks!wt_tasks_source_minute_id_fkey(id, title, status)`)
    .eq("id", id).order("version", { referencedTable: "wt_minute_versions", ascending: false })
    .order("id", { referencedTable: "wt_suggestions" }).single() as any);

/** Extracts plain text from a PDF / Word (.docx) / text file in the browser. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const { text } = await pdfText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
    return String(text).trim();
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value.trim();
  }
  return new TextDecoder().decode(buf).trim();
}

export async function createMinute(comp: Comp, input: { sourceType: "file" | "whatsapp" | "direct"; title: string; date: string; text?: string; file?: File | null }) {
  let raw = (input.text ?? "").trim();
  let path: string | null = null;
  let extractFailed = false;
  if (input.sourceType === "file") {
    if (!input.file) throw new ApiError("file_required");
    try { raw = await extractText(input.file); } catch { raw = ""; }
    if (!raw) extractFailed = true;
    path = await uploadFile(`${comp}/minutes`, input.file);
  } else if (!raw) throw new ApiError("text_required");

  const draft = emptyMinute(input.title, input.date);
  draft.discussions = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const row = await must<{ id: number }>(supabase.from("wt_minutes").insert({
    competition: comp, title: input.title, meeting_date: input.date, source_type: input.sourceType,
    source_file_path: path, source_file_name: input.file?.name ?? null, raw_text: raw, draft,
  }).select("id").single() as any);
  return { id: row.id, extractFailed };
}

export const saveDraft = (id: number, draft: MinuteContent) => must(supabase.rpc("wt_minute_save_draft", { p_id: id, p_draft: normalizeMinute(draft) }) as any);
export const approveMinute = (id: number, draft: MinuteContent) => must(supabase.rpc("wt_minute_approve", { p_id: id, p_draft: normalizeMinute(draft) }) as any);
export const restoreVersion = (id: number, version: number) => must(supabase.rpc("wt_minute_restore", { p_id: id, p_version: version }) as any);
export const setArchived = (id: number, archived: boolean) => must(supabase.rpc("wt_minute_set_archived", { p_id: id, p_archived: archived }) as any);
export const addSuggestion = (minute: number, s: { title: string; description?: string; axis: number; assignees: string[] }) =>
  must(supabase.rpc("wt_suggestion_add", { p_minute: minute, p_title: s.title, p_description: s.description ?? "", p_axis: s.axis, p_assignees: s.assignees }) as any);
export const updateSuggestion = (id: number, s: { title?: string; description?: string; axis?: number; assignees?: string[] }) =>
  must(supabase.rpc("wt_suggestion_update", { p_id: id, p_title: s.title ?? null, p_description: s.description ?? null, p_axis: s.axis ?? null, p_assignees: s.assignees ?? null }) as any);
export const setSuggestionState = (id: number, state: "pending" | "rejected") => must(supabase.rpc("wt_suggestion_set_state", { p_id: id, p_state: state }) as any);
export const applySuggestions = (minute: number, ids: number[]) =>
  must<{ added: number; skipped: number }>(supabase.rpc("wt_minute_apply", { p_minute: minute, p_ids: ids }) as any);

// ---------- AI (Supabase Edge Function "organize-minutes") ----------
export type AiMode = "anthropic" | "off";
let aiModeCache: Promise<AiMode> | null = null;
export function aiMode(): Promise<AiMode> {
  aiModeCache ??= supabase.functions.invoke("organize-minutes", { body: { ping: true } })
    .then(({ data, error }) => (!error && data?.mode === "anthropic" ? "anthropic" : "off"))
    .catch(() => "off" as const);
  return aiModeCache;
}
export async function organizeMinute(id: number) {
  const { data, error } = await supabase.functions.invoke("organize-minutes", { body: { minute_id: id } });
  if (error) {
    let code = "ai_failed";
    try { code = (await (error as any).context?.json())?.error ?? code; } catch { /* keep default */ }
    throw new ApiError(KNOWN.includes(code) ? code : "ai_failed");
  }
  notifyChange();
  return data;
}

// ---------- home & history ----------
export type AuditEntry = { id: number; entity: string; entity_id: number; action: string; summary: string; changes: Record<string, any>; created_at: string; user: { name: string } | null };

export async function summary(comp: Comp) {
  const statuses = await read<{ status: string }[]>(supabase.from("wt_tasks").select("status").eq("competition", comp) as any);
  const counts = { not_started: 0, in_progress: 0, done: 0 };
  for (const s of statuses) counts[s.status as keyof typeof counts]++;
  const [minutes, updates] = await Promise.all([
    listMinutes(comp, { archived: false, limit: 5 }),
    history(comp, "", 8),
  ]);
  return { counts, minutes, updates };
}

export function history(comp: Comp, entity = "", limit = 300) {
  let q = supabase.from("wt_audit").select("*, user:wt_profiles(name)").eq("competition", comp)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (entity) q = q.eq("entity", entity);
  return read<AuditEntry[]>(q as any);
}
