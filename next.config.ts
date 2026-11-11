import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['mailparser', '@prisma/client'] };
export default config;
