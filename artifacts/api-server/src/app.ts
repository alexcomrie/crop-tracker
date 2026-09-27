import express, { type Express, type Request, type Response, type NextFunction } from "express";
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

// Netlify deploy previews look like https://<id>--croptrac.netlify.app
const netlifyPreviewPattern = /^https:\/\/[a-z0-9-]+--croptrac\.netlify\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || netlifyPreviewPattern.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use(express.json({ limit: "10mb" }));  // Large payloads for full sync

app.use("/api", router);

// JSON 404 for unknown API routes
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// JSON error envelope (covers CORS rejections, malformed JSON bodies, etc.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({ success: false, error: err?.message || "Internal server error" });
});

export default app;
