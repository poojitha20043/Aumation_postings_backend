import axios from "axios";
import qs from "querystring";
import FormData from "form-data";
import fs from "fs";

const FB_OAUTH_URL = 'https://www.facebook.com/v17.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v17.0/oauth/access_token';
//const FB_GRAPH = 'https://graph.facebook.com/v17.0';

const FB_GRAPH = "https://graph.facebook.com/v20.0";

export function getAuthUrl({ clientId, redirectUri, state, scopes = [] }) {
    const params = {
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state || 'state123',
        scope: scopes.join(','),
        response_type: 'code'
    };
    return `${FB_OAUTH_URL}?${qs.stringify(params)}`;
}

export async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
    const params = {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
    };
    const url = `${FB_TOKEN_URL}?${qs.stringify(params)}`;
    const res = await axios.get(url);
    return res.data;
}

export async function getPagePicture(pageId, accessToken) {
    const url = `https://graph.facebook.com/v19.0/${pageId}/picture`;

    const response = await axios.get(url, {
        params: {
            access_token: accessToken,
            redirect: false
        }
    });

    return response.data.data.url;
};

export async function getUserPages(accessToken) {
    const url = `${FB_GRAPH}/me/accounts?access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data;
}

export async function publishToPage({
    pageAccessToken,
    pageId,
    message,
    imageFile,
    scheduleTime,
}) {
    try {
        // ========== IMAGE POST ==========
        if (imageFile) {
            const form = new FormData();
            form.append("message", message || "");
            form.append("source", fs.createReadStream(imageFile.path));
            form.append("access_token", pageAccessToken); // ✅ MUST

            if (scheduleTime) {
                form.append("published", "false");
                form.append(
                    "scheduled_publish_time",
                    Math.floor(new Date(scheduleTime).getTime() / 1000)
                );
            }

            const res = await axios.post(
                `${FB_GRAPH}/${pageId}/photos`,
                form,
                { headers: form.getHeaders() }
            );

            return res.data;
        }

        // ========== TEXT POST ==========
        const params = {
            message,
            access_token: pageAccessToken,
        };

        if (scheduleTime) {
            params.published = false;
            params.scheduled_publish_time =
                Math.floor(new Date(scheduleTime).getTime() / 1000);
        }

        const res = await axios.post(
            `${FB_GRAPH}/${pageId}/feed`,
            null,
            { params }
        );

        return res.data;
    } catch (err) {
        console.error("FB ERROR:", err.response?.data || err.message);
        throw err;
    }
}

export async function getPageDetails(pageId, accessToken) {
    const fields = 'id,name,fan_count,followers_count,link';
    const url = `${FB_GRAPH}/${pageId}?fields=${fields}&access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data;
}

// Get recent posts with likes/engagement
async function getPagePosts(pageId, accessToken) {
    const fields = 'id,message,created_time,likes.summary(true)';
    const url = `${FB_GRAPH}/${pageId}/posts?fields=${fields}&access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data.data || [];
}


