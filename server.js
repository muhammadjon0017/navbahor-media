
// PFCNAVBAHOR_ — Backend
// Express + Sequelize + PostgreSQL

const path = require("path");
const fs = require("fs");

require("dotenv").config({
  path: path.resolve(__dirname, ".env")
});

const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

// ---------- DATABASE ----------

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && !process.env.DB_PASSWORD) {
  console.error("❌ DATABASE_URL yoki DB_PASSWORD .env faylida topilmadi!");
  process.exit(1);
}

const databaseOptions = {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    application_name: "pfcnavbahor"
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};

const db = databaseUrl
  ? new Sequelize(databaseUrl, databaseOptions)
  : new Sequelize(
      process.env.DB_NAME || "navbahor_media",
      process.env.DB_USER || "postgres",
      String(process.env.DB_PASSWORD),
      {
        ...databaseOptions,
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432
      }
    );

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error("❌ JWT_SECRET .env faylida topilmadi!");
  process.exit(1);
}

// ---------- MODELLAR ----------

const User = db.define("User", {
  fullName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(30),
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(120),
    unique: true,
    allowNull: false
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM("fan", "admin"),
    defaultValue: "fan"
  },
  totalDiamonds: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  correctPredictions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: "users"
});

const Player = db.define("Player", {
  fullName: DataTypes.STRING,
  jerseyNumber: {
    type: DataTypes.INTEGER,
    unique: true
  },
  position: DataTypes.ENUM("GK", "DEF", "MID", "FWD"),
  photoUrl: DataTypes.STRING,
  info: DataTypes.TEXT, // Qo'shimcha ma'lumot
}, {
  tableName: "players"
});

const Match = db.define("Match", {
  round: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 32
    }
  },
  opponent: DataTypes.STRING,
  stadium: DataTypes.STRING,
  matchDate: DataTypes.DATE,
  predictionDeadline: DataTypes.DATE,
  homeScore: DataTypes.INTEGER,
  awayScore: DataTypes.INTEGER,
  scored: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: "matches"
});

const Prediction = db.define("Prediction", {
  formation: DataTypes.STRING(10),
  fanName: DataTypes.STRING(60),
  correctCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: "predictions",
  indexes: [{
    unique: true,
    fields: ["UserId", "MatchId"]
  }]
});

const PredictedPlayer = db.define("PredictedPlayer", {
  isCorrect: DataTypes.BOOLEAN
}, {
  tableName: "predicted_players",
  indexes: [{
    unique: true,
    fields: ["PredictionId", "PlayerId"]
  }]
});

const OfficialLineup = db.define("OfficialLineup", {
  isStarting: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  tableName: "official_lineups",
  indexes: [{
    unique: true,
    fields: ["MatchId", "PlayerId"]
  }]
});

const DiamondTx = db.define("DiamondTx", {
  amount: DataTypes.INTEGER,
  reason: DataTypes.STRING,
  referenceKey: {
    type: DataTypes.STRING,
    unique: true
  }
}, {
  tableName: "diamond_transactions"
});

const News = db.define("News", {
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  imageUrl: DataTypes.STRING
}, {
  tableName: "news"
});

// ---------- RELATIONSHIPS ----------

User.hasMany(Prediction);
Prediction.belongsTo(User);

Match.hasMany(Prediction);
Prediction.belongsTo(Match);

Prediction.hasMany(PredictedPlayer, {
  as: "players"
});
PredictedPlayer.belongsTo(Prediction);

Player.hasMany(PredictedPlayer);
PredictedPlayer.belongsTo(Player);

Match.hasMany(OfficialLineup, {
  as: "lineup"
});
OfficialLineup.belongsTo(Match);

Player.hasMany(OfficialLineup);
OfficialLineup.belongsTo(Player);

User.hasMany(DiamondTx);
DiamondTx.belongsTo(User);

// ---------- APP ----------

const app = express();

app.use(express.json({
  limit: "1mb"
}));

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

app.use(express.static(path.join(__dirname, "public")));

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, {
    recursive: true
  });
}

app.use("/uploads", express.static(uploadsDir));

// ---------- MULTER ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      cb(
        null,
        Date.now() + path.extname(file.originalname).toLowerCase()
      );
    }
  }),
  limits: {
    fileSize: 3 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (/image\/(png|jpe?g|webp)/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Faqat PNG, JPG va WEBP rasmlar mumkin"));
    }
  }
});

// ---------- HELPERS ----------

const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error(e);
    if (res.headersSent) return next(e);

    res.status(e.status || 500).json({
      ok: false,
      error: e.msg || "server_error"
    });
  });
};

const fail = (status, msg) => {
  const error = new Error(msg);
  error.status = status;
  error.msg = msg;
  throw error;
};

const sign = (user) => jwt.sign(
  { id: user.id },
  SECRET,
  { expiresIn: "7d" }
);

const pub = (user) => ({
  id: user.id,
  fullName: user.fullName,
  username: user.username,
  role: user.role,
  totalDiamonds: user.totalDiamonds,
  correctPredictions: user.correctPredictions
});

const status = (match) => {
  if (match.scored) return "finished";

  return new Date() < new Date(match.predictionDeadline)
    ? "open"
    : "closed";
};

// ---------- AUTH MIDDLEWARE ----------

const authMw = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    const decoded = jwt.verify(token, SECRET);

    req.user = await User.findByPk(decoded.id);

    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized"
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized"
    });
  }
};

const adminMw = (req, res, next) => {
  authMw(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "forbidden"
      });
    }

    next();
  });
};

// ---------- AUTH ROUTES ----------

app.post("/api/auth/register", wrap(async (req, res) => {
  const {
    fullName,
    username,
    email,
    password
  } = req.body;

  if (
    !fullName ||
    !/^[a-zA-Z0-9_]{3,30}$/.test(username || "") ||
    !/^\S+@\S+\.\S+$/.test(email || "") ||
    typeof password !== "string" ||
    password.length < 6
  ) {
    fail(400, "invalid_input");
  }

  const normalizedEmail = email.toLowerCase();

  const exists = await User.findOne({
    where: {
      [Sequelize.Op.or]: [
        { username },
        { email: normalizedEmail }
      ]
    }
  });

  if (exists) fail(409, "exists");

  const user = await User.create({
    fullName,
    username,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 10),
    role: "fan"
  });

  res.json({
    ok: true,
    token: sign(user),
    user: pub(user)
  });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const {
    login = "",
    password = ""
  } = req.body;

  if (typeof login !== "string" || typeof password !== "string") {
    fail(400, "invalid_input");
  }

  const user = await User.findOne({
    where: login.includes("@")
      ? { email: login.toLowerCase() }
      : { username: login }
  });

  if (
    !user ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    fail(401, "bad_credentials");
  }

  res.json({
    ok: true,
    token: sign(user),
    user: pub(user)
  });
}));

app.get("/api/auth/me", authMw, (req, res) => {
  res.json({
    ok: true,
    user: pub(req.user)
  });
});

// ---------- PROFILE ----------

app.put("/api/me", authMw, wrap(async (req, res) => {
  const { fullName } = req.body;

  if (
    typeof fullName !== "string" ||
    !fullName.trim() ||
    fullName.trim().length > 100
  ) {
    fail(400, "invalid_input");
  }

  req.user.fullName = fullName.trim();
  await req.user.save();

  res.json({
    ok: true,
    user: pub(req.user)
  });
}));

// ---------- ADMIN STATS ----------

app.get("/api/admin/stats", adminMw, wrap(async (req, res) => {
  const users = await User.count({
    where: { role: "fan" }
  });

  const matches = await Match.count();
  const predictions = await Prediction.count();

  const diamonds = await User.sum("totalDiamonds") || 0;

  res.json({
    ok: true,
    stats: {
      users,
      matches,
      predictions,
      diamonds
    }
  });
}));

// ---------- PLAYERS ----------

app.get("/api/players", wrap(async (req, res) => {
  const players = await Player.findAll({
    order: [
      ["position", "ASC"],
      ["jerseyNumber", "ASC"]
    ]
  });

  res.json({
    ok: true,
    players
  });
}));

app.post("/api/admin/players", adminMw, wrap(async (req, res) => {
  const {
    fullName,
    jerseyNumber,
    position
  } = req.body;

  if (!fullName || !jerseyNumber || !position) {
    fail(400, "invalid_input");
  }

  const player = await Player.create({
    fullName,
    jerseyNumber,
    position
  });

  res.json({
    ok: true,
    player
  });
}));

app.put("/api/admin/players/:id", adminMw, upload.single("photo"), wrap(async (req, res) => {
  const player = await Player.findByPk(req.params.id);

  if (!player) fail(404, "not_found");

  if (req.file) {
    player.photoUrl = "/uploads/" + req.file.filename;
  }

  if (req.body.fullName) {
    player.fullName = req.body.fullName;
  }

  if (req.body.jerseyNumber) {
    player.jerseyNumber = req.body.jerseyNumber;
  }

  if (req.body.position) {
    player.position = req.body.position;
  }

  await player.save();

  res.json({
    ok: true,
    player
  });
}));

app.delete("/api/admin/players/:id", adminMw, wrap(async (req, res) => {
  const player = await Player.findByPk(req.params.id);

  if (!player) fail(404, "not_found");

  await player.destroy();

  res.json({ ok: true });
}));

// ---------- MATCHES ----------

app.get("/api/matches", wrap(async (req, res) => {
  const matches = await Match.findAll({
    order: [["matchDate", "DESC"]],
    include: [{
      model: OfficialLineup,
      as: "lineup"
    }]
  });

  res.json({
    ok: true,
    matches: matches.map((match) => ({
      ...match.toJSON(),
      status: status(match)
    }))
  });
}));

app.get("/api/admin/matches/:id/prediction-stats", adminMw, wrap(async (req, res) => {
  const match = await Match.findByPk(req.params.id);

  if (!match) fail(404, "not_found");

  const predictions = await Prediction.findAll({
    attributes: ["id"],
    where: { MatchId: match.id },
    raw: true
  });
  const predictionIds = predictions.map((prediction) => prediction.id);
  const counts = predictionIds.length
    ? await PredictedPlayer.findAll({
        attributes: [
          "PlayerId",
          [Sequelize.fn("COUNT", Sequelize.col("PlayerId")), "votes"]
        ],
        where: { PredictionId: predictionIds },
        group: ["PlayerId"],
        order: [
          [Sequelize.fn("COUNT", Sequelize.col("PlayerId")), "DESC"],
          ["PlayerId", "ASC"]
        ],
        raw: true
      })
    : [];
  const players = counts.length
    ? await Player.findAll({
        where: { id: counts.map((count) => count.PlayerId) }
      })
    : [];
  const playersById = new Map(players.map((player) => [player.id, player]));
  const playerStats = counts
    .map((count) => {
      const player = playersById.get(count.PlayerId);
      if (!player) return null;

      const votes = Number(count.votes);
      return {
        id: player.id,
        fullName: player.fullName,
        jerseyNumber: player.jerseyNumber,
        position: player.position,
        photoUrl: player.photoUrl,
        votes,
        percentage: predictions.length
          ? Math.round((votes / predictions.length) * 100)
          : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.votes - a.votes || a.jerseyNumber - b.jerseyNumber);

  res.json({
    ok: true,
    stats: {
      predictions: predictions.length,
      players: playerStats
    }
  });
}));

app.post("/api/admin/matches", adminMw, wrap(async (req, res) => {
  const {
    round,
    opponent,
    stadium,
    matchDate,
    predictionDeadline
  } = req.body;

  if (!round || !opponent || !matchDate || !predictionDeadline) {
    fail(400, "invalid_input");
  }

  const match = await Match.create({
    round,
    opponent,
    stadium,
    matchDate,
    predictionDeadline
  });

  res.json({
    ok: true,
    match
  });
}));

app.put("/api/admin/matches/:id", adminMw, wrap(async (req, res) => {
  const match = await Match.findByPk(req.params.id);

  if (!match) fail(404, "not_found");

  const allowed = [
    "round",
    "opponent",
    "stadium",
    "matchDate",
    "predictionDeadline",
    "homeScore",
    "awayScore"
  ];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      match[key] = req.body[key];
    }
  }

  await match.save();

  res.json({
    ok: true,
    match
  });
}));

app.delete("/api/admin/matches/:id", adminMw, wrap(async (req, res) => {
  const match = await Match.findByPk(req.params.id);

  if (!match) fail(404, "not_found");

  await match.destroy();

  res.json({ ok: true });
}));

// ---------- PREDICTIONS ----------

app.post("/api/predictions", authMw, wrap(async (req, res) => {
  const {
    matchId,
    formation,
    fanName,
    playerIds
  } = req.body;

  const match = await Match.findByPk(matchId);

  if (!match) fail(404, "not_found");

  if (status(match) !== "open") {
    fail(403, "deadline_passed");
  }

  const ids = [...new Set(
    (Array.isArray(playerIds) ? playerIds : []).map(Number)
  )];

  const formations = [
    "4-3-3",
    "4-2-3-1",
    "3-5-2",
    "4-4-2"
  ];

  if (ids.length !== 11 || !formations.includes(formation)) {
    fail(400, "need_11");
  }

  if ((await Player.count({
    where: { id: ids }
  })) !== 11) {
    fail(400, "bad_players");
  }

  const existing = await Prediction.findOne({
    where: {
      UserId: req.user.id,
      MatchId: match.id
    }
  });

  if (existing) fail(409, "already_submitted");

  await db.transaction(async (transaction) => {
    const prediction = await Prediction.create({
      formation,
      fanName: (
        typeof fanName === "string" && fanName.trim()
          ? fanName
          : req.user.fullName
      ).slice(0, 60),
      UserId: req.user.id,
      MatchId: match.id
    }, { transaction });

    await PredictedPlayer.bulkCreate(
      ids.map((id) => ({
        PredictionId: prediction.id,
        PlayerId: id
      })),
      { transaction }
    );
  });

  res.json({ ok: true });
}));

app.get("/api/predictions/my", authMw, wrap(async (req, res) => {
  const predictions = await Prediction.findAll({
    where: {
      UserId: req.user.id
    },
    order: [["createdAt", "DESC"]],
    include: [
      Match,
      {
        model: PredictedPlayer,
        as: "players",
        include: [Player]
      }
    ]
  });

  res.json({
    ok: true,
    predictions
  });
}));

// ---------- OFFICIAL LINEUP + DIAMONDS ----------

app.post("/api/admin/matches/:id/official-lineup", adminMw, wrap(async (req, res) => {
  const {
    startingIds,
    subIds,
    homeScore,
    awayScore
  } = req.body;

  const sIds = [...new Set((Array.isArray(startingIds) ? startingIds : []).map(Number))];
  const bIds = [...new Set((Array.isArray(subIds) ? subIds : []).map(Number))];

  if (sIds.length !== 11) {
    fail(400, "need_11");
  }

  await db.transaction(async (transaction) => {
    const match = await Match.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!match) fail(404, "not_found");

    // Eski tarkibni o'chirish
    await OfficialLineup.destroy({ where: { MatchId: match.id }, transaction });

    // Yangi tarkibni yozish
    await OfficialLineup.bulkCreate([
      ...sIds.map(id => ({ MatchId: match.id, PlayerId: id, isStarting: true })),
      ...bIds.map(id => ({ MatchId: match.id, PlayerId: id, isStarting: false }))
    ], { transaction });

    if (!match.scored && new Date() >= new Date(match.predictionDeadline)) {
      const predictions = await Prediction.findAll({
        where: {
          MatchId: match.id
        },
        include: [{
          model: PredictedPlayer,
          as: "players"
        }],
        transaction
      });

      for (const prediction of predictions) {
        let correct = 0;
        for (const player of prediction.players) {
          player.isCorrect = sIds.includes(player.PlayerId);
          if (player.isCorrect) correct++;
          await player.save({ transaction });
        }
        prediction.correctCount = correct;
        await prediction.save({ transaction });

        const [, created] = await DiamondTx.findOrCreate({
          where: {
            referenceKey: `lineup:${match.id}:${prediction.UserId}`
          },
          defaults: {
            UserId: prediction.UserId,
            amount: correct,
            reason: "lineup_correct"
          },
          transaction
        });

        if (created) {
          await User.increment(
            { totalDiamonds: correct, correctPredictions: correct },
            { where: { id: prediction.UserId }, transaction }
          );
        }
      }
      match.scored = true;
    }

    match.homeScore = homeScore ?? match.homeScore;
    match.awayScore = awayScore ?? match.awayScore;
    await match.save({ transaction });
  });

  res.json({ ok: true });
}));

// ---------- ADMIN USERS ----------

app.get("/api/admin/users", adminMw, wrap(async (req, res) => {
  const users = await User.findAll({
    order: [["createdAt", "DESC"]]
  });

  res.json({
    ok: true,
    users: users.map(pub)
  });
}));

// ---------- LEADERBOARD ----------

app.get("/api/leaderboard", wrap(async (req, res) => {
  const users = await User.findAll({
    where: {
      role: "fan"
    },
    order: [
      ["totalDiamonds", "DESC"],
      ["correctPredictions", "DESC"],
      ["createdAt", "ASC"]
    ],
    limit: 100
  });

  res.json({
    ok: true,
    users: users.map(pub)
  });
}));

// ---------- NEWS ----------

app.get("/api/news", wrap(async (req, res) => {
  const news = await News.findAll({
    order: [["createdAt", "DESC"]],
    limit: 20
  });

  res.json({
    ok: true,
    news
  });
}));

app.post("/api/admin/news", adminMw, upload.single("image"), wrap(async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    fail(400, "invalid_input");
  }

  const item = await News.create({
    title,
    body,
    imageUrl: req.file ? "/uploads/" + req.file.filename : null
  });

  res.json({
    ok: true,
    news: item
  });
}));

app.delete("/api/admin/news/:id", adminMw, wrap(async (req, res) => {
  const item = await News.findByPk(req.params.id);

  if (!item) fail(404, "not_found");

  await item.destroy();

  res.json({ ok: true });
}));

// ---------- 404 ----------

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "route_not_found"
  });
});

// ---------- SERVER START + SEED ----------

const squad = [
  ["Otkir Yusupov", 1, "GK"],
  ["Shukron Yoldashev", 16, "GK"],
  ["Giorgi Jgerenaia", 34, "DEF"],
  ["Muhammadqodir Hamraliyev", 55, "DEF"],
  ["Anri Tchitchinadze", 44, "DEF"],
  ["Isoxon Musoxonov", 18, "DEF"],
  ["Saidazamat Mirsaidov", 2, "DEF"],
  ["Umar Adhamzoda", 22, "DEF"],
  ["Dilshod Komilov", 5, "DEF"],
  ["Islom Mamatkazin", 4, "DEF"],
  ["Shoxrux Abduraxmonov", 6, "MID"],
  ["Vanja Ilich", 23, "MID"],
  ["Teidi Benjamin", 13, "MID"],
  ["Alex Fernandes", 97, "MID"],
  ["Diyor Holmatov", 8, "MID"],
  ["Asadbek Rahimjonov", 21, "MID"],
  ["Ruslan Jiyanov", 7, "FWD"],
  ["Husayn Norchayev", 11, "FWD"],
  ["Joel Kojo", 28, "FWD"],
  ["Muhammadali Usmonov", 77, "FWD"],
  ["Giyasov Muhammadali", 17, "FWD"],
  ["Jasur Jaloliddinov", 30, "MID"]
];

const squadPhotoByJersey = {
  1: "/uploads/yusupov.png",
  16: "/uploads/yuldashev.png",
  2: "/uploads/mirsaid.png",
  4: "/uploads/mamatkazin.png",
  5: "/uploads/komliov.png",
  18: "/uploads/musohonov.png",
  22: "/uploads/adxamzoda.png",
  34: "/uploads/giorgi.png",
  44: "/uploads/anri.png",
  55: "/uploads/khamraliyev.png",
  6: "/uploads/abduraxmonov.png",
  8: "/uploads/xolmatov.png",
  13: "/uploads/teidi.png",
  21: "/uploads/rakhimjanov.png",
  23: "/uploads/ilich.png",
  97: "/uploads/fernandes.png",
  7: "/uploads/jiyanov.png",
  11: "/uploads/norchaev.png",
  17: "/uploads/giyosov.png",
  28: "/uploads/kojo.png",
  77: "/uploads/usmonov.png",
  30: "/uploads/jaloliddinov.png",

};

async function startServer() {
  try {
    console.log("⏳ PostgreSQL bazaga ulanilmoqda...");

    await db.authenticate();

    console.log("✅ PostgreSQL bazaga ulandi!");

    await db.sync({ alter: true });

    console.log("✅ Jadvallar tayyor!");

    for (const [fullName, jerseyNumber, position] of squad) {
      const [player, created] = await Player.findOrCreate({
        where: { jerseyNumber },
        defaults: {
          fullName,
          position,
          photoUrl: squadPhotoByJersey[jerseyNumber] || null
        }
      });

      const seededPhotoUrl = squadPhotoByJersey[jerseyNumber];
      const storedPhotoPath = player.photoUrl && player.photoUrl.startsWith("/uploads/")
        ? path.join(uploadsDir, path.basename(player.photoUrl))
        : null;

      if (
        !created &&
        seededPhotoUrl &&
        (
          !player.photoUrl ||
          (storedPhotoPath && !fs.existsSync(storedPhotoPath))
        )
      ) {
        player.photoUrl = seededPhotoUrl;
        await player.save();
      }
    }

    console.log("✅ Futbolchilar tekshirildi!");

    // ---------- ADMIN ----------

    const adminEmail = (
      process.env.ADMIN_EMAIL || "admin@navbahor.uz"
    ).toLowerCase();

    const adminName = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD .env faylida topilmadi!");
    }

    await User.update(
      { role: "fan" },
      {
        where: {
          role: "admin",
          email: {
            [Sequelize.Op.ne]: adminEmail
          }
        }
      }
    );

    let admin = await User.findOne({
      where: { email: adminEmail }
    });

    if (!admin) {
      let username = adminName;
      let i = 0;

      while (await User.findOne({
        where: { username }
      })) {
        username = adminName + "_" + (++i);
      }

      admin = await User.create({
        fullName: "Admin",
        username,
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "admin"
      });

      console.log("✅ Admin yaratildi!");
    } else {
      admin.role = "admin";
      await admin.save();
    }

    console.log(`👑 Admin tayyor: ${adminEmail}`);

    const preferredPort = Number(process.env.PORT) || 5000;
    let port = preferredPort;

    const listen = () => {
      const server = app.listen(port, () => {
        console.log("--------------------------------");
        console.log("⚽ PFCNAVBAHOR_ ISHGA TUSHDI");
        console.log(`🌐 http://localhost:${port}`);
        console.log(`📡 API: http://localhost:${port}/api`);
        console.log("--------------------------------");
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          const nextPort = port + 1;
          console.warn(`⚠️ Port ${port} band; ${nextPort} portga o'tilmoqda...`);
          port = nextPort;
          listen();
          return;
        }

        throw error;
      });
    };

    listen();

  } catch (error) {
    console.error("--------------------------------");
    console.error("❌ SERVER ISHGA TUSHMADI!");
    console.error("Xatolik:", error.message);
    console.error("--------------------------------");

    process.exit(1);
  }
}

startServer();
