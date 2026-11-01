import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireModule } from "../permissions";

export const settingsRouter = Router();

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? path.extname(file.originalname) ?? "";
      cb(null, `${req.params.kind}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error("Unsupported image type. Use PNG, JPEG, WEBP or SVG."));
      return;
    }
    cb(null, true);
  },
});

// The التحكم tab's configuration (hidden tabs, renamed tabs and texts, added tabs, relations),
// stored as one JSON value. Every signed-in user reads it through GET /settings.
const UI_CONTROL_KEY = "ui_control";

function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function deleteLocalUpload(url: string | null) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(url));
  fs.unlink(filePath, () => {});
}

function allSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

settingsRouter.get("/public", (_req, res) => {
  res.json({
    settings: {
      school_name: getSetting("school_name") ?? "",
      logo_url: getSetting("logo_url") ?? "",
      background_url: getSetting("background_url") ?? "",
      theme_palette: getSetting("theme_palette") ?? "",
    },
  });
});

// Read is available to any authenticated user — global chrome (header/footer branding)
// reads this on every page, not just the Configuration module. Only the writes below
// (editing settings, uploading/removing branding) require the "configuration" module.
settingsRouter.get("/", requireAuth, (_req, res) => {
  res.json({ settings: allSettings() });
});

settingsRouter.put("/", requireAuth, requireModule("configuration"), (req, res) => {
  const b = (req.body ?? {}) as Record<string, string>;
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) upsert.run(key, value);
  });
  // ui_control belongs to the التحكم tab (below); the Preferences form sends every setting back,
  // so a stale copy of it must not overwrite the Control tab's.
  // The academic year is opened in the العام الدراسي tab (routes/academicYears.ts), which keeps
  // academic_year equal to the open year's name.
  tx(Object.entries(b).filter(([key]) => key !== UI_CONTROL_KEY && key !== "academic_year" && key !== "current_academic_year_id"));

  res.json({ settings: allSettings() });
});

settingsRouter.put("/ui-control", requireAuth, requireModule("controlPanel"), (req, res) => {
  const value = req.body?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return res.status(400).json({ error: "value must be an object" });
  }
  const json = JSON.stringify(value);
  if (json.length > 500_000) return res.status(400).json({ error: "Control configuration is too large" });

  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(UI_CONTROL_KEY, json);

  res.json({ settings: allSettings() });
});

settingsRouter.post("/branding/:kind", requireAuth, requireModule("configuration"), (req, res) => {
  const kind = req.params.kind;
  if (kind !== "logo" && kind !== "background") {
    return res.status(400).json({ error: "kind must be 'logo' or 'background'" });
  }

  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "Upload failed" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const key = `${kind}_url`;
    const url = `/uploads/${req.file.filename}`;
    deleteLocalUpload(getSetting(key));

    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, url);

    res.status(201).json({ settings: allSettings() });
  });
});

settingsRouter.delete("/branding/:kind", requireAuth, requireModule("configuration"), (req, res) => {
  const kind = req.params.kind;
  if (kind !== "logo" && kind !== "background") {
    return res.status(400).json({ error: "kind must be 'logo' or 'background'" });
  }

  const key = `${kind}_url`;
  deleteLocalUpload(getSetting(key));
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, "");

  res.json({ settings: allSettings() });
});
