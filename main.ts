import "jsr:@std/dotenv/load";
import * as log from "https://deno.land/std@0.166.0/log/mod.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.1/mod.ts";
import { PrivyClient } from "@privy-io/server-auth";

log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG"),
  },
  loggers: {
    "socket.io": {
      level: "DEBUG",
      handlers: ["console"],
    },
    "engine.io": {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

const port = parseInt(Deno.env.get("PORT")!);

const io = new Server({
  cors: {
    origin: ["http://localhost:5173"],
    credentials: true,
  },
});

const privy = new PrivyClient(
  Deno.env.get("PRIVY_APP_ID")!,
  Deno.env.get("PRIVY_APP_SECRET")!
);

// @ts-ignore FIXME: middleware typing
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token || typeof token !== "string") throw "Missing auth token";

    await privy.verifyAuthToken(token);
    return true;
  } catch (error) {
    console.log(`Token verification failed with error. ${error}.`);
    return next(null, false);
  }
});

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`);
  socket.emit("response", "👋🏽 hi, i'm dova");

  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`);
  });

  socket.on("input", (input) => {
    console.log(`socket ${socket.id} says: ${input}`);

    socket.emit("response", "sounds good...");
  });
});

Deno.serve({
  handler: io.handler(),
  port,
});
