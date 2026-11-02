import "dotenv/config";

import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = Number(process.env.PORT || 5001);

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}...`);
      console.log(`http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

void startServer();