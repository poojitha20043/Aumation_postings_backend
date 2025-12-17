import express from "express";
import * as twitterController from "../controllers/twitter.controller.js";
const router = express.Router();

// ==================== TWITTER ROUTES ====================
router.get("/auth/twitter/login", twitterController.twitterAuth); // ✅ NEW
router.get("/twitter", twitterController.twitterAuth);
router.get("/twitter/callback", twitterController.twitterCallback);
router.get("/twitter/check", twitterController.checkTwitterConnection);
router.post("/twitter/post", twitterController.postToTwitter);
router.delete("/twitter/disconnect", twitterController.disconnectTwitter);
router.get("/twitter/posts", twitterController.getTwitterPosts);
router.get("/twitter/verify-session", twitterController.verifyAndroidSession);

// ✅ Android Login Page (Simple redirect)
router.get("/twitter/login-page", twitterController.androidLoginPage);

// ❌ REMOVE OR COMMENT THIS LINE - Function doesn't exist:
// router.get("/twitter/android-callback", twitterController.androidCallbackHandler);

export default router;