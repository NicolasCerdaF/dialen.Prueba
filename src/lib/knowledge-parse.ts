// Parseo de archivos en el cliente para extraer texto plano antes de
// enviarlo al server para chunking + embeddings. Se importa dinámicamente
// para no engordar el bundle inicial.

export type ParsedFile = {
  name: string;
  type: string;
  size: number;
  text: string;
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isSupported(file: File): boolean {
  const ext = extFromName(file.name);
  return ["txt", "md", "markdown", "pdf", "docx"].includes(ext);
}

export async function parseFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_BYTES) {
    throw new Error(`El archivo supera 15 MB (${(file.size / 1_000_000).toFixed(1)} MB).`);
  }
  const ext = extFromName(file.name);

  let text = "";
  if (ext === "txt" || ext === "md" || ext === "markdown") {
    text = await file.text();
  } else if (ext === "pdf") {
    text = await parsePdf(file);
  } else if (ext === "docx") {
    text = await parseDocx(file);
  } else {
    throw new Error("Formato no soportado. Usa PDF, DOCX, TXT o MD.");
  }

  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length < 20) {
    throw new Error("No se pudo extraer texto legible del archivo.");
  }
  return {
    name: file.name,
    type: file.type || ext,
    size: file.size,
    text: clean,
  };
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // @ts-ignore worker as URL
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  (pdfjs as any).GlobalWorkerOptions.workerSrc = worker.default;

  const buf = await file.arrayBuffer();
  const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it: any) => it.str).join(" ");
    parts.push(line);
  }
  return parts.join("\n\n");
}

async function parseDocx(file: File): Promise<string> {
  // @ts-ignore browser build has no type declarations
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return String(res?.value ?? "");
}
