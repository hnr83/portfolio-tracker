const express = require("express");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Falta credential de Google" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email = String(payload.email || "").toLowerCase();
    const name = payload.name || "";
    const picture = payload.picture || "";

    const allowedEmails = String(process.env.ALLOWED_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedEmails.includes(email)) {
      return res.status(403).json({
        error: "Email no autorizado",
        email,
      });
    }

    const token = jwt.sign(
      {
        email,
        name,
        picture,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "12h",
      }
    );

    return res.json({
      token,
      user: {
        email,
        name,
        picture,
      },
    });
  } catch (err) {
    console.error("Error Google login:", err);
    return res.status(401).json({
      error: "Login Google inválido",
    });
  }
});

module.exports = router;