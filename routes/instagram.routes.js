import express from "express";
import {
  redirectToLogin,
  handleCallback,
  postToInstagram
} from "../controllers/instagram.controller.js";
import SocialAccount from "../models/socialAccount.js";

const router = express.Router();

router.get("/connect", redirectToLogin);
router.get("/callback", handleCallback);
router.post("/disconnect", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    await SocialAccount.deleteOne({ user: userId, platform: "instagram" });
    return res.json({ success: true });
  } catch (err) {
    console.error("IG Disconnect error:", err);
    return res.status(500).json({ error: "Failed to disconnect account" });
  }
});
router.post("/post", postToInstagram);

export default router;
