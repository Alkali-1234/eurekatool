import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // self-contained server for the Docker image (see ../Dockerfile)
  output: "standalone",
  turbopack: { root: path.resolve(".") },
}

export default nextConfig
