import bcrypt from "bcryptjs";
import { json } from "@/lib/api";
import { one } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { name, email, password, code } = await req.json().catch(() => ({}));
  const expected = process.env.SIGNUP_CODE || (process.env.NODE_ENV === "production" ? "" : "dev");
  if (!expected) return json({ error: "signup_disabled" }, 403);
  if (String(code ?? "").trim() !== expected) return json({ error: "bad_code" }, 403);
  const e = String(email ?? "").trim().toLowerCase();
  if (!String(name ?? "").trim() || !/^\S+@\S+\.\S+$/.test(e) || String(password ?? "").length < 6)
    return json({ error: "invalid" }, 400);
  if (await one("SELECT 1 FROM users WHERE email = $1", [e])) return json({ error: "email_taken" }, 409);
  const hash = await bcrypt.hash(String(password), 10);
  const u = await one<{ id: number }>("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id", [e, String(name).trim(), hash]);
  await createSession(u!.id);
  return json({ ok: true });
}
