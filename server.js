// NAVBAHOR MEDIA — backend (Express + Sequelize + PostgreSQL). Frontend: public/index.html
require("dotenv").config();
const express = require("express"), path = require("path"), fs = require("fs");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit"), multer = require("multer");

const db = new Sequelize(process.env.DB_NAME || "navbahor_media", process.env.DB_USER || "postgres",
  process.env.DB_PASSWORD || "", { host: process.env.DB_HOST || "localhost", dialect: "postgres", logging: false });
const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ---------- MODELLAR ----------
const User = db.define("User", {
  fullName: { type: DataTypes.STRING(100), allowNull: false },
  username: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  email: { type: DataTypes.STRING(120), unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM("fan", "admin"), defaultValue: "fan" },
  totalDiamonds: { type: DataTypes.INTEGER, defaultValue: 0 },
  correctPredictions: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: "users" });
const Player = db.define("Player", {
  fullName: DataTypes.STRING, jerseyNumber: { type: DataTypes.INTEGER, unique: true },
  position: DataTypes.ENUM("GK", "DEF", "MID", "FWD"), photoUrl: DataTypes.STRING,
}, { tableName: "players" });
const Match = db.define("Match", {
  round: { type: DataTypes.INTEGER, validate: { min: 1, max: 32 } },
  opponent: DataTypes.STRING, stadium: DataTypes.STRING,
  matchDate: DataTypes.DATE, predictionDeadline: DataTypes.DATE,
  homeScore: DataTypes.INTEGER, awayScore: DataTypes.INTEGER,
  scored: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: "matches" });
const Prediction = db.define("Prediction", {
  formation: DataTypes.STRING(10), fanName: DataTypes.STRING(60),
  correctCount: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { tableName: "predictions", indexes: [{ unique: true, fields: ["UserId", "MatchId"] }] });
const PredictedPlayer = db.define("PredictedPlayer", {
  isCorrect: DataTypes.BOOLEAN,
}, { tableName: "predicted_players", indexes: [{ unique: true, fields: ["PredictionId", "PlayerId"] }] });
const OfficialLineup = db.define("OfficialLineup", {}, {
  tableName: "official_lineups", indexes: [{ unique: true, fields: ["MatchId", "PlayerId"] }] });
const DiamondTx = db.define("DiamondTx", {
  amount: DataTypes.INTEGER, reason: DataTypes.STRING,
  referenceKey: { type: DataTypes.STRING, unique: true }, // bir xil mukofot 2 marta berilmaydi
}, { tableName: "diamond_transactions" });

User.hasMany(Prediction); Prediction.belongsTo(User);
Match.hasMany(Prediction); Prediction.belongsTo(Match);
Prediction.hasMany(PredictedPlayer, { as: "players" }); PredictedPlayer.belongsTo(Prediction);
Player.hasMany(PredictedPlayer); PredictedPlayer.belongsTo(Player);
Match.hasMany(OfficialLineup, { as: "lineup" }); OfficialLineup.belongsTo(Match);
Player.hasMany(OfficialLineup); OfficialLineup.belongsTo(Player);
User.hasMany(DiamondTx); DiamondTx.belongsTo(User);

// ---------- APP ----------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "uploads"),
    filename: (r, f, cb) => cb(null, Date.now() + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /image\/(png|jpe?g|webp)/.test(f.mimetype)),
});
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e); res.status(e.status || 500).json({ ok: false, error: e.msg || "server_error" });
});
const fail = (status, msg) => { throw { status, msg }; };
const sign = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: "7d" });
const pub = (u) => ({ id: u.id, fullName: u.fullName, username: u.username, role: u.role,
  totalDiamonds: u.totalDiamonds, correctPredictions: u.correctPredictions });
const auth = wrap(async (req, res, next) => {
  try { const d = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), SECRET);
    req.user = await User.findByPk(d.id); } catch { }
  if (!req.user) fail(401, "unauthorized"); next();
});
const authMw = (req, res, next) => auth(req, res, next);
const adminMw = (req, res, next) => authMw(req, res, () =>
  req.user.role === "admin" ? next() : res.status(403).json({ ok: false, error: "forbidden" }));
const status = (m) => m.scored ? "finished" : new Date() < m.predictionDeadline ? "open" : "closed";

// ---------- AUTH ----------
app.post("/api/auth/register", wrap(async (req, res) => {
  const { fullName, username, email, password } = req.body;
  if (!fullName || !/^[a-zA-Z0-9_]{3,30}$/.test(username || "") || !/^\S+@\S+\.\S+$/.test(email || "") || (password || "").length < 6)
    fail(400, "invalid_input");
  if (await User.findOne({ where: { username } }) || await User.findOne({ where: { email: email.toLowerCase() } })) fail(409, "exists");
  const u = await User.create({ fullName, username, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10) });
  res.json({ ok: true, token: sign(u), user: pub(u) });
}));
app.post("/api/auth/login", wrap(async (req, res) => {
  const { login = "", password = "" } = req.body;
  const u = await User.findOne({ where: login.includes("@") ? { email: login.toLowerCase() } : { username: login } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) fail(401, "bad_credentials");
  res.json({ ok: true, token: sign(u), user: pub(u) });
}));
app.get("/api/auth/me", authMw, (req, res) => res.json({ ok: true, user: pub(req.user) }));

// ---------- ADMIN: Statistika ----------
app.get("/api/admin/stats", adminMw, wrap(async (req, res) => {
  const users = await User.count({ where: { role: "fan" } });
  const matches = await Match.count();
  const predictions = await Prediction.count();
  const diamonds = await User.sum("totalDiamonds") || 0;
  res.json({ ok: true, stats: { users, matches, predictions, diamonds } });
}));

// ---------- FUTBOLCHILAR ----------
app.get("/api/players", wrap(async (req, res) =>
  res.json({ ok: true, players: await Player.findAll({ order: [["position", "ASC"], ["jerseyNumber", "ASC"]] }) })));

app.post("/api/admin/players", adminMw, wrap(async (req, res) => {
  const { fullName, jerseyNumber, position } = req.body;
  if (!fullName || !jerseyNumber || !position) fail(400, "invalid_input");
  const p = await Player.create({ fullName, jerseyNumber, position });
  res.json({ ok: true, player: p });
}));

app.put("/api/admin/players/:id", adminMw, upload.single("photo"), wrap(async (req, res) => {
  const p = await Player.findByPk(req.params.id); if (!p) fail(404, "not_found");
  if (req.file) p.photoUrl = "/uploads/" + req.file.filename;
  if (req.body.fullName) p.fullName = req.body.fullName;
  if (req.body.jerseyNumber) p.jerseyNumber = req.body.jerseyNumber;
  if (req.body.position) p.position = req.body.position;
  await p.save(); res.json({ ok: true, player: p });
}));

app.delete("/api/admin/players/:id", adminMw, wrap(async (req, res) => {
  const p = await Player.findByPk(req.params.id); if (!p) fail(404, "not_found");
  await p.destroy(); res.json({ ok: true });
}));

// ---------- O'YINLAR ----------
app.get("/api/matches", wrap(async (req, res) => {
  const ms = await Match.findAll({ order: [["matchDate", "DESC"]], include: [{ model: OfficialLineup, as: "lineup" }] });
  res.json({ ok: true, matches: ms.map((m) => ({ ...m.toJSON(), status: status(m) })) });
}));
app.post("/api/admin/matches", adminMw, wrap(async (req, res) => {
  const { round, opponent, stadium, matchDate, predictionDeadline } = req.body;
  if (!round || !opponent || !matchDate || !predictionDeadline) fail(400, "invalid_input");
  res.json({ ok: true, match: await Match.create({ round, opponent, stadium, matchDate, predictionDeadline }) });
}));
app.put("/api/admin/matches/:id", adminMw, wrap(async (req, res) => {
  const m = await Match.findByPk(req.params.id); if (!m) fail(404, "not_found");
  Object.assign(m, req.body); await m.save();
  res.json({ ok: true, match: m });
}));
app.delete("/api/admin/matches/:id", adminMw, wrap(async (req, res) => {
  const m = await Match.findByPk(req.params.id); if (!m) fail(404, "not_found");
  await m.destroy(); res.json({ ok: true });
}));

// ---------- TAXMIN ----------
app.post("/api/predictions", authMw, wrap(async (req, res) => {
  const { matchId, formation, fanName, playerIds } = req.body;
  const m = await Match.findByPk(matchId); if (!m) fail(404, "not_found");
  if (status(m) !== "open") fail(403, "deadline_passed");        // server vaqti bilan tekshiriladi
  const ids = [...new Set((playerIds || []).map(Number))];
  if (ids.length !== 11 || !["4-3-3", "4-2-3-1", "3-5-2", "4-4-2"].includes(formation)) fail(400, "need_11");
  if ((await Player.count({ where: { id: ids } })) !== 11) fail(400, "bad_players");
  if (await Prediction.findOne({ where: { UserId: req.user.id, MatchId: m.id } })) fail(409, "already_submitted");
  await db.transaction(async (t) => {
    const p = await Prediction.create({ formation, fanName: (fanName || req.user.fullName).slice(0, 60), UserId: req.user.id, MatchId: m.id }, { transaction: t });
    await PredictedPlayer.bulkCreate(ids.map((id) => ({ PredictionId: p.id, PlayerId: id })), { transaction: t });
  });
  res.json({ ok: true });
}));
app.get("/api/predictions/my", authMw, wrap(async (req, res) => {
  const ps = await Prediction.findAll({
    where: { UserId: req.user.id }, order: [["createdAt", "DESC"]],
    include: [Match, { model: PredictedPlayer, as: "players", include: [Player] }],
  });
  res.json({ ok: true, predictions: ps });
}));

// ---------- ADMIN: rasmiy tarkib + ball hisoblash ----------
app.post("/api/admin/matches/:id/official-lineup", adminMw, wrap(async (req, res) => {
  const { playerIds, homeScore, awayScore } = req.body;
  const ids = [...new Set((playerIds || []).map(Number))];
  if (ids.length !== 11) fail(400, "need_11");
  await db.transaction(async (t) => {
    const m = await Match.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!m) fail(404, "not_found");
    if (m.scored) fail(409, "already_scored");                    // 2 marta hisoblanmaydi
    if (new Date() < m.predictionDeadline) fail(403, "deadline_not_passed");
    await OfficialLineup.bulkCreate(ids.map((id) => ({ MatchId: m.id, PlayerId: id })), { transaction: t });
    const preds = await Prediction.findAll({ where: { MatchId: m.id }, include: [{ model: PredictedPlayer, as: "players" }], transaction: t });
    for (const p of preds) {
      let correct = 0;
      for (const pp of p.players) {
        pp.isCorrect = ids.includes(pp.PlayerId); if (pp.isCorrect) correct++;
        await pp.save({ transaction: t });
      }
      p.correctCount = correct; await p.save({ transaction: t });
      const [, created] = await DiamondTx.findOrCreate({
        where: { referenceKey: `lineup:${m.id}:${p.UserId}` },
        defaults: { UserId: p.UserId, amount: correct, reason: "lineup_correct" }, transaction: t });
      if (created) await User.increment({ totalDiamonds: correct, correctPredictions: correct }, { where: { id: p.UserId }, transaction: t });
    }
    m.homeScore = homeScore ?? null; m.awayScore = awayScore ?? null; m.scored = true;
    await m.save({ transaction: t });
  });
  res.json({ ok: true });
}));
app.get("/api/admin/users", adminMw, wrap(async (req, res) =>
  res.json({ ok: true, users: (await User.findAll({ order: [["createdAt", "DESC"]] })).map(pub) })));

// ---------- REYTING ----------
app.get("/api/leaderboard", wrap(async (req, res) => {
  const top = await User.findAll({ where: { role: "fan" }, order: [["totalDiamonds", "DESC"], ["correctPredictions", "DESC"], ["createdAt", "ASC"]], limit: 100 });
  res.json({ ok: true, users: top.map(pub) });
}));

// ---------- BOSHLASH + SEED ----------
const squad = [["Otkir Yusupov",1,"GK"],["Shukron Yoldashev",16,"GK"],["Giorgi Jgerenaia",34,"DEF"],["Muhammadqodir Hamraliyev",55,"DEF"],
["Anri Tchitchinadze",44,"DEF"],["Isoxon Musoxonov",18,"DEF"],["Saidazamat Mirsaidov",2,"DEF"],["Umar Adhamzoda",22,"DEF"],
["Dilshod Komilov",5,"DEF"],["Islom Mamatkazin",4,"DEF"],["Shoxrux Abduraxmonov",6,"MID"],["Vanja Ilich",23,"MID"],
["Teidi Benjamin",13,"MID"],["Alex Fernandes",97,"MID"],["Diyor Holmatov",8,"MID"],["Asadbek Rahimjonov",21,"MID"],
["Ruslan Jiyanov",7,"FWD"],["Husayn Norchayev",11,"FWD"],["Joel Kojo",28,"FWD"],["Muhammadali Usminov",77,"FWD"],["Giyasov Muhammadali",17,"FWD"]];

(async () => {
  try {
    await db.authenticate(); await db.sync({ alter: true });
    for (const [fullName, jerseyNumber, position] of squad) await Player.findOrCreate({ where: { jerseyNumber }, defaults: { fullName, position } });
    const email = process.env.ADMIN_EMAIL || "admin@navbahor.uz";
    await User.findOrCreate({ where: { email }, defaults: { fullName: "Admin", username: process.env.ADMIN_USERNAME || "admin",
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "ChangeMe12345", 10), role: "admin" } });
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`✅ Tayyor: http://localhost:${port}`));
  } catch (e) { console.error("❌ Bazaga ulanib bo'lmadi:", e.message); process.exit(1); }
})();
