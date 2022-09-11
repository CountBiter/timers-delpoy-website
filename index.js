require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const cookie = require("cookie");
const nunjucks = require("nunjucks");
const crypto = require("crypto");
const { nanoid } = require("nanoid");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);

const wss = new WebSocket.Server({ clientTracking: false, noServer: true });

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
});

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  tags: {
    blockStart: "[%",
    blockEnd: "%]",
    variableStart: "[[",
    variableEnd: "]]",
    commentStart: "[#",
    commentEnd: "#]",
  },
});

const hash = (d) => {
  return crypto.createHash("sha256").update(d).digest("hex");
};

const createWebSocket = () => {
  server.on("upgrade", async (req, socket, head) => {
    const cookies = cookie.parse(req.headers["cookie"]);
    const user = await knex.table("users").where({ token: cookies.token }).first();
    const userId = user.id;

    if (!userId) {
      socket.destroy();
      return;
    }

    req.userId = userId;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws, req) => {
    const { userId } = req;

    clients.set(userId, ws);

    if (!userId) {
      ws.on("close", () => {
        clients.delete(userId);
      });
    }

    const timers = await knex.table("timers").where({ user_timer_id: userId });
    const allTimers = { type: "all_timers", all_timers: timers };

    ws.send(JSON.stringify(allTimers));
  });
};

// Login/Singup

const findUserByUsername = async (username) =>
  await knex
    .table("users")
    .where({ username })
    .first()
    .then((data) => data);

const clients = new Map();

const auth = () => async (req, res, next) => {
  if (!req.headers["cookie"]) {
    return next();
  }
  const cookies = cookie.parse(req.headers["cookie"]);
  const user = await knex.table("users").where({ token: cookies.token }).first();
  req.user = user;
  next();
};

app.get("/", auth(), (req, res) => {
  res.render("index", {
    user: req.user,
    authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
  });
});

app.set("view engine", "njk");

app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const userToken = nanoid();
  await knex.table("users").where({ username: username }).update({
    token: userToken,
  });
  const user = await findUserByUsername(username);
  if (!user || user.password !== hash(password)) {
    return res.redirect("/?authError=true");
  }

  res.cookie("token", userToken).redirect("/");
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  await knex.table("users").where({ token: req.user.token }).update({ token: null });
  res.clearCookie("token").redirect("/");
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  const nameTaken = await knex("users").where({ username: username }).first();

  if (!username && !password) {
    return res.redirect(`/?authError=You didn't provide a username or password`);
  } else if (!nameTaken) {
    console.log("Welcome new User");
  } else if (username === nameTaken.username) {
    return res.redirect(`/?authError=This name is already taken`);
  }

  const userToken = nanoid();

  await knex("users").insert({
    username: username,
    password: hash(password),
    token: userToken,
    id: nanoid(),
  });

  res.cookie("token", userToken).redirect("/");
});

createWebSocket();

// Timers

app.get("/api/timers", auth(), async (req, res) => {
  if (req.user) {
    wss.on("connection", async (ws, req) => {
      const { userId } = req;

      clients.set(userId, ws);

      setInterval(async () => {
        const timers = await knex.table("timers").where({ user_timer_id: userId, isActive: true });
        let activeTimers = { type: "active_timers", active_timers: timers };

        activeTimers.active_timers.map((timer) => {
          timer.progress = Date.now() - timer.start;
        });
        ws.send(JSON.stringify(activeTimers));
      }, 1000);
    });
  }

  res.send("AGA");
});

app.post("/api/timers", auth(), async (req, res) => {
  if (req.user) {
    const timer = await knex("timers").select();
    await knex("timers").insert({
      description: req.body.description,
      isActive: true,
      id: nanoid(),
      start: Date.now(),
      user_timer_id: req.user.id,
    });

    wss.on("connection", async (ws, req) => {
      const { userId } = req;

      clients.set(userId, ws);

      for (let userId of clients.keys()) {
        const timers = await knex.table("timers").where({ user_timer_id: userId });
        const allTimers = { type: "all_timers", all_timers: timers };

        allTimers.all_timers.map((timer) => {
          timer.progress = Date.now() - timer.start;
        });

        ws.send(JSON.stringify(allTimers));
      }
    });
    return res.json(timer);
  }

  res.send("AGA");
});

app.post("/api/timers/:id/stop", auth(), async (req, res) => {
  if (req.user) {
    console.log(req.user);
    const _id = req.params.id;
    const stopTimer = await knex("timers")
      .select()
      .where({
        id: _id,
      })
      .update({
        isActive: false,
        duration: knex.raw(`${Date.now()} - start`),
      });

    await knex("timers")
      .where({
        id: _id,
      })
      .update({
        end: knex.raw("start + duration"),
      });

    wss.on("connection", async (ws, req) => {
      const { userId } = req;

      clients.set(userId, ws);

      const timers = await knex.table("timers").where({ user_timer_id: userId });
      const allTimers = { type: "all_timers", all_timers: timers };

      allTimers.all_timers.map((timer) => {
        timer.progress = Date.now() - timer.start;
      });

      ws.send(JSON.stringify(allTimers));
    });

    return res.json(stopTimer);
  }

  res.send("AGA");
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});
