// controllers/instagram.controller.js
import axios from "axios";
import SocialAccount from "../models/socialAccount.js";
import { getLongLivedToken } from "../utils/instagramApi.js";

/**
 * Redirect user to FB OAuth dialog (request IG + pages scopes)
 */
export const redirectToLogin = async (req, res) => {
  const { userId } = req.query;
  const scopes = [
    "instagram_basic",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
    "public_profile"
  ].join(",");

  const fbLoginUrl = `https://www.facebook.com/v21.0/dialog/oauth`
    + `?client_id=${process.env.FB_APP_ID}`
    + `&redirect_uri=${encodeURIComponent(process.env.SERVER_URL + "/social/instagram/callback")}`
    + `&scope=${encodeURIComponent(scopes)}`
    + `&state=${encodeURIComponent(userId)}`;

  return res.redirect(fbLoginUrl);
};

/**
 * Callback: code -> short token -> long token -> find correct FB page (one linked to IG business account)
 * Save account with upsert (match by user + platform).
 */
export const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = state;
    if (!code || !userId) return res.status(400).send("Missing code or state");

    // 1) Exchange code -> short lived user access token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token`
      + `?client_id=${process.env.FB_APP_ID}`
      + `&redirect_uri=${encodeURIComponent(process.env.SERVER_URL + "/social/instagram/callback")}`
      + `&client_secret=${process.env.FB_APP_SECRET}`
      + `&code=${code}`;

    const tokenRes = await axios.get(tokenUrl);
    const shortLivedToken = tokenRes.data.access_token;
    if (!shortLivedToken) throw new Error("No short-lived token from FB");

    // 2) Convert to long-lived user token
    const longTokenData = await getLongLivedToken(shortLivedToken);
    const longLivedUserToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in; // seconds, ~60 days
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    // 3) Get pages for this user using the long-lived user token
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`;
    const pagesRes = await axios.get(pagesUrl);
    const pages = pagesRes.data?.data || [];

    if (!Array.isArray(pages) || pages.length === 0) {
      console.log("No pages available for user during IG connect", userId);
      return res.send("No Facebook Page connected to this Instagram account.");
    }

    // 4) Find the page that has instagram_business_account (some pages won't)
    let chosenPage = null;
    for (const p of pages) {
      // We need to verify the page has an IG business account mapped
      const pageId = p.id;
      try {
        const pageInfoRes = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`
          + `?fields=instagram_business_account&access_token=${p.access_token}`);
        if (pageInfoRes.data?.instagram_business_account?.id) {
          chosenPage = {
            pageId,
            pageAccessToken: p.access_token,
            instagram_business_account: pageInfoRes.data.instagram_business_account
          };
          break;
        }
      } catch (errInner) {
        // skip pages that error — continue searching
        console.warn("Skipping page while searching IG mapping:", pageId, errInner?.response?.data || errInner.message);
      }
    }

    if (!chosenPage) {
      return res.send("No Facebook Page linked to an Instagram Business/Creator account.");
    }

    const igUserId = chosenPage.instagram_business_account.id;
    const pageAccessToken = chosenPage.pageAccessToken;

    // 5) Save account with upsert (match user + platform)
    await SocialAccount.findOneAndUpdate(
      { user: userId, platform: "instagram" },
      {
        user: userId,
        platform: "instagram",
        providerId: igUserId,
        accessToken: pageAccessToken,       // use page token for IG Graph requests tied to IG user
        refreshToken: longLivedUserToken,   // store the long-lived user token to refresh in future
        tokenExpiresAt,
        meta: {
          fbPageId: chosenPage.pageId,
          linkedPageToken: pageAccessToken
        }
      },
      { upsert: true, new: true }
    );

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?instagram=success`);
  } catch (error) {
    console.error("IG Callback Error:", error.response?.data || error.message || error);
    return res.status(500).send("Instagram connection failed");
  }
};

/**
 * Post image + caption to Instagram Business account for the given user.
 * Expects body: { userId, imageUrl, caption }
 *
 * Publishing is two steps:
 *  - POST /{igUserId}/media?image_url=... -> returns creation_id
 *  - POST /{igUserId}/media_publish?creation_id=... -> publish
 */
export const postToInstagram = async (req, res) => {
  try {
    const { userId, imageUrl, caption } = req.body;
    if (!userId || !imageUrl) return res.status(400).json({ error: "Missing params" });

    const account = await SocialAccount.findOne({ user: userId, platform: "instagram" });
    if (!account) return res.status(404).json({ error: "Instagram not connected!" });

    const igUserId = account.providerId;
    const token = account.accessToken; // page access token associated with IG user

    // 1) create media container
    const createUrl = `https://graph.facebook.com/v21.0/${igUserId}/media`
      + `?image_url=${encodeURIComponent(imageUrl)}`
      + `&caption=${encodeURIComponent(caption || "")}`
      + `&access_token=${encodeURIComponent(token)}`;

    const createRes = await axios.post(createUrl);
    const creationId = createRes.data?.id;
    if (!creationId) throw new Error("Failed to create IG media container");

    // 2) publish
    const publishUrl = `https://graph.facebook.com/v21.0/${igUserId}/media_publish`
      + `?creation_id=${encodeURIComponent(creationId)}`
      + `&access_token=${encodeURIComponent(token)}`;

    await axios.post(publishUrl);

    return res.json({ message: "Post uploaded to Instagram!" });
  } catch (error) {
    console.error("IG Post Error:", error.response?.data || error.message || error);
    return res.status(500).json({ error: "Failed to post" });
  }
};
