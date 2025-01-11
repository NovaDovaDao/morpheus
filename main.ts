// main.ts
import "jsr:@std/dotenv/load";
import * as log from "https://deno.land/std@0.166.0/log/mod.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.1/mod.ts";
import { PrivyClient } from "@privy-io/server-auth";
import { getTokenBalance } from "./solana.ts";

const MINIMUM_TOKEN_BALANCE = 100000n * BigInt(1e9); // 100,000 tokens with 9 decimals

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

// Environment variable validation
const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port++) {
    try {
      const listener = await Deno.listen({ port });
      listener.close();
      return port;
    } catch (err) {
      if (!(err instanceof Deno.errors.AddrInUse)) {
        throw err;
      }
      console.log(`Port ${port} is in use, trying next port...`);
    }
  }
  throw new Error(
    `No available ports found between ${startPort} and ${
      startPort + MAX_PORT_ATTEMPTS
    }`
  );
}

// Validate environment variables
const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID");
const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET");

async function startServer() {
  try {
    const requestedPort = Number(Deno.env.get("PORT")) || DEFAULT_PORT;
    const port = await findAvailablePort(requestedPort);

    const io = new Server({
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:3000",
          "https://test.novadova.com",
          "https://ai.novadova.com",
          "https://novadova.com",
        ],
        credentials: true,
      },
    });

    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      console.error(
        "Missing required environment variables: PRIVY_APP_ID and PRIVY_APP_SECRET must be set"
      );
      Deno.exit(1);
    }
    const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

    // @ts-ignore Enhanced middleware for both Privy and token validation
    io.use(async (socket, next) => {
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
        if (balance < MINIMUM_TOKEN_BALANCE) {
          throw new Error(
            `Insufficient DOVA token balance. Minimum required: ${
              MINIMUM_TOKEN_BALANCE / BigInt(1e9)
            } tokens`
          );
        }

        // Store wallet address in socket data for future use
        socket.data.walletAddress = walletAddress;
        socket.data.tokenBalance = balance;

        return next();
      } catch (error) {
        console.log(`Authentication failed: ${error}`);
        return next(new Error(`Authentication failed: ${error}`));
      }
    });

    // Connection handler
    io.on("connection", (socket) => {
      console.log(`Client connected: ${socket.id}`);
      // console.log(`Wallet address: ${address}`);
      // console.log(`Token balance: ${socket.data.tokenBalance}`);

      // Welcome message with token balance
      socket.emit(
        "response",
        `👋 Connected to Nova Dova AI - Balance: ${
          // socket.data.tokenBalance / BigInt(1e9)
        } DOVA`
      );

      // Handle disconnect
      socket.on("disconnect", (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
      });

      // Handle input messages
      socket.on("input", (input: string) => {
        console.log(`Received message from ${socket.id}: ${input}`);
        socket.emit("response", `Received: ${input}`);
      });
    });

    console.log(`Starting server on port ${port}...`);

    Deno.serve({
      port,
      handler: io.handler(),
      onListen: ({ port, hostname }) => {
        console.log(`Server running on http://${hostname}:${port}`);
      },
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    Deno.exit(1);
  }
}

await startServer();
