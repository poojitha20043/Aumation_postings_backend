import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import userRoutes from "./routes/user.routes.js";
import socialRoutes from "./routes/social.routes.js";
import twitterRoutes from "./routes/twitter.routes.js";
import * as facebookController from "./controllers/social.controller.js";
import instagramRoutes from "./routes/instagram.routes.js";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";

import {
  twitterAuth,
  twitterCallback,
  checkTwitterConnection,
  postToTwitter,
  disconnectTwitter,
  getTwitterPosts,
  verifyAndroidSession // ✅ ADDED
  

} from "./controllers/twitter.controller.js";

import {
  linkedinAuth,
  linkedinCallback,
  checkLinkedInConnection,
  postToLinkedIn,
  disconnectLinkedIn,
  getLinkedInPosts
} from "./controllers/linkedin.controller.js";

dotenv.config();
connectDB();

const app = express();
app.set('trust proxy', 1);

// ✅ CORS setup
const allowedOrigins = [
  "http://localhost:3000",
  "https://automatedpostingsfrontend.onrender.com","https://aumation-postings-backend.onrender.com"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS policy error`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/user", userRoutes);

// Database connection
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitterdb")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Mongo Error:", err));

// Session setup
const store = MongoStore.create({
  mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitterdb",
  collectionName: "twitter_sessions",
  ttl: 0,
  autoRemove: "disabled"
});

store.on('error', function(error) {
  console.error('❌ Session Store Error:', error);
});

app.use(
  session({
    name: "twitter_session",
    secret: process.env.SESSION_SECRET || "super-secret-key-change-this",
    resave: true,
    saveUninitialized: true,
    store: store,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
      httpOnly: true,
      secure: true,
      sameSite: "none"
    }
  })
);

// =========================
//  📌 TWITTER ROUTES
// =========================
app.get("/auth/twitter", twitterAuth); // ONLY ONE TIME
app.get("/auth/twitter/callback", twitterCallback);
app.get("/api/twitter/check", checkTwitterConnection);
app.post("/api/twitter/post", postToTwitter);
app.post("/api/twitter/disconnect", disconnectTwitter);
app.get("/api/twitter/posts", getTwitterPosts);
app.get("/api/twitter/verify-session", verifyAndroidSession);

// =========================
//  📌 LINKEDIN ROUTES
// =========================
app.get("/auth/linkedin", linkedinAuth);
app.get("/auth/linkedin/callback", linkedinCallback);
app.get("/api/linkedin/check", checkLinkedInConnection);
app.post("/api/linkedin/post", postToLinkedIn);
app.get("/auth/linkedin/account/:userId", checkLinkedInConnection);
app.post("/api/linkedin/disconnect", disconnectLinkedIn);
app.get("/api/linkedin/posts", getLinkedInPosts);

// =========================
//  📌 HEALTH
// =========================
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// =========================
//  📌 DEBUG ENDPOINTS
// =========================
app.get("/debug/session", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    hasTwitterOAuth: !!req.session.twitterOAuth,
    hasLinkedInOAuth: !!req.session.linkedinOAuth,
    twitterOAuth: req.session.twitterOAuth,
    linkedinOAuth: req.session.linkedinOAuth,
    cookies: req.cookies
  });
});

// Debug: Check database fields
app.get('/debug/twitter/:userId', async (req, res) => {
  try {
    const account = await TwitterAccount.findOne({
      user: req.params.userId,
      platform: "twitter"
    });
    
    if (!account) {
      return res.json({ error: "Account not found" });
    }
    
    res.json({
      success: true,
      loginPlatform: account.loginPlatform,
      androidSessionId: account.androidSessionId,
      hasLoginPlatform: 'loginPlatform' in account._doc,
      hasAndroidSessionId: 'androidSessionId' in account._doc,
      allFields: Object.keys(account._doc)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: Force set platform to android
app.get('/force-android/:userId', async (req, res) => {
  try {
    await TwitterAccount.findOneAndUpdate(
      { user: req.params.userId, platform: "twitter" },
      { 
        loginPlatform: "android",
        androidSessionId: null 
      }
    );
    res.json({ success: true, message: "Forced to android" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// =========================
//  🚀 START SERVER
// =========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Secure cookies: true`);
  console.log(`🔄 Trust proxy: enabled`);
});
