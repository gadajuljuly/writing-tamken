import "server-only";

/** Extracts plain text from an uploaded PDF / Word / text file. */
export async function extractText(name: string, mime: string, buf: Buffer): Promise<string> {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return String(text).trim();
  }
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value.trim();
  }
  if (lower.endsWith(".doc")) {
    throw new Error("doc_unsupported");
  }
  return buf.toString("utf8").trim();
}
