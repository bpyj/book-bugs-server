const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/auth");

const router = express.Router();

const AIRTABLE_API_ROOT = "https://api.airtable.com/v0";
const CHILDREN_TABLE = "Children";

async function fetchChildren() {
  const records = [];
  let offset;

  do {
    const url = new URL(
      `${AIRTABLE_API_ROOT}/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(CHILDREN_TABLE)}`
    );

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      const error = new Error("Could not retrieve children");
      error.status = response.status;
      error.details = details;
      throw error;
    }

    const data = await response.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function serializeChild(record) {
  return {
    childId: record.fields["Child ID"] ?? "",
    name: record.fields.Name ?? "",
    avatar: record.fields.Avatar?.[0] ?? null,
    status: record.fields.Status ?? "",
  };
}

router.post("/login", async (req, res) => {
  try {
    const childId = String(req.body.childId ?? "").trim();
    const pin = String(req.body.pin ?? "").trim();

    if (!childId || !pin) {
      return res.status(400).json({
        message: "Book Bugs ID and PIN are required",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server authentication is not configured",
      });
    }

    const children = await fetchChildren();
    const childRecord = children.find(
      (record) =>
        String(record.fields["Child ID"] ?? "")
          .trim()
          .toLowerCase() === childId.toLowerCase() &&
        record.fields.Status === "Active"
    );

    if (!childRecord) {
      return res.status(401).json({
        message: "Invalid Book Bugs ID or PIN",
      });
    }

    const pinHash = String(childRecord.fields["PIN Hash"] ?? "").trim();

    if (!pinHash) {
      return res.status(401).json({
        message: "Login has not been set up for this child",
      });
    }

    const pinMatches = await bcrypt.compare(pin, pinHash);

    if (!pinMatches) {
      return res.status(401).json({
        message: "Invalid Book Bugs ID or PIN",
      });
    }

    const child = serializeChild(childRecord);
    const token = jwt.sign(
      {
        childId: child.childId,
        airtableRecordId: childRecord.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ token, child });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: "Server error",
      error: error.details || error.message,
    });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const children = await fetchChildren();
    const childRecord = children.find(
      (record) =>
        record.id === req.user.airtableRecordId &&
        String(record.fields["Child ID"] ?? "") === req.user.childId &&
        record.fields.Status === "Active"
    );

    if (!childRecord) {
      return res.status(401).json({
        message: "Login is no longer valid",
      });
    }

    return res.json({ child: serializeChild(childRecord) });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: "Server error",
      error: error.details || error.message,
    });
  }
});

module.exports = router;
