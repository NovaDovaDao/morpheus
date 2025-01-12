import { Connection, PublicKey } from "@solana/web3.js";
import { BigDenary } from "https://deno.land/x/bigdenary/mod.ts";

// Configure constants
const DOVA_TOKEN_ADDRESS = Deno.env.get("DOVA_TOKEN_ADDRESS");
const TOKEN_BALANCE_CACHE_TTL = 30000; // 30 seconds cache TTL
export const MINIMUM_TOKEN_BALANCE = new BigDenary("100000");

// Cache structure for token balances
interface TokenBalanceCache {
  balance: string;
  timestamp: number;
}
const tokenBalanceCache = new Map<string, TokenBalanceCache>();

// Initialize Solana connection
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// Function to get token balance with caching
export async function getTokenBalance(walletAddress: string): Promise<string> {
  try {
    // Check cache first
    const cached = tokenBalanceCache.get(walletAddress);
    const now = Date.now();
    if (cached && now - cached.timestamp < TOKEN_BALANCE_CACHE_TTL) {
      return cached.balance;
    }

    // Query token accounts
    const walletPublicKey = new PublicKey(walletAddress);

    if (!DOVA_TOKEN_ADDRESS) throw "Missing contract address";
    const tokenPublicKey = new PublicKey(DOVA_TOKEN_ADDRESS);

    const accounts = await connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { mint: tokenPublicKey }
    );

    // Calculate total balance across all accounts
    let totalBalance = new BigDenary(0);
    for (const account of accounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      totalBalance = totalBalance.add(parsedInfo.tokenAmount.amount);
    }

    // Update cache
    tokenBalanceCache.set(walletAddress, {
      balance: totalBalance.toString(),
      timestamp: now,
    });

    console.log(totalBalance);

    return totalBalance.toString();
  } catch (error) {
    console.error("Error getting token balance:", error);
    throw new Error("Failed to verify token balance");
  }
}

export const hasEnoughTokens = (balance: string) =>
  MINIMUM_TOKEN_BALANCE.lessThan(balance);
