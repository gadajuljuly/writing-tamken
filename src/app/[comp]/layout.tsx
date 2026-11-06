import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { isComp } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { CompProvider } from "@/components/client";

function findLogo(): string | null {
  for (const f of ["logo.svg", "logo.png", "logo.jpg", "logo.webp"]) {
    if (fs.existsSync(path.join(process.cwd(), "public", f))) return `/${f}`;
  }
  return null;
}

export default async function CompLayout({ children, params }: { children: React.ReactNode; params: Promise<{ comp: string }> }) {
  const { comp } = await params;
  if (!isComp(comp)) notFound();
  return (
    <CompProvider comp={comp}>
      <Header comp={comp} logo={findLogo()} />
      <main className="container">{children}</main>
    </CompProvider>
  );
}
