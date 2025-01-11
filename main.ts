// main.ts
import "jsr:@std/dotenv/load";
import * as log from "https://deno.land/std@0.166.0/log/mod.ts";
import { Server } from "https://deno.land/x/socket_io@0.2.1/mod.ts";
import { PrivyClient } from "@privy-io/server-auth";
import { Connection, PublicKey } from "@solana/web3.js";
// import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Configure constants
const DOVA_TOKEN_ADDRESS = "8HjiRvPNwFT9jpzAAsYF4rE9y576CKdTkQZXaxibpump";
const MINIMUM_TOKEN_BALANCE = 100000n * BigInt(1e9); // 100,000 tokens with 9 decimals
const TOKEN_BALANCE_CACHE_TTL = 30000; // 30 seconds cache TTL

// Cache structure for token balances
interface TokenBalanceCache {
  balance: bigint;
  timestamp: number;
}
const tokenBalanceCache = new Map<string, TokenBalanceCache>();

// Initialize Solana connection
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// Function to get token balance with caching
async function getTokenBalance(walletAddress: string): Promise<bigint> {
  try {
    // Check cache first
    const cached = tokenBalanceCache.get(walletAddress);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < TOKEN_BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    // Query token accounts
    const walletPublicKey = new PublicKey(walletAddress);
    const tokenPublicKey = new PublicKey(DOVA_TOKEN_ADDRESS);

    const accounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: tokenPublicKey },
    );

    // Calculate total balance across all accounts
    let totalBalance = 0n;
    for (const account of accounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      totalBalance += BigInt(parsedInfo.tokenAmount.amount);
    }

    // Update cache
    tokenBalanceCache.set(walletAddress, {
      balance: totalBalance,
      timestamp: now,
    });

    return totalBalance;
  } catch (error) {
    console.error("Error getting token balance:", error);
    throw new Error("Failed to verify token balance");
  }
}

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
      await listener.close();
      return port;
    } catch (err) {
      if (!(err instanceof Deno.errors.AddrInUse)) {
        throw err;
      }
      console.log(`Port ${port} is in use, trying next port...`);
    }
  }
  throw new Error(`No available ports found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS}`);
}

// Validate environment variables
const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID");
const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET");

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error("Missing required environment variables: PRIVY_APP_ID and PRIVY_APP_SECRET must be set");
  Deno.exit(1);
}

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
          "https://novadova.com"
        ],
        credentials: true,
      },
    });

    const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

    // Enhanced middleware for both Privy and token validation
    io.use(async (socket, next) => {
      try {
        // 1. Verify Privy token
        const token = socket.handshake.auth.token;
        const walletAddress = socket.handshake.auth.walletAddress;

        if (!token || typeof token !== "string") {
          throw new Error("Missing auth token");
        }

        if (!walletAddress || typeof walletAddress !== "string") {
          throw new Error("Missing wallet address");
        }

        await privy.verifyAuthToken(token);

        // 2. Verify token balance
        const balance = await getTokenBalance(walletAddress);
        if (balance < MINIMUM_TOKEN_BALANCE) {
          throw new Error(`Insufficient DOVA token balance. Minimum required: ${MINIMUM_TOKEN_BALANCE / BigInt(1e9)} tokens`);
        }

        // Store wallet address in socket data for future use
        socket.data.walletAddress = walletAddress;
        socket.data.tokenBalance = balance;

        return next();
      } catch (error) {
        console.log(`Authentication failed: ${error}`);
        return next(new Error(`Authentication failed: ${error.message}`));
      }
    });

    // Connection handler
    io.on("connection", (socket) => {
      console.log(`Client connected: ${socket.id}`);
      console.log(`Wallet address: ${socket.data.walletAddress}`);
      console.log(`Token balance: ${socket.data.tokenBalance}`);
      
      // Welcome message with token balance
      socket.emit("response", `👋 Connected to Nova Dova AI - Balance: ${socket.data.tokenBalance / BigInt(1e9)} DOVA`);

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
    
    await Deno.serve({
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