// index.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const cors = require("cors");
const archiver = require("archiver");

const app = express();
const PORT = process.env.PORT || 5000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== Serve Frontend =====
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ===== Multer setup for PDF uploads =====
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===== Merge PDFs =====
app.post("/merge", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2)
      return res.status(400).json({ error: "Select at least 2 PDFs to merge." });

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const pdf = await PDFDocument.load(file.buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfFile = await mergedPdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=merged.pdf");
    res.send(Buffer.from(mergedPdfFile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Merge exception", details: err.message });
  }
});

// ===== Split PDF =====
app.post("/split", upload.single("pdfs"), async (req, res) => {
  let archive;
  try {
    if (!req.file)
      return res.status(400).json({ error: "Select a PDF to split." });

    const pdf = await PDFDocument.load(req.file.buffer);
    const numberOfPages = pdf.getPageCount();

    archive = archiver("zip", { zlib: { level: 9 } });

    // Handle archive errors
    archive.on("error", (err) => {
      throw err;
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=split_${req.file.originalname}.zip`);
    archive.pipe(res);

    for (let i = 0; i < numberOfPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdf, [i]);
      newPdf.addPage(copiedPage);
      const pdfBytes = await newPdf.save();
      archive.append(Buffer.from(pdfBytes), { name: `page_${i + 1}.pdf` });
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Split exception", details: err.message });
    } else {
      // If headers are already sent, we can't send a JSON error.
      // The stream will just terminate abruptly which is better than nothing.
      if (archive) archive.abort();
      res.end();
    }
  }
});

// ===== Compress PDF =====
app.post("/compress", upload.single("pdfs"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Select a PDF to compress." });

    const pdf = await PDFDocument.load(req.file.buffer);

    // pdf-lib doesn't have advanced compression, but we can re-save with optimizations
    const compressedPdfFile = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=compressed_${req.file.originalname}`);
    res.send(Buffer.from(compressedPdfFile));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Compression exception", details: err.message });
  }
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
