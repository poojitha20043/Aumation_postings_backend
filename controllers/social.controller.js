import dotenv from "dotenv";
dotenv.config();

import SocialAccount from "../models/socialAccount.js";
//import fbApi from "../utils/FbApis.js";
import * as fbApi from "../utils/FbApis.js";
import axios from "axios";
import fs from "fs";
import multer from "multer";
import { publishToPage } from "../utils/FbApis.js";
import PostedPost from "../models/manualPosts.js";
import schedule from "node-schedule";
import AWS from "aws-sdk";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Configure AWS S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadToS3 = async (file) => {
  const fileStream = fs.createReadStream(file.path);
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `instagram_posts/${Date.now()}_${file.originalname}`,
    Body: fileStream,
    ContentType: file.mimetype,
    ACL: "public-read",
  };

  const command = new PutObjectCommand(params);
  await s3.send(command);

  fs.unlinkSync(file.path);
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;
};

const upload = multer({ dest: "uploads/" });

const { FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, FRONTEND_URL } = process.env;

export const authRedirect = (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const scopes = [
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_show_list",
    "public_profile",
    "email"
  ];

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(userId)}` +
    `&scope=${scopes.join(",")}`;

  return res.redirect(url);
};

// 2) Callback: exchange code -> token, list pages, save tokens
export const callback = async (req, res) => {
  try {
    console.log("===== FACEBOOK CALLBACK HIT =====");
    console.log("FULL QUERY:", req.query);
    console.log("Code:", req.query.code);
    console.log("State received:", req.query.state);

    const { code, state } = req.query;
    const userId = decodeURIComponent(state);

    console.log("Decoded userId:", userId);

    if (!code) return res.status(400).send("Missing code");
    if (!userId) return res.status(400).send("Missing userId");

    // ❌ REMOVE ObjectId conversion
    // let userObjectId = mongoose.Types.ObjectId(userId);

    // ✅ Just keep userId as string
    const userObjectId = userId;

    // Exchange code for access token
    const tokenRes = await fbApi.exchangeCodeForToken({
      clientId: FB_APP_ID,
      clientSecret: FB_APP_SECRET,
      redirectUri: FB_REDIRECT_URI,
      code,
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) return res.status(500).send("Failed to get access token");

    // Get user's Facebook pages
    const pages = await fbApi.getUserPages(accessToken);
    if (!pages.data || pages.data.length === 0) {
      console.log("No Facebook pages found for user:", userId);
    }

    // Save each page
    for (const page of pages.data || []) {
      console.log("Saving page:", page.id, "for user:", userId);
      const pictureUrl = await fbApi.getPagePicture(page.id, page.access_token);

      const saved = await SocialAccount.findOneAndUpdate(
        { user: userObjectId, platform: "facebook" },
        {
          user: userObjectId,
          platform: "facebook",
          providerId: page.id,
          accessToken: page.access_token || accessToken,
          scopes: page.perms || [],
          // meta: page
          meta: {
            ...page,
            picture: pictureUrl // store the actual URL
          }
        },
        { upsert: true, new: true }
      );

      console.log("Saved page:", saved);
    }

    return res.redirect(`${FRONTEND_URL}/success`);

  } catch (err) {
    console.error("Callback Error ==>", err.response?.data || err.message);
    return res.status(500).send("Facebook callback error");
  }
};

export const publish = async (req, res) => {
  try {
    const { pageId, message, userId, scheduleTime } = req.body;
    const imageFile = req.file; // multer image

    if (!pageId)
      return res.status(400).json({ msg: "Missing pageId" });

    if (!message && !imageFile)
      return res.status(400).json({ msg: "Message or image required" });

    const acc = await SocialAccount.findOne({
      providerId: pageId,
      platform: "facebook",
    });

    if (!acc)
      return res.status(404).json({ msg: "Page not connected" });

    console.log("PAGE:", pageId);
    console.log("MESSAGE:", message);
    console.log("IMAGE:", imageFile?.originalname || "NO");
    console.log("SCHEDULE:", scheduleTime || "IMMEDIATE");

    const result = await publishToPage({
      pageAccessToken: acc.accessToken,
      pageId,
      message,
      imageFile,
      scheduleTime,
    });

    // 🔹 Save post in DB
    await PostedPost.create({
      user: userId, // frontend nundi pampali
      platform: "facebook",
      pageId,
      pageName: acc.name || "",
      message,
      imageName: imageFile?.originalname || null,
      postId: result?.id || null,
      scheduledTime: scheduleTime || null,
      status: scheduleTime ? "scheduled" : "posted",
    });

    // delete temp image
    if (imageFile) fs.unlinkSync(imageFile.path);

    return res.json({ success: true, result });
  } catch (err) {
    console.error("PUBLISH ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const getPostedPosts = async (req, res) => {
  try {
    const { userId } = req.params;

    const posts = await PostedPost.find({ user: userId })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      posts,
    });
  } catch (err) {
    console.error("GET POSTS ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
};


// 4) Metrics: simple followers count for a page
export const metrics = async (req, res) => {
  try {
    const { pageId } = req.params;

    const acc = await SocialAccount.findOne({
      providerId: pageId,
      platform: "facebook",
    });

    if (!acc) {
      return res.status(404).json({ msg: "Page not connected" });
    }

    const url = `https://graph.facebook.com/v20.0/${pageId}`;
    const params = {
      fields: "name,fan_count,followers_count,engagement",
      access_token: acc.accessToken,
    };

    const response = await axios.get(url, { params });

    return res.json({ success: true, metrics: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const getPages = async (req, res) => {
  try {
    const { userId } = req.params;

    const pages = await SocialAccount.find({
      user: userId,
      platform: "facebook"
    });

    return res.json({ success: true, pages });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch pages" });
  }
};

export const generateAICaption = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ msg: "Prompt is required" });

    const apiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Create a catchy Facebook caption based on this topic: ${prompt}`
          }
        ],
        max_tokens: 60
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const caption = apiRes.data.choices[0].message.content;
    res.json({ text: caption });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ text: "", error: "AI generation failed" });
  }
};

export const disconnectAccount = async (req, res) => {
  try {
    const { platform } = req.params; // facebook / instagram
    const { userId } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({
        success: false,
        msg: "Missing userId or platform",
      });
    }

    // delete connected account(s)
    const result = await SocialAccount.deleteMany({
      user: userId,
      platform,
    });

    if (result.deletedCount === 0) {
      return res.json({
        success: false,
        msg: "No account found to disconnect",
      });
    }

    return res.json({
      success: true,
      msg: `${platform} disconnected successfully`,
    });
  } catch (err) {
    console.error("DISCONNECT ERROR:", err.message);
    return res.status(500).json({
      success: false,
      msg: "Failed to disconnect account",
    });
  }
};

//instagram metrics connection callback 
export const instagramAuthRedirect = (req, res) => {
  console.log("🔥 INSTAGRAM AUTH REDIRECT HIT 🔥");

  const { userId } = req.query;
  console.log("userId:", userId);

  const redirectUri =
    "https://automatedpostingbackend.onrender.com/social/instagram/callback";

  console.log("redirectUri:", redirectUri);

  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement"
  ];

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${process.env.FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(userId)}` +
    `&scope=${scopes.join(",")}`;

  console.log("FB AUTH URL:", url);

  return res.redirect(url);
};

export const instagramCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = decodeURIComponent(state);

    if (!code) return res.status(400).send("Missing code");

    // Exchange code → token
    const tokenRes = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          redirect_uri: "https://automatedpostingbackend.onrender.com/social/instagram/callback",
          code
        }
      }
    );

    const userAccessToken = tokenRes.data.access_token;

    // Get pages
    const pagesRes = await axios.get(
      "https://graph.facebook.com/v20.0/me/accounts",
      { params: { access_token: userAccessToken } }
    );

    for (const page of pagesRes.data.data) {
      // Get IG business account
      const igRes = await axios.get(
        `https://graph.facebook.com/v20.0/${page.id}`,
        {
          params: {
            fields: "instagram_business_account",
            access_token: page.access_token
          }
        }
      );

      const ig = igRes.data.instagram_business_account;
      if (!ig) continue;

      // Get IG profile
      const profile = await axios.get(
        `https://graph.facebook.com/v20.0/${ig.id}`,
        {
          params: {
            fields: "username,profile_picture_url",
            access_token: page.access_token
          }
        }
      );

      await SocialAccount.findOneAndUpdate(
        { user: userId, platform: "instagram" },
        {
          user: userId,
          platform: "instagram",
          providerId: ig.id,
          accessToken: page.access_token,
          meta: {
            username: profile.data.username,
            picture: profile.data.profile_picture_url
          }
        },
        { upsert: true, new: true }
      );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/instagram-dashboard`);
  } catch (err) {
    console.error("IG CALLBACK ERROR:", err.response?.data || err.message);
    return res.status(500).send("Instagram callback failed");
  }
};

export const publishInstagram = async (req, res) => {
  try {
    const { userId, caption, scheduleTime } = req.body;
    const imageFile = req.file;

    if (!imageFile && !caption) {
      return res.status(400).json({ msg: "Image or caption required" });
    }

    const acc = await SocialAccount.findOne({
      user: userId,
      platform: "instagram",
    });

    if (!acc) {
      return res.status(404).json({ msg: "Instagram not connected" });
    }

    // 🔹 Save post in DB first
    const post = await PostedPost.create({
      user: userId,
      platform: "instagram",
      pageId: acc.providerId,
      pageName: acc.meta?.username,
      message: caption,
      imageName: imageFile?.originalname,
      scheduledTime: scheduleTime || null,
      status: scheduleTime ? "scheduled" : "posted",
    });

    let uploadedUrl = null;
    if (imageFile) {
      uploadedUrl = await uploadToS3(imageFile);
    }

    // Function to post to Instagram
    const postToInstagram = async () => {
      const media = await axios.post(
        `https://graph.facebook.com/v24.0/${acc.providerId}/media`,
        {
          image_url: uploadedUrl,
          caption,
          access_token: acc.accessToken,
        }
      );

      const publish = await axios.post(
        `https://graph.facebook.com/v24.0/${acc.providerId}/media_publish`,
        {
          creation_id: media.data.id,
          access_token: acc.accessToken,
        }
      );

      post.postId = publish.data.id;
      post.status = "posted";
      await post.save();
    };

    // 🟢 IMMEDIATE POST
    if (!scheduleTime) {
      await postToInstagram();
      return res.json({ success: true, type: "posted" });
    }

    // 🟡 SCHEDULED POST
    schedule.scheduleJob(new Date(scheduleTime), async () => {
      try {
        await postToInstagram();
      } catch (err) {
        console.error("Scheduled IG post failed:", err);
        post.status = "failed";
        await post.save();
      }
    });

    return res.json({ success: true, type: "scheduled" });
  } catch (err) {
    console.error("IG PUBLISH ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const instagramMetrics = async (req, res) => {
  try {
    const { userId } = req.params;

    const account = await SocialAccount.findOne({
      user: userId,
      platform: "instagram"
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        msg: "Instagram account not connected"
      });
    }

    const igId = account.providerId;

    const metricsRes = await axios.get(
      `https://graph.facebook.com/v20.0/${igId}`,
      {
        params: {
          fields: "followers_count,media_count",
          access_token: account.accessToken
        }
      }
    );

    return res.json({
      account: {
        platform: "instagram",
        meta: account.meta,
        providerId: igId
      },
      metrics: {
        followers: metricsRes.data.followers_count,
        mediaCount: metricsRes.data.media_count
      }
    });
  } catch (err) {
    console.error("IG METRICS ERROR:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
};
