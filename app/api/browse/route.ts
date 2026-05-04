import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FILTERS: Record<string, string> = {
  sldprt: "SOLIDWORKS Part (*.sldprt)|*.sldprt|All Files (*.*)|*.*",
  sldasm: "SOLIDWORKS Assembly (*.sldasm)|*.sldasm|All Files (*.*)|*.*",
  slddrw: "SOLIDWORKS Drawing (*.slddrw)|*.slddrw|All Files (*.*)|*.*",
  drwdot: "Drawing Template (*.drwdot)|*.drwdot|All Files (*.*)|*.*",
  // 'model' covers parts and assemblies — used by the Part/Assembly file picker
  model:  "SOLIDWORKS Model (*.sldprt;*.sldasm)|*.sldprt;*.sldasm|Parts (*.sldprt)|*.sldprt|Assemblies (*.sldasm)|*.sldasm|All Files (*.*)|*.*",
};

const TITLES: Record<string, string> = {
  sldprt: "Select SOLIDWORKS Part",
  sldasm: "Select SOLIDWORKS Assembly",
  slddrw: "Save Drawing As",
  drwdot: "Select Drawing Template",
  model:  "Select SOLIDWORKS Part or Assembly",
};

export async function GET(req: NextRequest) {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { path: null, error: "The file browser only works when you run the app locally on Windows (http://localhost:3000). Type the path manually instead." },
      { status: 400 }
    );
  }

  const { searchParams } = req.nextUrl;
  const filter = searchParams.get("filter") ?? "sldprt";
  const saveAs = searchParams.get("saveAs") === "true";

  const dialogType = saveAs ? "SaveFileDialog" : "OpenFileDialog";
  const filterStr = FILTERS[filter] ?? FILTERS.sldprt;
  const title = TITLES[filter] ?? "Select File";

  const scriptLines = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    // A hidden top-most owner form forces the dialog to the foreground
    // instead of appearing behind the browser window.
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual",
    "$owner.Location = New-Object System.Drawing.Point(0,0)",
    "$owner.Size = New-Object System.Drawing.Size(1,1)",
    "$owner.Show()",
    `$d = New-Object System.Windows.Forms.${dialogType}`,
    `$d.Title = "${title}"`,
    `$d.Filter = "${filterStr}"`,
    ...(saveAs ? [`$d.DefaultExt = "${filter}"`] : []),
    "$null = $d.ShowDialog($owner)",
    "$owner.Dispose()",
    "Write-Output $d.FileName",
  ];

  // PowerShell -EncodedCommand expects UTF-16LE base64
  const encoded = Buffer.from(scriptLines.join("\n"), "utf16le").toString("base64");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      // Omit -NonInteractive so WinForms can pump the UI message loop
      ["-NoProfile", "-EncodedCommand", encoded],
      { timeout: 60_000 }
    );
    const path = stdout.trim();
    return NextResponse.json({ path: path || null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ path: null, error: msg }, { status: 500 });
  }
}
