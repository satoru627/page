const express = require("express");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const multer = require("multer");

const app = express();
const port = process.env.PORT || 3000;

// --- STORAGE CONFIGURATION ---
// On Railway, mount your volume to /app/storage
const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(__dirname, "storage");
const dbDir = path.join(STORAGE_ROOT, "data");
const dbPath = path.join(dbDir, "monetize-hub.sqlite");
const uploadDir = path.join(STORAGE_ROOT, "uploads");
// -----------------------------

const rootDir = __dirname;

// --- CONFIGURATION ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!"; // Set this in Railway Variables!
// ---------------------

fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseSync(dbPath);

// Ensure purchase_link and monetized columns exist (migration)
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN purchase_link TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN monetized INTEGER DEFAULT 1`);
  // Ensure existing rows get the default value if they were already there
  db.exec(`UPDATE accounts SET monetized = 1 WHERE monetized IS NULL`);
} catch (e) {}

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Basic Auth Middleware
function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (pass === ADMIN_PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).send('Invalid credentials');
  }
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS popup_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    source TEXT DEFAULT 'popup',
    page TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS newsletter_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL, -- 'tiktok' or 'youtube'
    name TEXT NOT NULL,
    price TEXT NOT NULL,
    description TEXT,
    meta_items TEXT, -- JSON array of strings
    badge TEXT,
    image_path TEXT,
    expires_at TEXT,
    is_available BOOLEAN DEFAULT 1,
    purchase_link TEXT,
    monetized INTEGER DEFAULT 1
  );
`);

// Seed data if empty
const accountCount = db.prepare(`SELECT count(*) as count FROM accounts`).get().count;
if (accountCount === 0) {
  const insertAcc = db.prepare(`INSERT INTO accounts (platform, name, price, description, meta_items, badge, image_path, expires_at, monetized) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const accounts = [
    ['tiktok', 'TikTok Starter', '50K FCFA', 'Compte pret pour lancement rapide et tests de contenu.', JSON.stringify(['10K+ abonnes', 'Monetise', 'Niche generaliste', 'Livraison 24h']), 'Disponible', 'hero.png', '2026-07-01', 1],
    ['tiktok', 'TikTok Creator', '75K FCFA', 'Profil adapte aux createurs qui publient souvent.', JSON.stringify(['25K+ abonnes', 'Monetise', 'Bon engagement', 'Support inclus']), 'Disponible', 'hero.png', '2026-07-05', 1],
    ['tiktok', 'TikTok Premium', '120K FCFA', 'Compte plus solide pour scaling et tests intensifs.', JSON.stringify(['50K+ abonnes', 'Monetise', 'Niche business', 'Transfert guide']), 'Stock limite', 'hero.png', '2026-06-20', 1],
    ['youtube', 'YouTube Starter', '80K FCFA', 'Chaine monetisee pour lancer rapidement une strategie video.', JSON.stringify(['1K+ abonnes', 'AdSense pret', 'Niche generaliste', 'Livraison 24h']), 'Disponible', 'designarena_image_ajbe96ys.png', '2026-07-01', 1],
    ['youtube', 'YouTube Growth', '150K FCFA', 'Chaine avec meilleure base pour contenus longs et Shorts.', JSON.stringify(['5K+ abonnes', 'Monetisee', 'Audience active', 'Support inclus']), 'Disponible', 'designarena_image_ajbe96ys.png', '2026-07-08', 1],
    ['youtube', 'YouTube Premium', '250K FCFA', 'Chaine plus avancee pour creer un actif media durable.', JSON.stringify(['10K+ abonnes', 'AdSense actif', 'Niche business', 'Transfert guide']), 'Stock limite', 'designarena_image_ajbe96ys.png', '2026-06-22', 1],
  ];

  accounts.forEach(acc => insertAcc.run(...acc));
  console.log("Database seeded with accounts.");
}

const insertLead = db.prepare(`
  INSERT INTO popup_leads (name, email, source, page)
  VALUES (?, ?, ?, ?)
`);

const listLeads = db.prepare(`
  SELECT id, name, email, source, page, created_at
  FROM popup_leads
  ORDER BY id DESC
`);

const insertSub = db.prepare(`
  INSERT INTO newsletter_subs (email)
  VALUES (?)
`);


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(uploadDir));

function sendHtml(res, fileName) {
  res.sendFile(path.join(rootDir, fileName));
}

app.get("/", (_req, res) => sendHtml(res, "monetizehub-dark-premium.html"));
app.get("/monetizehub-dark-premium.html", (_req, res) => sendHtml(res, "monetizehub-dark-premium.html"));
app.get("/tiktok-accounts.html", (_req, res) => sendHtml(res, "tiktok-accounts.html"));
app.get("/youtube-accounts.html", (_req, res) => sendHtml(res, "youtube-accounts.html"));
app.get("/admin", basicAuth, (_req, res) => sendHtml(res, "admin.html"));
app.get("/admin.html", basicAuth, (_req, res) => sendHtml(res, "admin.html"));
app.get("/hero.png", (_req, res) => res.sendFile(path.join(rootDir, "hero.png")));
app.get("/designarena_image_ajbe96ys.png", (_req, res) => res.sendFile(path.join(rootDir, "designarena_image_ajbe96ys.png")));

app.post("/api/popup-leads", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const source = String(req.body.source || "popup").trim().slice(0, 50);
  const page = String(req.body.page || "monetizehub-dark-premium").trim().slice(0, 120);

  if (name.length < 2) {
    return res.status(400).json({ error: "Le nom est requis." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email invalide." });
  }

  const result = insertLead.run(name, email, source, page);

  return res.status(201).json({
    ok: true,
    id: result.lastInsertRowid,
    name,
    email,
    source,
    page
  });
});

app.post("/api/newsletter", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Email invalide." });
  }

  try {
    insertSub.run(email);
    res.status(201).json({ ok: true, message: "S'est abonné avec succès." });
  } catch (e) {
    if (e.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "Cet email est déjà inscrit." });
    }
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

app.get("/api/popup-leads", (_req, res) => {
  const leads = listLeads.all();
  res.json({ ok: true, count: leads.length, leads });
});

// ... existing code above ...
app.get("/api/accounts", (req, res) => {
  const platform = req.query.platform;
  if (!platform) return res.status(400).json({ error: "Platform required." });

  const accounts = db.prepare(`SELECT * FROM accounts WHERE platform = ? AND is_available = 1 ORDER BY id ASC`).all(platform);
  res.json({ ok: true, accounts });
});

// --- ADMIN API: Accounts CRUD ---

app.get("/api/admin/accounts", basicAuth, (_req, res) => {
  try {
    const accounts = db.prepare(`SELECT * FROM accounts ORDER BY id DESC`).all();
    res.json({ ok: true, accounts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/admin/accounts", basicAuth, (req, res) => {
  try {
    const { platform, name, price, description, meta_items, badge, image_path, expires_at, purchase_link, monetized } = req.body;

    if (!platform || !name || !price) {
      return res.status(400).json({ ok: false, error: "Platform, name and price are required." });
    }

    const stmt = db.prepare(`
      INSERT INTO accounts (platform, name, price, description, meta_items, badge, image_path, expires_at, purchase_link, monetized)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      platform,
      name,
      price,
      description || "",
      typeof meta_items === 'string' ? meta_items : JSON.stringify(meta_items || []),
      badge || "Disponible",
      image_path || "hero.png",
      expires_at || new Date().toISOString().split('T')[0],
      purchase_link || "",
      monetized !== undefined ? monetized : 1
    );

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put("/api/admin/accounts/:id", basicAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { platform, name, price, description, meta_items, badge, image_path, expires_at, is_available, purchase_link, monetized } = req.body;

    const stmt = db.prepare(`
      UPDATE accounts
      SET platform = ?, name = ?, price = ?, description = ?, meta_items = ?, badge = ?, image_path = ?, expires_at = ?, is_available = ?, purchase_link = ?, monetized = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      platform,
      name,
      price,
      description,
      typeof meta_items === 'string' ? meta_items : JSON.stringify(meta_items || []),
      badge,
      image_path,
      expires_at,
      is_available !== undefined ? is_available : 1,
      purchase_link || "",
      monetized !== undefined ? monetized : 1,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: "Account not found." });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete("/api/admin/accounts/:id", basicAuth, (req, res) => {
  try {
    const id = req.params.id;
    const result = db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ ok: false, error: "Account not found." });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/admin/upload", basicAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded." });
  }
  res.json({
    ok: true,
    path: `/uploads/${req.file.filename}`
  });
});

app.get("/api/health", (_req, res) => {
// ... existing code below ...
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Monetize Hub running at http://localhost:${port}`);
});
