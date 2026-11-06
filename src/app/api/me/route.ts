import { handler, json } from "@/lib/api";
export const GET = handler(async (_req, user) => json(user));
