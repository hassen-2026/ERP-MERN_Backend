const mongoose = require("mongoose");
const CompanySettings = require("../models/CompanySettings");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const logHistory = require("../utils/historyLogger");

async function uploadLogoStream(fileBuffer, originalName) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "company",
        resource_type: "image",
        public_id: `logo_${Date.now()}_${originalName.replace(/\.[^/.]+$/, "")}`,
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload logo error:", error);
          reject(new Error(`Cloudinary logo upload failed: ${error.message}`));
        } else {
          resolve({
            url: result.secure_url || result.url,
            publicId: result.public_id,
          });
        }
      }
    );

    const stream = Readable.from([fileBuffer]);
    stream.pipe(uploadStream);
  });
}

async function getSettings(req, res) {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = await CompanySettings.create({
        name: "Mon Entreprise",
        address: "Adresse de l'entreprise",
        phone: "N° de Téléphone",
        email: "contact@entreprise.com",
        taxNumber: "0000000/A/P/M/000",
      });
    }
    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateSettings(req, res) {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = await CompanySettings.create({
        name: "Mon Entreprise",
        address: "Adresse de l'entreprise",
        phone: "N° de Téléphone",
        email: "contact@entreprise.com",
        taxNumber: "0000000/A/P/M/000",
      });
    }

    const payload = {
      name: req.body.name,
      address: req.body.address,
      phone: req.body.phone,
      email: req.body.email,
      taxNumber: req.body.taxNumber,
    };

    if (req.file) {
      // Delete previous logo from Cloudinary if it exists
      if (settings.logoPublicId) {
        try {
          await cloudinary.uploader.destroy(settings.logoPublicId);
          console.log(`Deleted old logo: ${settings.logoPublicId}`);
        } catch (cloudinaryErr) {
          console.error("Failed to delete old logo from Cloudinary:", cloudinaryErr);
        }
      }

      // Upload new logo
      const uploadResult = await uploadLogoStream(req.file.buffer, req.file.originalname);
      payload.logoUrl = uploadResult.url;
      payload.logoPublicId = uploadResult.publicId;
    }

    Object.assign(settings, payload);
    await settings.save();

    await logHistory({
      action: "COMPANY_SETTINGS_UPDATED",
      description: "Company settings updated by admin",
      user: req.user.id,
      entityType: "CompanySettings",
      entityId: settings._id,
    });

    return res.json(settings);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
};
