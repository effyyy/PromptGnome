const config = {
  build: {
    // Ensure proper module resolution for Zod
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development")
    }
  }
}

export default config
