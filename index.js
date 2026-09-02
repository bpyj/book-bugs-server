require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Book Bugs server is running");
});

app.get("/api/inventory", async (req, res) => {
  try {
    const url =
      `https://api.airtable.com/v0/` +
      `${process.env.AIRTABLE_BASE_ID}/` +
      `${process.env.AIRTABLE_TABLE_ID}`;

    const airtableResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      },
    });

    if (!airtableResponse.ok) {
      const error = await airtableResponse.text();

      return res.status(airtableResponse.status).json({
        message: "Airtable request failed",
        error,
      });
    }

    const data = await airtableResponse.json();

    res.json(data.records);
  } catch (error) {
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});