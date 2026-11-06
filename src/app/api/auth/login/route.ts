import bcrypt from "bcryptjs";
import { json } from "@/lib/api";
import { one } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const u = await one<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = $1", [String(email ?? "").trim().toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(password ?? ""), u.password_hash))) return json({ error: "bad_login" }, 401);
  await createSession(u.id);
  return json({ ok: true });
}
