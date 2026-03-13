import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

// Allow requests from the Netlify PWA and localhost for development
const allowedOrigins = [
  "https://croptrac.netlify.app",
  "http://localhost:5000",
  "http://localhost:3000",
  // Add any other Netlify preview URLs if needed
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use(express.json({ limit: "10mb" }));  // Large payloads for full sync
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;