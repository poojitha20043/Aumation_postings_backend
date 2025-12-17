import express from "express";
import * as controller from "../controllers/social.controller.js";
import SocialAccount from "../models/socialAccount.js";
import multer from "multer";


const router = express.Router();
const upload = multer({ dest: "uploads/" }); 

router.post("/publish/facebook", upload.single("image"), controller.publish);
router.get("/facebook", controller.authRedirect);
router.get("/facebook/callback", controller.callback);

// Get pages and metrics
router.get("/pages/:userId", controller.getPages);   // <-- new API
router.get("/metrics/:pageId", controller.metrics);

// GET all connected accounts for user
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const accounts = await SocialAccount.find({ user: userId });

        return res.json({ success: true, accounts });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
});

// DELETE a specific platform (facebook / instagram)
router.post("/:platform/disconnect", controller.disconnectAccount);

router.get("/posts/:userId", controller.getPostedPosts);

// Instagram connect (uses FB login internally)
router.get("/instagram/connect", controller.instagramAuthRedirect);
router.get("/instagram/callback", controller.instagramCallback);

// Instagram publish
router.post("/publish/instagram", upload.single("image"), controller.publishInstagram);

// Instagram metrics
router.get("/instagram/metrics/:userId", controller.instagramMetrics);

export default router;
 