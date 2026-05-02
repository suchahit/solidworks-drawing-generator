import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FILTERS: Record<string, string> = {
  sldprt: "SOLIDWORKS Part (*.sldprt)|*.sldprt|All Files (*.*)|*.*",
  slddrw: "SOLIDWORKS Drawing (*.slddrw)|*.slddrw|All Files (*.*)|*.*",
  drwdot: "Drawing Template (*.drwdot)|*.drwdot|All Files (*.*)|*.*",
};

const TITLES: Record<string, string> = {
  sldprt: "Select SOLIDWORKS Part",
  slddrw: "Save Drawing As",
  drwdot: "Select Drawing Template",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const filter = searchParams.get("filter") ?? "sldprt";
  const saveAs = searchParams.get("saveAs") === "true";

  const dialogType = saveAs ? "SaveFileDialog" : "OpenFileDialog";
  const filterStr = FILTERS[filter] ?? FILTERS.sldprt;
  const title = TITLES[filter] ?? "Select File";

  const scriptLines = [
    "Add-Type -AssemblyName System.Windows.Forms",
    `$d = New-Object System.Windows.Forms.${dialogType}`,
    `$d.Title = "${title}"`,
    `$d.Filter = "${filterStr}"`,
    ...(saveAs ? [`$d.DefaultExt = "${filter}"`] : []),
    "$null = $d.ShowDialog()",
    "Write-Output $d.FileName",
  ];

  // PowerShell -EncodedCommand expects UTF-16LE base64
  const encoded = Buffer.from(scriptLines.join("\n"), "utf16le").toString("base64");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { timeout: 60_000 }
    );
    const path = stdout.trim();
    return NextResponse.json({ path: path || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ path: null, error: msg }, { status: 500 });
  }
}
