const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
   app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
  } catch (error) {
    console.error("Failed to start server: ", error.message);
    process.exit(1);
  }
}

start();
