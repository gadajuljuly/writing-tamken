import { handler, json } from "@/lib/api";
import { aiMode } from "@/lib/ai";
export const GET = handler(async () => json({ mode: aiMode() }));
