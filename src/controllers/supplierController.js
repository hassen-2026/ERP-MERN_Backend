const Supplier = require("../models/Supplier");

async function createSupplier(req, res) {
  try {
    const { firstName, lastName, email, phone, address, matriculeFiscale, imageUrl, country, city } = req.body;
    if (!firstName) return res.status(400).json({ message: "First name is required" });
    if (!lastName) return res.status(400).json({ message: "Last name is required" });
    if (!matriculeFiscale) return res.status(400).json({ message: "Matricule fiscale is required" });

    const supplier = await Supplier.create({ firstName, lastName, email, phone, address, matriculeFiscale, imageUrl, country, city });
    return res.status(201).json(supplier);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listSuppliers(_req, res) {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    return res.json(suppliers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getSupplierById(req, res) {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    return res.json(supplier);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateSupplier(req, res) {
  try {
    const { firstName, lastName, email, phone, address, matriculeFiscale, imageUrl, country, city } = req.body;
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    if (firstName !== undefined) supplier.firstName = firstName;
    if (lastName !== undefined) supplier.lastName = lastName;
    if (email !== undefined) supplier.email = email;
    if (phone !== undefined) supplier.phone = phone;
    if (address !== undefined) supplier.address = address;
    if (matriculeFiscale !== undefined) supplier.matriculeFiscale = matriculeFiscale;
    if (imageUrl !== undefined) supplier.imageUrl = imageUrl;
    if (country !== undefined) supplier.country = country;
    if (city !== undefined) supplier.city = city;

    await supplier.save();
    return res.json(supplier);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteSupplier(req, res) {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    return res.json({ message: "Supplier deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createSupplier,
  listSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier
};
