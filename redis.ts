import { connect } from "https://deno.land/x/redis@v0.37.1/redis.ts";

const hostname = Deno.env.get("REDIS_HOSTNAME");
const port = Deno.env.get("REDIS_PORT");
const password = Deno.env.get("REDIS_PASSWORD");

if (!hostname || !port || !password) throw "Missing Redis credentials";

export const requireRedis = () =>
  connect({
    hostname,
    port,
    password,
  });
