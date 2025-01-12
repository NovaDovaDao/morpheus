import { createLazyClient } from "https://deno.land/x/redis/mod.ts";
import * as uuid from "jsr:@std/uuid";

const hostname = Deno.env.get("REDIS_HOSTNAME");
const port = Deno.env.get("REDIS_PORT");
const password = Deno.env.get("REDIS_PASSWORD");

if (!hostname || !port || !password) throw "Missing Redis credentials";

const redis = createLazyClient({
  hostname,
  port,
  password,
});

export const publishMessage = (userId: string, message: string) => {
  const id = uuid.v1.generate();
  const channel = `chat:message:${id}`;
  return redis.rpush(channel, JSON.stringify({ userId, message }));
};

export const responseSubscription = (userId: string) => {
  const channel = `user:${userId}:responses`;
  return redis.subscribe(channel);
};
