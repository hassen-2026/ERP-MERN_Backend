const Commande = require("../models/Commande");
const Achat = require("../models/Achat");

const getSalesLocations = async (req, res) => {
  try {
    const results = await Commande.aggregate([
      { $match: { status: "DELIVERED" } },
      {
        $lookup: {
          from: "clients",
          localField: "client",
          foreignField: "_id",
          as: "client",
        },
      },
      { $unwind: { path: "$client", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: { adresse: "$client.adresse" },
          total: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          location: "$_id.adresse",
          total: 1,
          count: 1,
          _id: 0,
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ data: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sales locations", error: err.message });
  }
};

const getPurchasesLocations = async (req, res) => {
  try {
    const results = await Achat.aggregate([
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: { city: "$supplier.city", address: "$supplier.address" },
          total: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          location: { $ifNull: ["$_id.city", "$_id.address"] },
          total: 1,
          count: 1,
          _id: 0,
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({ data: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching purchases locations", error: err.message });
  }
};

module.exports = {
  getSalesLocations,
  getPurchasesLocations,
};
