import express from "express";
import * as twitterController from "../controllers/twitter.controller.js";
const router = express.Router();

// ==================== TWITTER ROUTES ====================

// 🔹 These will be accessible at: /auth/twitter?userId=123
router.get("/twitter", twitterController.twitterAuth);

// 🔹 These will be accessible at: /auth/twitter/callback
router.get("/twitter/callback", twitterController.twitterCallback);

// 🔹 These will be accessible at: /api/twitter/check?userId=123
router.get("/twitter/check", twitterController.checkTwitterConnection);

// 🔹 These will be accessible at: /api/twitter/post
router.post("/twitter/post", twitterController.postToTwitter);

// 🔹 These will be accessible at: /api/twitter/disconnect
router.delete("/twitter/disconnect", twitterController.disconnectTwitter);

// 🔹 These will be accessible at: /api/twitter/posts?userId=123
router.get("/twitter/posts", twitterController.getTwitterPosts);

// ✅ NEW: Android session verification
router.get("/twitter/verify-session", twitterController.verifyAndroidSession);

export default router;