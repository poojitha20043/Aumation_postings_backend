// routes/linkedin.routes.js
import express from "express";
import {
    linkedinAuth,
    linkedinCallback,
    checkLinkedInConnection,
    postToLinkedIn,
    disconnectLinkedIn,
    testLinkedInConnection,
    getLinkedInPosts  // ✅ NEW IMPORT
} from "../controllers/linkedin.controller.js";

const router = express.Router();

// LinkedIn OAuth Routes
router.get("/", linkedinAuth);  // /auth/linkedin?userId=...
router.get("/callback", linkedinCallback);  // /auth/linkedin/callback
router.get("/check", checkLinkedInConnection);  // /auth/linkedin/check?userId=...
router.post("/post", postToLinkedIn);  // /auth/linkedin/post
router.post("/disconnect", disconnectLinkedIn);  // /auth/linkedin/disconnect

// ✅ NEW ROUTE: Get user's LinkedIn posts from database
router.get("/posts", getLinkedInPosts);  // /auth/linkedin/posts?userId=...

// Optional: Test route (for debugging)
router.get("/test", testLinkedInConnection);  // /auth/linkedin/test?userId=...

export default router;