import dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import TwitterAccount from "../models/TwitterAccount.js";
import Post from "../models/Post.js";

dotenv.config();

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const BACKEND_URL = "https://automatedpostingbackend.onrender.com";
const FRONTEND_URL = "https://automatedpostingsfrontend.onrender.com";
const TWITTER_CALLBACK_URL = `${BACKEND_URL}/auth/twitter/callback`;

const twitterClient = new TwitterApi({
  clientId: TWITTER_CLIENT_ID,
  clientSecret: TWITTER_CLIENT_SECRET,
});

// =========================
// 1️⃣ TWITTER AUTH (ANDROID & WEB)
// =========================
export const twitterAuth = async (req, res) => {
  try {
    const { userId, platform } = req.query;
    if (!userId) return res.status(400).send("userId required");

    console.log(`🔥 RAW PARAMS: platform=${platform}, userId=${userId}`);

    // 🔥🔥🔥 TEMPORARY FIX: FORCE ANDROID
    let loginPlatform = "android"; // ALWAYS ANDROID
    
    console.log(`📱 FINAL Platform: ${loginPlatform} (FORCED)`);

    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      TWITTER_CALLBACK_URL,
      { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"] }
    );

    // Save with FORCED android
    await TwitterAccount.findOneAndUpdate(
      { user: userId, platform: "twitter" },
      {
        user: userId,
        platform: "twitter",
        oauthState: state,
        oauthCodeVerifier: codeVerifier,
        oauthCreatedAt: new Date(),
        loginPlatform: loginPlatform,  // 🔥 "android"
        androidSessionId: null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ OAuth saved: ${loginPlatform} flow`);
    console.log(`📝 State: ${state.substring(0, 10)}...`);
    
    res.redirect(url);

  } catch (err) {
    console.error("❌ Auth Error:", err);
    res.status(500).send(err.message);
  }
};

// =========================
// 2️⃣ TWITTER CALLBACK (ANDROID & WEB)
// =========================
export const twitterCallback = async (req, res) => {
  console.log("🚨 Twitter Callback Triggered");
  
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code or state");

    // Find account
    const account = await TwitterAccount.findOne({ 
      oauthState: state, 
      platform: "twitter" 
    });
    
    if (!account) {
      console.error("❌ Session expired - No account found");
      return sendErrorResponse(res, "Session expired", "web");
    }

    console.log(`✅ Account Found: ${account.user}, Platform: ${account.loginPlatform}`);

    const { oauthCodeVerifier, user: userId, loginPlatform } = account;

    // Get access token
    const { accessToken, refreshToken } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier: oauthCodeVerifier,
      redirectUri: TWITTER_CALLBACK_URL
    });

    const userClient = new TwitterApi(accessToken);
    const user = await userClient.v2.me();

    console.log(`✅ Twitter User: @${user.data.username}`);

    // Prepare update data
    const updateData = {
      providerId: user.data.id,
      accessToken,
      refreshToken,
      scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
      meta: {
        twitterId: user.data.id,
        username: user.data.username,
        name: user.data.name
      },
      oauthState: null,
      oauthCodeVerifier: null,
      oauthCreatedAt: null,
      updatedAt: new Date()
    };

    // 🎯 ANDROID: Create Session ID
    let sessionId = null;
    if (loginPlatform === "android") {
      sessionId = `tw_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      updateData.androidSessionId = sessionId;
      console.log(`📱📱 ANDROID SESSION CREATED: ${sessionId}`);
    }

    // Save to database
    await TwitterAccount.findByIdAndUpdate(account._id, updateData);

    // 🎯 Redirect based on platform
    return handleRedirect(res, loginPlatform, user.data, userId, sessionId, accessToken);

  } catch (err) {
    console.error("❌ Callback Error:", err);
    const account = await TwitterAccount.findOne({ oauthState: req.query.state });
    const platform = account?.loginPlatform || "web";
    return sendErrorResponse(res, err.message, platform);
  }
};

// =========================
// 3️⃣ REDIRECT HANDLER
// =========================
const handleRedirect = (res, platform, userData, userId, sessionId, accessToken) => {
  console.log(`🔄 Redirecting: ${platform.toUpperCase()} flow`);
  
  // 🎯 ANDROID: Send Deep Link
  if (platform === "android" && sessionId) {
    const deepLink = 
      `aimediahub://twitter-callback` +
      `?session_id=${sessionId}` +
      `&status=success` +
      `&username=${encodeURIComponent(userData.username)}` +
      `&twitter_id=${userData.id}` +
      `&user_id=${userId}` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    
    console.log(`🔗 Android Deep Link Created`);
    
    // HTML page with auto-redirect (works in browser too)
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Connected</title>
        <script>
          // Try to redirect to app
          setTimeout(function() {
            window.location.href = "${deepLink}";
          }, 100);
          
          // Fallback after 3 seconds
          setTimeout(function() {
            window.location.href = "https://automatedpostingsfrontend.onrender.com/twitter-manager?twitter=connected&username=${encodeURIComponent(userData.username)}";
          }, 3000);
        </script>
      </head>
      <body style="padding: 20px; font-family: Arial;">
        <h2>✅ Twitter Connected Successfully!</h2>
        <p>Connected to: @${userData.username}</p>
        <p>Redirecting to Android app...</p>
        <p><small>If not redirected, <a href="${deepLink}">click here</a></small></p>
      </body>
      </html>
    `);
  }
  
  // 🎯 WEB: Normal Redirect
  const webRedirect = 
    `https://automatedpostingsfrontend.onrender.com/twitter-manager` +
    `?twitter=connected` +
    `&username=${encodeURIComponent(userData.username)}` +
    `&user_id=${userId}`;
  
  console.log(`🌐 Web Redirect: ${webRedirect}`);
  return res.redirect(webRedirect);
};

// =========================
// 4️⃣ ERROR HANDLER
// =========================
const sendErrorResponse = (res, error, platform) => {
  console.log(`❌ ${platform.toUpperCase()} Error: ${error}`);
  
  if (platform === "android") {
    const errorLink = `aimediahub://twitter-callback?status=error&error=${encodeURIComponent(error)}`;
    return res.send(`
      <!DOCTYPE html>
      <html>
      <body>
        <script>
          window.location.href = "${errorLink}";
        </script>
      </body>
      </html>
    `);
  }
  
  // Web error
  const webError = `https://automatedpostingsfrontend.onrender.com/twitter-connect?error=${encodeURIComponent(error)}`;
  return res.redirect(webError);
};

// =========================
// 5️⃣ VERIFY ANDROID SESSION
// =========================
export const verifyAndroidSession = async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ 
      success: false, 
      error: "session_id required" 
    });

    console.log(`🔍 Verifying Session: ${session_id}`);

    // Find account with this session ID
    const account = await TwitterAccount.findOne({ 
      androidSessionId: session_id, 
      platform: "twitter" 
    });
    
    if (!account) {
      console.error(`❌ Session not found: ${session_id}`);
      return res.status(404).json({ 
        success: false, 
        error: "Session expired or invalid",
        code: "SESSION_EXPIRED"
      });
    }

    console.log(`✅ Session Verified: ${account.user} (@${account.meta?.username})`);

    // Clear session ID after verification
    await TwitterAccount.findByIdAndUpdate(account._id, { 
      androidSessionId: null 
    });

    res.json({
      success: true,
      account: {
        userId: account.user,
        twitterId: account.meta?.twitterId,
        username: account.meta?.username,
        name: account.meta?.name,
        connectedAt: account.createdAt,
        accessToken: account.accessToken
      }
    });

  } catch (err) {
    console.error("❌ Verify Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// =========================
// 6️⃣ CHECK CONNECTION
// =========================
export const checkTwitterConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ 
      success: false, 
      error: "userId required" 
    });

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter",
    });
    
    if (!account) {
      return res.json({ 
        success: true, 
        connected: false 
      });
    }

    res.json({
      success: true,
      connected: true,
      account: {
        username: account.meta?.username,
        name: account.meta?.name,
        connectedAt: account.createdAt,
      }
    });

  } catch (err) {
    console.error("Check Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// =========================
// 7️⃣ POST TWEET
// =========================
export const postToTwitter = async (req, res) => {
  try {
    const { userId, content } = req.body;
    if (!userId || !content) {
      return res.status(400).json({ 
        success: false, 
        error: "userId and content required" 
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter"
    });

    if (!account) {
      return res.status(401).json({ 
        success: false, 
        error: "Twitter not connected" 
      });
    }

    const client = new TwitterApi(account.accessToken);
    const tweet = await client.v2.tweet(content);
    const tweetId = tweet.data.id;
    const tweetUrl = `https://twitter.com/${account.meta?.username}/status/${tweetId}`;
    
    // Save to posts database
    try {
      const newPost = new Post({
        user: account.user,
        platform: "twitter",
        providerId: tweetId,
        content: content,
        postUrl: tweetUrl,
        postedAt: new Date(),
        status: "posted",
        accountInfo: {
          username: account.meta?.username,
          name: account.meta?.name,
          platformId: account.providerId
        }
      });
      await newPost.save();
      console.log("✅ Tweet saved to DB");
    } catch (dbError) {
      console.error("DB Save Error:", dbError.message);
    }

    res.json({
      success: true,
      tweetId: tweetId,
      tweetUrl: tweetUrl,
      message: "Tweet posted!"
    });

  } catch (err) {
    console.error("Post Error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to post"
    });
  }
};

// =========================
// 8️⃣ DISCONNECT
// =========================
export const disconnectTwitter = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId required" 
      });
    }

    const result = await TwitterAccount.deleteOne({
      user: userId,
      platform: "twitter"
    });

    res.json({
      success: true,
      message: "Twitter disconnected",
      deletedCount: result.deletedCount
    });

  } catch (err) {
    console.error("Disconnect Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =========================
// 9️⃣ GET POSTS
// =========================
export const getTwitterPosts = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId required" 
      });
    }

    const posts = await Post.find({
      user: userId,
      platform: "twitter"
    })
    .sort({ postedAt: -1 })
    .limit(20);

    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });

  } catch (err) {
    console.error("Get Posts Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};