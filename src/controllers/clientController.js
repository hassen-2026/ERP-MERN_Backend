const mongoose = require("mongoose");
const Client = require("../models/Client");
const logHistory = require("../utils/historyLogger");

async function createClient(req, res) {
  try {
    const body = req.body || {};
    const nom = body.nom || body.name;
    const email = body.email || body.mail;
    const telephone = body.telephone || body.phone;
    const adresse = body.adresse || body.address;

    if (!nom || !email || !telephone || !adresse) {
      return res.status(400).json({ message: "nom, email, telephone and adresse are required" });
    }

    const client = await Client.create({ nom, email, telephone, adresse });
    await logHistory({
      action: "CLIENT_CREATED",
      description: `Client ${client.nom} created`,
      user: req.user.id,
      entityType: "Client",
      entityId: client._id,
    });
    return res.status(201).json(client);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listClients(_req, res) {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    return res.json(clients);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getClientById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid client id" });
    }
    const client = await Client.findById(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    return res.json(client);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function updateClient(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid client id" });
    }
    const body = req.body || {};
    const payload = {};
    if (body.nom !== undefined || body.name !== undefined) payload.nom = body.nom || body.name;
    if (body.email !== undefined || body.mail !== undefined) payload.email = body.email || body.mail;
    if (body.telephone !== undefined || body.phone !== undefined) {
      payload.telephone = body.telephone || body.phone;
    }
    if (body.adresse !== undefined || body.address !== undefined) {
      payload.adresse = body.adresse || body.address;
    }

    const client = await Client.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
    if (!client) return res.status(404).json({ message: "Client not found" });
    await logHistory({
      action: "CLIENT_UPDATED",
      description: `Client ${client.nom} updated`,
      user: req.user.id,
      entityType: "Client",
      entityId: client._id,
    });
    return res.json(client);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function deleteClient(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid client id" });
    }
    const client = await Client.findByIdAndDelete(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    await logHistory({
      action: "CLIENT_DELETED",
      description: `Client ${client.nom} deleted`,
      user: req.user.id,
      entityType: "Client",
      entityId: client._id,
    });
    return res.json({ message: "Client deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = { createClient, listClients, getClientById, updateClient, deleteClient };
