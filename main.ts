// main.ts
import "jsr:@std/dotenv/load";
import * as log from "https://deno.land/std@0.166.0/log/mod.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.1/mod.ts";
import { PrivyClient } from "@privy-io/server-auth";
import {
  getTokenBalance,
  hasEnoughTokens,
  MINIMUM_TOKEN_BALANCE,
} from "./solana.ts";
import { requireRedis } from "./redis.ts";

// Configure logging
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

// Validate environment variables
const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID");
const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET");
if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error(
    "Missing required environment variables: PRIVY_APP_ID and PRIVY_APP_SECRET must be set"
  );
  Deno.exit(1);
}
const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
const subClient = await requireRedis();

interface ClientToServerEvents {
  input: (message: string) => void;
}

interface ServerToClientEvents {
  ack: (code: number) => void;
  response: (message: string) => void;
  balance: (value?: string) => void;
}

// deno-lint-ignore no-empty-interface
interface InterServerEvents {}

interface SocketData {
  userId: string;
  walletAddress: string;
  tokenBalance: string;
}

const origin = Deno.env.get("ORIGIN")?.split(",") ?? [];
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>({
  cors: {
    origin,
    credentials: true,
  },
});

const REST_API_URL = Deno.env.get("REST_API_URL");
if (!REST_API_URL) throw "Missing REST_API_URL env var";

// @ts-ignore Enhanced middleware for both Privy and token validation
io.use(async (socket) => {
  try {
    // 1. Verify Privy token
    const token = socket.handshake.auth.token;

    if (!token || typeof token !== "string") {
      throw new Error("Missing auth token");
    }

    const decoded = await privy.verifyAuthToken(token);
    const user = await privy.getUserById(decoded.userId);
    const walletAddress = user.wallet?.address;
    // const walletClient = user.wallet?.walletClientType;

    if (!walletAddress || typeof walletAddress !== "string") {
      throw new Error("Missing wallet address");
    }

    // 2. Verify token balance
    const balance = await getTokenBalance(walletAddress);
    if (!hasEnoughTokens(balance)) {
      throw new Error(
        `Insufficient DOVA token balance. Minimum required: ${MINIMUM_TOKEN_BALANCE.toFixed(
          2
        )} tokens`
      );
    }

    // Store wallet address in socket data for future use
    socket.data.userId = decoded.userId;
    socket.data.walletAddress = walletAddress;
    socket.data.tokenBalance = balance;

    return true;
  } catch (error) {
    console.log(`Authentication failed: ${error}`);
    throw "Authentication failed";
  }
});

const subscriptions = new Map<string, Set<string>>();

// Connection handler
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  if (socket.data.userId && !subscriptions.has(socket.data.userId)) {
    subscriptions.set(socket.data.userId, new Set());
  }
  subscriptions.get(socket.data.userId!)?.add(socket.id);

  console.log(`Wallet address: ${socket.data.walletAddress}`);
  socket.emit("balance", socket.data.tokenBalance);

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    if (socket.data.userId && subscriptions.has(socket.data.userId)) {
      subscriptions.get(socket.data.userId!)?.delete(socket.id);
      if (subscriptions.get(socket.data.userId!)?.size === 0)
        subscriptions.delete(socket.data.userId);
    }
  });

  // Handle input messages
  socket.on("input", async (input: string) => {
    console.log(`Received message from ${socket.id}: ${input}`);
    if (socket.data.userId) {
      const response = await fetch(new URL("/process-message", REST_API_URL), {
        method: "POST",
        body: JSON.stringify({
          userId: socket.data.userId,
          content: input,
          sender: "user",
        }),
        headers: {
          "x-ghost-token": Deno.env.get("GHOST_TOKEN"),
        },
      });
      socket.emit("ack", response.status);
      return;
    }

    socket.emit("ack", 403);
  });
});

// Subscribe to Redis channel to receive worker updates
const channel = "chat_response";
const sub = await subClient.subscribe(channel);
(async () => {
  for await (const data of sub.receive()) {
    const { userId, messageId } = JSON.parse(data.message);
    if (subscriptions.has(userId)) {
      for (const socketId of subscriptions.get(userId)!) {
        io.to(socketId).emit("response", messageId);
      }
    }
  }
})();

const port = parseInt(Deno.env.get("PORT")!);
console.log(`Starting server on port ${port}...`);

Deno.serve({
  port,
  handler: io.handler(),
  onListen: ({ port, hostname }) => {
    console.log(`Server running on http://${hostname}:${port}`);
  },
});
