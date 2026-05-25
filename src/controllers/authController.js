const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");
const { SIGNUP_ROLES } = require("../constants/userRoles");
const sendEmail = require("../utils/mailer");
const { Readable } = require("stream");

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

async function uploadUserImage(fileBuffer, fileName) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "users",
        resource_type: "image",
        public_id: `user_${Date.now()}_${fileName.replace(/\.[^/.]+$/, "")}`,
        type: "upload",
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
          return;
        }

        resolve({
          url: result.secure_url || result.url || "",
          publicId: result.public_id || "",
        });
      }
    );

    uploadStream.on("error", reject);

    Readable.from([fileBuffer]).pipe(uploadStream);
  });
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        imageUrl: user.imageUrl,
        imagePublicId: user.imagePublicId
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function register(req, res) {
  try {
    const { email, firstName, lastName, password, confirmPassword, role } = req.body;

    // Validation des champs requis
    if (!email || !firstName || !lastName || !password || !confirmPassword) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires" });
    }

    // Validation du rôle
    if (!SIGNUP_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rôle invalide" });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: "Cet e-mail est déjà utilisé" });
    }

    // Validation de la longueur du mot de passe
    if (password.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    let imageUrl = "";
    let imagePublicId = "";
    if (req.file) {
      const uploadedImage = await uploadUserImage(req.file.buffer, req.file.originalname);
      imageUrl = uploadedImage.url;
      imagePublicId = uploadedImage.publicId;
    }

    // Créer le nouvel utilisateur
    const newUser = new User({
      email: email.toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password,
      confirmPassword,
      role: role || "USER",
      imageUrl,
      imagePublicId,
    });

    await newUser.save();

    // Retourner l'utilisateur sans le mot de passe
    const userResponse = {
      id: newUser._id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      imageUrl: newUser.imageUrl,
      imagePublicId: newUser.imagePublicId,
    };

    return res.status(201).json({
      message: "Inscription réussie",
      user: userResponse,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "L'adresse e-mail est obligatoire" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Pour des raisons de sécurité, ne pas révéler si l'e-mail existe
      return res.status(200).json({
        message: "Si cet e-mail existe, un lien de réinitialisation a été envoyé",
      });
    }

    // Générer un token de réinitialisation (valide 1 heure)
    const resetToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Construire le lien de réinitialisation
    const frontendURL = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${frontendURL}/reset-password/${resetToken}`;

    // Envoyer l'e-mail avec le lien
    try {
      await sendEmail({
        mail: user.email,
        subject: "Réinitialisation de votre mot de passe",
        content: `Cliquez sur le lien pour réinitialiser votre mot de passe: ${resetLink}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Réinitialisation de mot de passe</h2>
            <p>Bonjour ${user.firstName},</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour continuer:</p>
            <p>
              <a href="${resetLink}" style="background-color: #064c81; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </p>
            <p>Le lien expire dans 1 heure.</p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Email send failed:", emailError);
      // Ne pas rejeter la requête si l'envoi échoue, pour éviter de révéler info sur l'email
    }

    return res.status(200).json({
      message: "Un lien de réinitialisation a été envoyé à votre e-mail",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Les mots de passe ne correspondent pas" });
    }

    // Vérifier le token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Le lien de réinitialisation a expiré" });
    }

    // Trouver l'utilisateur
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    user.confirmPassword = confirmPassword;
    await user.save();

    return res.status(200).json({
      message: "Mot de passe réinitialisé avec succès",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { login, me, register, forgotPassword, resetPassword };
