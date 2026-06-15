require("dotenv").config();
const mongoose = require("mongoose");

const Client = require("./models/Client");
const Commande = require("./models/Commande");
const BonCommande = require("./models/BonCommande");

async function check() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  console.log("Connecting to:", uri);
  await mongoose.connect(uri);
  console.log("Connected.");

  const clients = await Client.find({});
  console.log("\n--- CLIENTS ---");
  clients.forEach(c => {
    console.log(`ID: ${c._id}, Nom: ${c.nom || c.name}`);
  });

  const commandes = await Commande.find({});
  console.log("\n--- COMMANDES ---");
  commandes.forEach(c => {
    console.log(`ID: ${c._id}, Num: ${c.commandeNumber}, Client: ${c.client}`);
  });

  const bonCommandes = await BonCommande.find({}).populate("commande");
  console.log("\n--- BON COMMANDES ---");
  bonCommandes.forEach(bc => {
    console.log(`ID: ${bc._id}, Num: ${bc.bonNumber}, Status: ${bc.status}, CommandeId: ${bc.commande?._id}, CommandeNum: ${bc.commande?.commandeNumber}, Client: ${bc.commande?.client}`);
  });

  await mongoose.disconnect();
}

check().catch(console.error);
