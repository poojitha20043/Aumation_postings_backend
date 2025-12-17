import User from "../models/users.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

// 📩 Send OTP Email
const sendOtpEmail = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    await transporter.sendMail({
        from: `"Verify Your Account" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    });
};

export const register = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // 🔍 Validation
        if (!name || !email || !phone || !password)
            return res.status(400).json({ msg: "All fields are required", success: false });

        if (name.length < 3)
            return res.status(400).json({ msg: "Name must be at least 3 characters", success: false });

        if (!/^\S+@\S+\.\S+$/.test(email))
            return res.status(400).json({ msg: "Invalid email format", success: false });

        if (!/^[0-9]{10}$/.test(phone))
            return res.status(400).json({ msg: "Phone must be a valid 10-digit number", success: false });

        if (password.length < 6)
            return res.status(400).json({ msg: "Password must be at least 6 characters", success: false });

        const userExists = await User.findOne({ email });
        if (userExists)
            return res.status(400).json({ msg: "User already exists", success: false });

        // 🔐 Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const user = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            otp,
            otpExpires: Date.now() + 5 * 60 * 1000, // 5 mins
        });

        await sendOtpEmail(email, otp);
        res.json({ msg: "OTP sent to email. Please verify.", success: true });
    } catch (err) {
        console.error("Error during registration:", err);
        res.status(500).json({ msg: "Server error", success: false });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("📨 Received OTP verification request:", { email, otp });

        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ User not found for email:", email);
            return res.json({ msg: "User not found", success: false });
        }

        console.log("🟢 User found:", user.email);
        console.log("🕒 Stored OTP:", user.otp, " | Expires at:", new Date(user.otpExpires));

        // check otp validity
        if (user.otp !== otp) {
            console.log("❌ Invalid OTP entered");
            return res.json({ msg: "Invalid OTP", success: false });
        }

        if (Date.now() > user.otpExpires) {
            console.log("⌛ OTP expired");
            return res.json({ msg: "OTP expired", success: false });
        }

        // ✅ Verification successful
        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        console.log("✅ OTP verified successfully for:", user.email);

        // 🔑 Generate JWT token (expires in 1 day)
        const token = jwt.sign(
            { id: user._id.toString(), name: user.name, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );
        return res.json({
            msg: "Account verified successfully",
            success: true,
            userId: user._id.toString(),
            token,
        });
    } catch (err) {
        console.error("🚨 Error in verifyOtp:", err.message);
        res.status(500).json({ msg: err.message });
    }
};

// 🧾 Login Controller
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.json({ msg: "User not found", success: false });
        if (!user.isVerified)
            return res.json({ msg: "Please verify your email before login", success: false });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.json({ msg: "Invalid password", success: false });

        const token = jwt.sign(
            { id: user._id.toString(), name: user.name, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );
        res.json({ msg: "Login successful", token,  userId: user._id.toString(),success: true });
       // res.json({ msg: "Login successful", token });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};
