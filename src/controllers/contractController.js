const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Employee = require("../models/Employee");
const logHistory = require("../utils/historyLogger");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");

function normalizeContractPayload(body = {}) {
  const payload = { ...body };
  if (payload.contractType) payload.contractType = String(payload.contractType).toUpperCase();
  if (payload.status) payload.status = String(payload.status).toUpperCase();
  return payload;
}

async function uploadContractPdf(fileBuffer, fileName) {
  // Méthode alternative plus robuste
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "contracts",
        resource_type: "raw",
        public_id: `contract_${Date.now()}_${fileName.replace(/\.[^/.]+$/, "")}`,
        type: "upload",
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          // Construire l'URL avec les paramètres corrects
          const pdfUrl = result.secure_url || result.url;
          resolve({ 
            url: pdfUrl, 
            publicId: result.public_id 
          });
        }
      }
    );

    uploadStream.on("error", (error) => {
      console.error("Upload stream error:", error);
      reject(error);
    });

    const stream = Readable.from([fileBuffer]);
    stream.on("error", (error) => {
      console.error("Buffer stream error:", error);
      reject(error);
    });
    stream.pipe(uploadStream);
  });
}

async function createContract(req, res) {
  try {
    const payload = normalizeContractPayload(req.body || {});
    if (!payload.employee || !payload.contractType || !payload.startDate) {
      return res.status(400).json({ message: "employee, contractType and startDate are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
      return res.status(400).json({ message: "Invalid employee id" });
    }

    const employee = await Employee.findById(payload.employee);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    // Handle PDF upload if file exists
    if (req.file) {
      const { url, publicId } = await uploadContractPdf(req.file.buffer, req.file.originalname);
      payload.pdfUrl = url;
      payload.pdfPublicId = publicId;
    }

    const contract = await Contract.create({ ...payload, createdBy: req.user.id });

    await logHistory({
      action: "CONTRACT_CREATED",
      description: `Contract created for employee ${employee.name || employee.firstName || employee._id}`,
      user: req.user.id,
      entityType: "Contract",
      entityId: contract._id,
    });

    const populated = await Contract.findById(contract._id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("createdBy", "firstName lastName email role");

    // Ensure pdfUrl and pdfPublicId are always present
    const response = {
      ...populated.toObject(),
      pdfUrl: populated.pdfUrl || "",
      pdfPublicId: populated.pdfPublicId || "",
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error in createContract:", error.message);
    return res.status(500).json({ message: error.message });
  }
}

async function listContracts(req, res) {
  try {
    const query = {};
    if (req.query.employee) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      query.employee = req.query.employee;
    }
    if (req.query.status) query.status = String(req.query.status).toUpperCase();
    if (req.query.contractType) query.contractType = String(req.query.contractType).toUpperCase();

    let contracts = await Contract.find(query)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("createdBy", "firstName lastName email role")
      .sort({ createdAt: -1 });

    // Ensure pdfUrl and pdfPublicId are always present
    contracts = contracts.map(contract => {
      const contractObj = contract.toObject ? contract.toObject() : contract;
      return {
        ...contractObj,
        pdfUrl: contractObj.pdfUrl || "",
        pdfPublicId: contractObj.pdfPublicId || "",
      };
    });

 
    contracts.forEach((c, i) => {
      console.log(`  Contract ${i + 1}: ${c?.employee?.name || "?"} - pdfUrl = ${c.pdfUrl ? "✓ " + c.pdfUrl.substring(0, 50) + "..." : "✗ Empty"}`);
    });

    return res.json(contracts);
  } catch (error) {
    console.error("Error in listContracts:", error.message);
    return res.status(500).json({ message: error.message });
  }
}

async function getContractById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid contract id" });
    }

    let contract = await Contract.findById(id)
      .populate("employee", "name firstName lastName employeeCode email")
      .populate("createdBy", "firstName lastName email role");

    if (!contract) return res.status(404).json({ message: "Contract not found" });
    
    // Ensure pdfUrl and pdfPublicId are always present
    const contractObj = contract.toObject ? contract.toObject() : contract;
    const response = {
      ...contractObj,
      pdfUrl: contractObj.pdfUrl || "",
      pdfPublicId: contractObj.pdfPublicId || "",
    };
    
    return res.json(response);
  } catch (error) {
    console.error("Error in getContractById:", error.message);
    return res.status(500).json({ message: error.message });
  }
}

async function updateContract(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid contract id" });
    }

    const payload = normalizeContractPayload(req.body || {});
    if (payload.employee) {
      if (!mongoose.Types.ObjectId.isValid(payload.employee)) {
        return res.status(400).json({ message: "Invalid employee id" });
      }
      const employee = await Employee.findById(payload.employee);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
    }

    // Handle PDF upload if file exists
    if (req.file) {
      const existingContract = await Contract.findById(id);
      if (existingContract && existingContract.pdfPublicId) {
        try {
          await cloudinary.uploader.destroy(existingContract.pdfPublicId, {
            resource_type: "raw",
          });
        } catch (error) {
          console.error("Error deleting old PDF:", error);
        }
      }

      const { url, publicId } = await uploadContractPdf(req.file.buffer, req.file.originalname);
      payload.pdfUrl = url;
      payload.pdfPublicId = publicId;
    }

    const contract = await Contract.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
      .populate("employee", "name firstName lastName employeeCode email status")
      .populate("createdBy", "firstName lastName email role");

    if (!contract) return res.status(404).json({ message: "Contract not found" });

    // Si le contrat passe au statut TERMINATED, marquer l'employé comme INACTIVE
    if (payload.status === "TERMINATED" && contract.employee) {
      await Employee.findByIdAndUpdate(contract.employee._id, { status: "INACTIVE" }, { new: true });
      console.log(`✓ Employee ${contract.employee._id} marked as INACTIVE due to contract termination`);
    }

    await logHistory({
      action: "CONTRACT_UPDATED",
      description: `Contract ${contract._id} updated`,
      user: req.user.id,
      entityType: "Contract",
      entityId: contract._id,
    });

    // Ensure pdfUrl and pdfPublicId are always present
    const response = {
      ...contract.toObject(),
      pdfUrl: contract.pdfUrl || "",
      pdfPublicId: contract.pdfPublicId || "",
    };

    return res.json(response);
  } catch (error) {
    console.error("Error in updateContract:", error.message);
    return res.status(500).json({ message: error.message });
  }
}

async function deleteContract(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid contract id" });
    }

    const contract = await Contract.findByIdAndDelete(id);
    if (!contract) return res.status(404).json({ message: "Contract not found" });

    // Delete PDF from Cloudinary if it exists
    if (contract.pdfPublicId) {
      try {
        await cloudinary.uploader.destroy(contract.pdfPublicId, {
          resource_type: "raw",
        });
      } catch (error) {
        console.error("Error deleting PDF:", error);
      }
    }

    // Marquer l'employé comme INACTIVE lorsque le contrat est supprimé
    if (contract.employee) {
      await Employee.findByIdAndUpdate(contract.employee, { status: "INACTIVE" }, { new: true });
      console.log(`✓ Employee ${contract.employee} marked as INACTIVE due to contract deletion`);
    }

    await logHistory({
      action: "CONTRACT_DELETED",
      description: `Contract ${contract._id} deleted`,
      user: req.user.id,
      entityType: "Contract",
      entityId: contract._id,
    });

    return res.json({ message: "Contract deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createContract,
  listContracts,
  getContractById,
  updateContract,
  deleteContract,
};
