require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const AIRTABLE_API_ROOT = "https://api.airtable.com/v0";
const CHILDREN_TABLE = "Children";
const COLLECTIONS_TABLE = "Collections";

class AirtableRequestError extends Error {
  constructor(status, details) {
    super("Airtable request failed");
    this.status = status;
    this.details = details;
  }
}

async function fetchAllAirtableRecords(table) {
  const records = [];
  let offset;

  do {
    const url = new URL(
      `${AIRTABLE_API_ROOT}/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`
    );

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const airtableResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
      },
    });

    if (!airtableResponse.ok) {
      const details = await airtableResponse.text();
      throw new AirtableRequestError(
        airtableResponse.status,
        details
      );
    }

    const data = await airtableResponse.json();

    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function sendServerError(res, error) {
  if (error instanceof AirtableRequestError) {
    return res.status(error.status).json({
      message: error.message,
      error: error.details,
    });
  }

  return res.status(500).json({
    message: "Server error",
    error: error.message,
  });
}

function serializeChild(record) {
  return {
    id: record.id,
    childId: record.fields["Child ID"] ?? "",
    name: record.fields.Name ?? "",
    avatar: record.fields.Avatar?.[0] ?? null,
    status: record.fields.Status ?? "",
  };
}

app.get("/", (req, res) => {
  res.send("Book Bugs server is running");
});

app.get("/api/inventory", async (req, res) => {
  try {
    const records = await fetchAllAirtableRecords(
      process.env.AIRTABLE_TABLE_ID
    );

    res.json(records);
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get("/api/children", async (req, res) => {
  try {
    const records =
      await fetchAllAirtableRecords(CHILDREN_TABLE);

    const children = records
      .filter(
        (record) => record.fields.Status === "Active"
      )
      .map(serializeChild)
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );

    res.json(children);
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get("/api/children/search/:childId", async (req, res) => {
  try {
    const requestedChildId = req.params.childId
      .trim()
      .toLowerCase();

    const children =
      await fetchAllAirtableRecords(CHILDREN_TABLE);

    const childRecord = children.find(
      (record) =>
        String(record.fields["Child ID"] ?? "")
          .trim()
          .toLowerCase() === requestedChildId &&
        record.fields.Status === "Active"
    );

    if (!childRecord) {
      return res.status(404).json({
        message: "Active child not found",
      });
    }

    res.json(serializeChild(childRecord));
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get(
  "/api/children/:childId/collection",
  async (req, res) => {
    try {
      const requestedChildId =
        req.params.childId.trim().toLowerCase();

      const children =
        await fetchAllAirtableRecords(
          CHILDREN_TABLE
        );

      const childRecord = children.find(
        (record) =>
          String(
            record.fields["Child ID"] ?? ""
          )
            .trim()
            .toLowerCase() === requestedChildId &&
          record.fields.Status === "Active"
      );

      if (!childRecord) {
        return res.status(404).json({
          message: "Active child not found",
        });
      }

      const collectionRecords =
        await fetchAllAirtableRecords(
          COLLECTIONS_TABLE
        );

      const childCollectionRecords =
        collectionRecords.filter((record) =>
          record.fields.Child?.includes(
            childRecord.id
          )
        );

      const collectionByBookBugId =
        new Map();

      childCollectionRecords.forEach(
        (collectionRecord) => {
          const bookBugId =
            collectionRecord.fields[
              "Book Bug"
            ]?.[0];

          if (bookBugId) {
            collectionByBookBugId.set(
              bookBugId,
              collectionRecord
            );
          }
        }
      );

      const inventoryRecords =
        await fetchAllAirtableRecords(
          process.env.AIRTABLE_TABLE_ID
        );

      const collection = inventoryRecords
        .filter((record) =>
          collectionByBookBugId.has(record.id)
        )
        .filter(
          (record) =>
            record.fields.Type === "Card"
        )
        .filter(
          (record) =>
            record.fields.Attachment?.length > 0
        )
        .map((record) => {
          const collectionRecord =
            collectionByBookBugId.get(
              record.id
            );

          return {
            ...record,

            fields: {
              ...record.fields,
              Status: "Collected",
              Qty: collectionRecord.fields.Quantity ?? 1,
            },

            collection: {
              id: collectionRecord.id,

              collectedDate:
                collectionRecord.fields[
                  "Collected Date"
                ] ?? null,

              notes:
                collectionRecord.fields
                  .Notes ?? "",
            },
          };
        })
        .sort(
          (a, b) =>
            (a.fields["Card Number"] ??
              Number.MAX_SAFE_INTEGER) -
            (b.fields["Card Number"] ??
              Number.MAX_SAFE_INTEGER)
        );

      res.json({
        child: serializeChild(childRecord),
        total: collection.length,
        collection,
      });
    } catch (error) {
      sendServerError(res, error);
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running at http://localhost:${PORT}`
  );
});