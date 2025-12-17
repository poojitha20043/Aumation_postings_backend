import mongoose from "mongoose";

const PostedPostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    platform: {
      type: String,
      enum: ["facebook", "instagram"],
      required: true,
    },

    pageId: {
      type: String,
      required: true,
    },

    pageName: {
      type: String,
    },

    message: {
      type: String,
    },

    imageName: {
      type: String, // only filename
    },

    postId: {
      type: String, // facebook post id
    },

    scheduledTime: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["posted", "scheduled", "failed"],
      default: "posted",
    },
  },
  { timestamps: true }
);

export default mongoose.model("PostedPost", PostedPostSchema);
