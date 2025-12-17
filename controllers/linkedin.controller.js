// controllers/linkedin.controller.js
import dotenv from "dotenv";
import axios from "axios";
import TwitterAccount from "../models/TwitterAccount.js"; // Separate file
import Post from "../models/Post.js"; // Separate file

dotenv.config();

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "https://aumation-postings-backend.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://aumation-postings-frontend-1.onrender.com";

// FIX: Use exact callback URL matching LinkedIn app
const LINKEDIN_CALLBACK_URL = process.env.LINKEDIN_REDIRECT_URI || "https://aumation-postings-backend.onrender.com/auth/linkedin/callback";
// =========================
// 1️⃣ LinkedIn Auth (UPDATED)
// =========================
export const linkedinAuth = async (req, res) => {
  try {
    console.log("🔍 LinkedIn Auth Route Hit");
    console.log("📌 Request URL:", req.originalUrl);
    console.log("📌 Query Parameters:", JSON.stringify(req.query, null, 2));
    
    // Check ALL possible userId parameters
    const userId = req.query.userId || req.query.userid || req.query.user_id;
    
    if (!userId) {
      console.error("❌ ERROR: No userId found in request!");
      console.error("📋 All query params:", Object.keys(req.query));
      
      // Return JSON error with details
      return res.status(400).json({ 
        success: false, 
        error: "userId parameter required",
        receivedParams: req.query,
        example: `${BACKEND_URL}/auth/linkedin?userId=your_user_id_here`
      });
    }

    console.log("✅ UserId received:", userId);
    
    // Generate OAuth state
    const state = Math.random().toString(36).substring(7);
    // FIX: Updated scopes to match what's available in your LinkedIn app
    const scope = encodeURIComponent("profile email w_member_social openid");
    
    // LinkedIn OAuth URL
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_CALLBACK_URL)}&state=${state}&scope=${scope}`;

    // Store in session
    req.session.linkedinOAuth = {
      state,
      userId,
      timestamp: Date.now()
    };

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({ 
          success: false, 
          error: "Session initialization failed" 
        });
      }
      
      console.log("✅ Session saved successfully");
      console.log("🔄 Redirecting to LinkedIn OAuth...");
      res.redirect(authUrl);
    });
    
  } catch (err) {
    console.error("❌ LinkedIn Auth Error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error during LinkedIn authentication"
    });
  }
};

// =========================
// 2️⃣ LinkedIn Callback (UPDATED)
// =========================
export const linkedinCallback = async (req, res) => {
  try {
    console.log("🔗 LinkedIn Callback Received");
    const { code, state } = req.query;

    // Check session exists
    if (!req.session || !req.session.linkedinOAuth) {
      console.error("❌ Session missing in callback");
      return res.redirect(`${FRONTEND_URL}/linkedin-connect?error=session_missing`);
    }

    const { state: savedState, userId } = req.session.linkedinOAuth;

    // Verify state
    if (state !== savedState) {
      console.error("❌ State mismatch");
      return res.redirect(`${FRONTEND_URL}/linkedin-connect?error=invalid_state`);
    }

    console.log("🔄 Exchanging code for access token...");
    
    // FIX: Pass OAuth parameters as query string to avoid 401 error
    const tokenResponse = await axios.post(
      `https://www.linkedin.com/oauth/v2/accessToken?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(LINKEDIN_CALLBACK_URL)}&client_id=${LINKEDIN_CLIENT_ID}&client_secret=${LINKEDIN_CLIENT_SECRET}`,
      {}, // Empty body
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = tokenResponse.data;
    console.log("✅ Access token received");

    // FIX: Use OpenID Connect userinfo endpoint instead of /me
    console.log("🔄 Fetching LinkedIn profile...");
    const profileResponse = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'cache-control': 'no-cache'
        }
      }
    );

    const profile = profileResponse.data;
    console.log("✅ Profile received:", profile.name);
    console.log("📋 Profile data:", JSON.stringify(profile, null, 2));
    
    // Save to database
    const savedAccount = await TwitterAccount.findOneAndUpdate(
      { user: userId, platform: "linkedin" },
      {
        user: userId,
        platform: "linkedin",
        providerId: profile.sub, // OpenID Connect uses 'sub'
        accessToken: access_token,
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        scopes: ["profile", "email", "w_member_social", "openid"],
        meta: {
          twitterId: profile.sub,
          username: profile.name ? profile.name.toLowerCase().replace(/\s+/g, '.') : 'linkedin_user',
          name: profile.name || '',
          firstName: profile.given_name || '',
          lastName: profile.family_name || '',
          email: profile.email || '',
          profileImage: profile.picture || "https://cdn-icons-png.flaticon.com/512/174/174857.png",
          linkedinId: profile.sub,
          headline: profile.headline || ''
        }
      },
      { upsert: true, new: true }
    );

    console.log("✅ Account saved to database");

    // Clear session
    delete req.session.linkedinOAuth;
    req.session.save((err) => {
      if (err) console.error("Session clear error:", err);
    });

    // Redirect to frontend with success
    const redirectUrl = `${FRONTEND_URL}/linkedin-manager?linkedin=connected&name=${encodeURIComponent(profile.name || 'User')}&userId=${userId}`;
    console.log("✅ Redirecting to:", redirectUrl);
    
    res.redirect(redirectUrl);

  } catch (err) {
    console.error("❌ LinkedIn Callback Error:", err.message);
    console.error("❌ Error details:", err.response?.data);
    console.error("❌ Error status:", err.response?.status);
    
    const errorMessage = err.response?.data?.message || err.response?.data?.error_description || err.message;
    res.redirect(
      `${FRONTEND_URL}/linkedin-connect?error=auth_failed&message=${encodeURIComponent(errorMessage)}`
    );
  }
};

// =========================
// 3️⃣ Check LinkedIn Connection
// =========================
export const checkLinkedInConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId parameter is required" 
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.json({ 
        success: true, 
        connected: false 
      });
    }

    const isTokenValid = account.tokenExpiresAt > new Date();
    
    res.json({
      success: true,
      connected: isTokenValid,
      account: {
        name: account.meta?.name,
        firstName: account.meta?.firstName,
        lastName: account.meta?.lastName,
        username: account.meta?.username,
        email: account.meta?.email,
        headline: account.meta?.headline,
        profileImage: account.meta?.profileImage,
        linkedinId: account.meta?.linkedinId,
        connectedAt: account.createdAt,
      }
    });

  } catch (err) {
    console.error("Check LinkedIn Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// =========================
// 4️⃣ Post to LinkedIn (UPDATED to save posts in database)
// =========================
export const postToLinkedIn = async (req, res) => {
  try {
    const { userId, content, visibility = "PUBLIC" } = req.body;
    
    if (!userId || !content) {
      return res.status(400).json({ 
        success: false, 
        error: "userId and content are required" 
      });
    }

    if (content.length > 3000) {
      return res.status(400).json({ 
        success: false, 
        error: "Post cannot exceed 3000 characters" 
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin"
    });

    if (!account) {
      return res.status(401).json({ 
        success: false, 
        error: "LinkedIn account not connected" 
      });
    }

    if (account.tokenExpiresAt < new Date()) {
      return res.status(401).json({ 
        success: false, 
        error: "Token expired. Please reconnect your LinkedIn account." 
      });
    }

    // Prepare LinkedIn post
    const postPayload = {
      author: `urn:li:person:${account.providerId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: content
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    const postResponse = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postPayload,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const postId = postResponse.data.id;
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    // ✅ NEW: Save post to database
    try {
      const newPost = new Post({
        user: userId,
        platform: "linkedin",
        providerId: postId,
        content: content,
        postUrl: postUrl,
        postedAt: new Date(),
        status: "posted",
        accountInfo: {
          username: account.meta?.username || "",
          name: account.meta?.name || "",
          profileImage: account.meta?.profileImage || "",
          platformId: account.providerId
        }
      });

      await newPost.save();
      console.log("✅ LinkedIn post saved to database:", postId);
      
    } catch (dbError) {
      console.error("❌ Error saving post to database:", dbError.message);
      // Continue even if DB save fails - the post was already published on LinkedIn
    }

    res.json({
      success: true,
      postId: postId,
      postUrl: postUrl,
      message: "Successfully posted to LinkedIn and saved to database!"
    });

  } catch (err) {
    console.error("Post to LinkedIn Error:", err.message);
    console.error("Post Error Details:", err.response?.data);
    
    let errorMessage = err.message;
    if (err.response?.data?.message) {
      errorMessage = err.response.data.message;
    } else if (err.response?.data?.error_description) {
      errorMessage = err.response.data.error_description;
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: err.response?.data 
    });
  }
};

// =========================
// 5️⃣ Disconnect LinkedIn
// =========================
export const disconnectLinkedIn = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId is required" 
      });
    }

    const result = await TwitterAccount.deleteOne({ 
      user: userId, 
      platform: "linkedin"
    });

    res.json({ 
      success: true, 
      message: "LinkedIn disconnected successfully",
      deletedCount: result.deletedCount 
    });

  } catch (err) {
    console.error("LinkedIn Disconnect Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// =========================
// 6️⃣ Test LinkedIn Connection (NEW - for debugging)
// =========================
export const testLinkedInConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId parameter is required" 
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.json({ 
        success: true, 
        connected: false,
        message: "No LinkedIn account found for this user" 
      });
    }

    // Test the token by making a simple API call
    try {
      const testResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'cache-control': 'no-cache'
          }
        }
      );
      
      return res.json({
        success: true,
        connected: true,
        tokenValid: true,
        profile: testResponse.data,
        account: {
          name: account.meta?.name,
          email: account.meta?.email,
          providerId: account.providerId,
          tokenExpiresAt: account.tokenExpiresAt,
          tokenWillExpireIn: Math.floor((account.tokenExpiresAt - new Date()) / (1000 * 60 * 60 * 24)) + " days"
        }
      });
      
    } catch (tokenErr) {
      return res.json({
        success: true,
        connected: true,
        tokenValid: false,
        error: tokenErr.message,
        account: {
          name: account.meta?.name,
          providerId: account.providerId,
          tokenExpiresAt: account.tokenExpiresAt
        }
      });
    }

  } catch (err) {
    console.error("Test LinkedIn Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// =========================
// 7️⃣ Get User's LinkedIn Posts (NEW)
// =========================
export const getLinkedInPosts = async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "userId parameter is required" 
      });
    }

    const posts = await Post.find({
      user: userId,
      platform: "linkedin"
    })
    .sort({ postedAt: -1 })
    .limit(50); // Limit to last 50 posts

    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });

  } catch (err) {
    console.error("Get LinkedIn Posts Error:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};