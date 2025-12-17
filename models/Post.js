import mongoose from 'mongoose';

const PostSchema = new mongoose.Schema({
  // User who created the post
  user: {
    type: String,
    required: true,
    index: true
  },
  
  // Platform information
  platform: {
    type: String,
    required: true,
    enum: ["twitter", "linkedin"],
    index: true
  },
  
  // Platform-specific post ID (Tweet ID, LinkedIn Post ID)
  providerId: {
    type: String,
    required: true,
    index: true
  },
  
  // Post content
  content: {
    type: String,
    required: true
  },
  
  // Media attachments (images, videos, etc.)
  mediaUrls: [{
    type: String
  }],
  
  // When the post was published
  postedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Post status
  status: {
    type: String,
    enum: ["draft", "scheduled", "posted", "failed"],
    default: "posted"
  },
  
  // Engagement metrics
  likesCount: {
    type: Number,
    default: 0
  },
  
  commentsCount: {
    type: Number,
    default: 0
  },
  
  sharesCount: {
    type: Number,
    default: 0
  },
  
  // Direct link to the post
  postUrl: {
    type: String
  },
  
  // Account info at time of posting
  accountInfo: {
    username: String,
    name: String,
    profileImage: String,
    platformId: String // twitterId or linkedinId
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Compound index for user + platform queries
PostSchema.index({ user: 1, platform: 1, postedAt: -1 });

// Index for status queries
PostSchema.index({ status: 1 });

// Index for platform-specific post ID lookups
PostSchema.index({ providerId: 1, platform: 1 }, { unique: true });

// Text index for searching post content
PostSchema.index({ content: 'text' });

export default mongoose.model('Post', PostSchema);