import "dotenv/config";
import app from "./app";

const rawPort = process.env["PORT"] ?? "5001";

if (!process.env["PORT"]) {
  console.warn("PORT environment variable not provided, defaulting to 5001.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
