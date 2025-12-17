import express from "express";
import { twitterAuth, twitterCallback } from "../controllers/twitter.controller.js";

const router = express.Router();

// =========================
// TWITTER AUTH ROUTES
// =========================

// LOGIN (Android / Web)
router.get("/twitter/login", twitterAuth);

// CALLBACK
router.get("/twitter/callback", twitterCallback);

export default router;
