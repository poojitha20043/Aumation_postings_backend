import mongoose from 'mongoose';

const TwitterAccountSchema = new mongoose.Schema({
  user: { type: String, required: true },
  platform: { type: String, default: "twitter" },
  
  // 🔥 FOR ANDROID SUPPORT
  loginPlatform: {
    type: String,
    default: "web",
    enum: ["web", "android", "ios"]
  },
  androidSessionId: {
    type: String,
    default: null
  },
  
isAndroidSession: {
  type: Boolean,
  default: false
},
sessionCreatedAt: Date,
sessionExpiresAt: Date,


  // OAuth fields
  oauthState: {
    type: String,
    sparse: true
  },
  oauthCodeVerifier: String,
  oauthCreatedAt: Date,

  providerId: String,
  accessToken: String,
  refreshToken: String,
  scopes: [String],
  tokenExpiresAt: Date,
  
  meta: {
    twitterId: String,
    username: String,
    name: String,
    profileImage: String
  }
}, {
  timestamps: true
});

export default mongoose.model('TwitterAccount', TwitterAccountSchema);