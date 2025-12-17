import axios from "axios";

/**
 * Exchange short-lived token for a long-lived user token (~60 days).
 * Returns { access_token, expires_in } or throws.
 */
export const getLongLivedToken = async (shortLivedToken) => {
  const url = `https://graph.facebook.com/v21.0/oauth/access_token`
    + `?grant_type=fb_exchange_token`
    + `&client_id=${process.env.FB_APP_ID}`
    + `&client_secret=${process.env.FB_APP_SECRET}`
    + `&fb_exchange_token=${shortLivedToken}`;

  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
};