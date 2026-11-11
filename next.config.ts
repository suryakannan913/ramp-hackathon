import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["mailparser", "@prisma/client", "pdf-parse"],
};
export default config;
