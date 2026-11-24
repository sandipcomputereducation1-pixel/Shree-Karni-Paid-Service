
"use strict";

/* ==========================================
   SHREE KARNI AUTO PRINT
   COMPLETE EDITOR SYSTEM
========================================== */

const service = String(window.SK_SERVICE || "");
const $ = id => document.getElementById(id);

const files = {
    front: null,
    back: null,
    images: [],
    pdf: null,
    pdfFiles: []
};

const frontCanvas = $("frontCanvas");
const backCanvas = $("backCanvas");

if (!frontCanvas || !backCanvas) {
    throw new Error("HTML में frontCanvas या backCanvas नहीं मिला।");
}

const frontCtx = frontCanvas.getContext("2d");
const backCtx = backCanvas.getContext("2d");

let angle = 0;
let zoom = 1;
let fit = "contain";

const isCard = service === "card-print";
const isPVC = service === "pvc";
const isSheet = service === "photo-sheet";
const isPassport = service === "passport";
const isPDF = service.startsWith("pdf-");

const PDFLib = () => {
    if (!window.PDFLib) {
        throw new Error("PDF Library Load नहीं हुई। Internet चेक करें।");
    }
    return window.PDFLib;
};

/* ==========================================
   HELPERS
========================================== */

function hidden(id, value) {
    const el = $(id);
    if (el) el.hidden = value;
}

function value(id, val) {
    const el = $(id);
    if (el) el.value = val;
}

function message(text) {
    const el = $("editorMessage");
    if (el) el.textContent = text;
}

function validImage(file) {
    return !!file && file.type.startsWith("image/");
}

function validPDF(file) {
    return !!file && (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    );
}

function safeFilename(name) {
    return name.replace(/[^a-z0-9._-]/gi, "-");
}

/* ==========================================
   CANVAS SIZE
========================================== */

if (isPVC) {
    frontCanvas.width = 1160;
    frontCanvas.height = 638;
    backCanvas.width = 1160;
    backCanvas.height = 638;
}

if (isCard) {
    frontCanvas.width = 1200;
    frontCanvas.height = 800;
    backCanvas.width = 1200;
    backCanvas.height = 800;
}

if (isPassport) {
    frontCanvas.width = 413;
    frontCanvas.height = 531;
}

if (isSheet) {
    frontCanvas.width = 1800;
    frontCanvas.height = 1200;
}

/* ==========================================
   UI SETUP
========================================== */

hidden("cardUploads", !(isCard || isPVC));
hidden("backBox", !(isCard || isPVC));
hidden("photoControls", isPDF);
hidden("pdfControls", !isPDF);
hidden("pdfAction", !isPDF);
hidden("exportButton", isPDF);

if ($("printButton")) {
    $("printButton").textContent = isPDF ? "Print PDF" : "Print";
}

if ($("fileInput")) {
    $("fileInput").accept = isPDF
        ? ".pdf,application/pdf"
        : "image/*";

    $("fileInput").multiple =
        isPDF
            ? service === "pdf-merge"
            : isSheet;
}

/* ==========================================
   IMAGE LOADING
========================================== */

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image Load Failed"));
        };

        img.src = url;
    });
}

/* ==========================================
   DRAW IMAGE
========================================== */

function drawSingle(canvas, ctx, img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!img) return;

    const rad = angle * Math.PI / 180;

    const rotatedWidth =
        Math.abs(Math.cos(rad)) * img.width +
        Math.abs(Math.sin(rad)) * img.height;

    const rotatedHeight =
        Math.abs(Math.sin(rad)) * img.width +
        Math.abs(Math.cos(rad)) * img.height;

    let scale = fit === "cover"
        ? Math.max(
            canvas.width / rotatedWidth,
            canvas.height / rotatedHeight
        )
        : Math.min(
            canvas.width / rotatedWidth,
            canvas.height / rotatedHeight
        );

    scale *= zoom;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);

    ctx.drawImage(
        img,
        -img.width * scale / 2,
        -img.height * scale / 2,
        img.width * scale,
        img.height * scale
    );

    ctx.restore();
}

/* ==========================================
   PHOTO SHEET 4x6 / 8 PHOTOS
========================================== */

function drawCover(ctx, img, x, y, width, height) {
    const scale = Math.max(
        width / img.width,
        height / img.height
    );

    const sw = width / scale;
    const sh = height / scale;

    ctx.drawImage(
        img,
        (img.width - sw) / 2,
        (img.height - sh) / 2,
        sw,
        sh,
        x,
        y,
        width,
        height
    );
}

function drawSheet() {
    frontCtx.fillStyle = "#ffffff";
    frontCtx.fillRect(0, 0, 1800, 1200);

    const photoW = 413;
    const photoH = 531;
    const gapX = 18;
    const gapY = 25;

    const startX = (1800 - (4 * photoW + 3 * gapX)) / 2;
    const startY = (1200 - (2 * photoH + gapY)) / 2;

    files.images.slice(0, 8).forEach((img, index) => {
        const col = index % 4;
        const row = Math.floor(index / 4);

        const x = startX + col * (photoW + gapX);
        const y = startY + row * (photoH + gapY);

        drawCover(frontCtx, img, x, y, photoW, photoH);

        frontCtx.strokeStyle = "#cccccc";
        frontCtx.lineWidth = 2;
        frontCtx.strokeRect(x, y, photoW, photoH);
    });
}

/* ==========================================
   REDRAW
========================================== */

function drawAll() {
    if (isSheet) {
        drawSheet();
        if ($("frontEmpty")) {
            $("frontEmpty").hidden = files.images.length > 0;
        }
        return;
    }

    drawSingle(frontCanvas, frontCtx, files.front);
    drawSingle(backCanvas, backCtx, files.back);

    if ($("frontEmpty")) {
        $("frontEmpty").hidden = !!files.front;
    }

    if ($("backEmpty")) {
        $("backEmpty").hidden = !!files.back;
    }
}

/* ==========================================
   FRONT / BACK UPLOAD
========================================== */

async function loadSide(side, file) {
    if (!file) return;

    if (!validImage(file)) {
        alert("कृपया JPG या PNG Image चुनें।");
        return;
    }

    try {
        files[side] = await loadImage(file);
        drawAll();
        message(side.toUpperCase() + " Image Upload हो गई।");
    } catch (error) {
        alert(error.message);
    }
}

if ($("frontFile")) {
    $("frontFile").addEventListener("change", e => {
        loadSide("front", e.target.files[0]);
    });
}

if ($("backFile")) {
    $("backFile").addEventListener("change", e => {
        loadSide("back", e.target.files[0]);
    });
}

/* ==========================================
   MAIN UPLOAD
========================================== */

if ($("fileInput")) {
    $("fileInput").addEventListener("change", async e => {
        const selected = Array.from(e.target.files || []);

        if (!selected.length) return;

        try {
            if (isPDF) {
                const pdfFiles = selected.filter(validPDF);

                if (!pdfFiles.length) {
                    throw new Error("PDF File चुनें।");
                }

                if (service === "pdf-merge" && pdfFiles.length < 2) {
                    throw new Error("Merge के लिए कम से कम 2 PDF चुनें।");
                }

                files.pdfFiles = pdfFiles;
                files.pdf = await pdfFiles[0].arrayBuffer();

                const pdf = await PDFLib().PDFDocument.load(files.pdf);

                if ($("pdfInfo")) {
                    $("pdfInfo").textContent =
                        "Pages: " + pdf.getPageCount() +
                        " | PDF Files: " + pdfFiles.length;
                }

                value("startPage", 1);
                value("endPage", pdf.getPageCount());
                value("pdfPage", 1);

                message("PDF Upload सफल हुआ।");
                return;
            }

            const imageFiles = selected.filter(validImage);

            if (!imageFiles.length) {
                throw new Error("Image File चुनें।");
            }

            if (isSheet) {
                if (imageFiles.length > 8) {
                    throw new Error("अधिकतम 8 Photos Upload कर सकते हैं।");
                }

                files.images = await Promise.all(
                    imageFiles.map(loadImage)
                );

                drawAll();
                message(files.images.length + " Photos Loaded");
                return;
            }

            files.images = await Promise.all(
                imageFiles.map(loadImage)
            );

            files.front = files.images[0];
            drawAll();
            message("Image Upload सफल हुआ।");

        } catch (error) {
            message(error.message);
            alert(error.message);
        }
    });
}

/* ==========================================
   ROTATE / ZOOM / FIT
========================================== */

function updateRotate() {
    angle = ((angle % 360) + 360) % 360;
    value("rotate", angle);

    if ($("angleText")) {
        $("angleText").textContent = angle + "°";
    }

    drawAll();
}

function rotateLeft() {
    angle -= 90;
    updateRotate();
}

function rotateRight() {
    angle += 90;
    updateRotate();
}

if ($("rotate")) {
    $("rotate").addEventListener("input", e => {
        angle = Number(e.target.value);
        updateRotate();
    });
}

if ($("zoom")) {
    $("zoom").addEventListener("input", e => {
        zoom = Number(e.target.value) / 100;
        drawAll();
    });
}

if ($("fitMode")) {
    $("fitMode").addEventListener("change", e => {
        fit = e.target.value;
        drawAll();
    });
}

/* ==========================================
   RESET
========================================== */

function resetEditor() {
    angle = 0;
    zoom = 1;
    fit = "contain";

    value("rotate", 0);
    value("zoom", 100);
    value("fitMode", "contain");

    if ($("angleText")) {
        $("angleText").textContent = "0°";
    }

    drawAll();
    message("Editor Reset हो गया।");
}

/* ==========================================
   BLOB / DOWNLOAD
========================================== */

function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error("Image Export Failed"));
        }, "image/png");
    });
}

async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = safeFilename(filename);

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/* ==========================================
   SERVER API / BILLING
========================================== */

async function apiJSON(url, data) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Server से सही Response नहीं मिला।");
    }

    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Server Error");
    }

    return result;
}

async function billSuccessfulExport(blob, filename) {
    if (!service) {
        throw new Error("Service ID नहीं मिला।");
    }

    message("Wallet Billing शुरू हो रही है...");

    const job = await apiJSON("/api/start-job", {
        service: service
    });

    if (!job.job_token) {
        throw new Error("Job Token नहीं मिला।");
    }

    let completed = false;

    try {
        const result = await apiJSON("/api/complete-job", {
            job_token: job.job_token
        });

        completed = true;

        await downloadBlob(blob, filename);

        message(
            "Export सफल! Charge ₹" +
            Number(result.charged).toFixed(2) +
            " | Balance ₹" +
            Number(result.balance).toFixed(2)
        );

        return result;

    } catch (error) {
        if (!completed) {
            try {
                await fetch("/api/cancel-job", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        job_token: job.job_token
                    })
                });
            } catch (cancelError) {
                console.error(cancelError);
            }
        }

        throw error;
    }
}

/* ==========================================
   CARD / PVC PDF EXPORT
========================================== */

async function exportCardPDF() {
    const PDF = PDFLib();

    if (!files.front && !files.back) {
        throw new Error("Front या Back Image Upload करें।");
    }

    const pdf = await PDF.PDFDocument.create();

    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const cardWidth = isPVC ? 277.8 : 425.2;
    const cardHeight = isPVC ? 153.1 : 283.46;

    const page = pdf.addPage([pageWidth, pageHeight]);

    async function addCard(img, y) {
        if (!img) return;

        const blob = await canvasBlob(
            img === files.front ? frontCanvas : backCanvas
        );

        const embedded = await pdf.embedPng(
            await blob.arrayBuffer()
        );

        page.drawImage(embedded, {
            x: (pageWidth - cardWidth) / 2,
            y: y,
            width: cardWidth,
            height: cardHeight
        });
    }

    if (files.front) {
        await addCard(files.front, 500);
    }

    if (files.back) {
        await addCard(files.back, 230);
    }

    const bytes = await pdf.save();

    const blob = new Blob([bytes], {
        type: "application/pdf"
    });

    await billSuccessfulExport(
        blob,
        isPVC ? "pvc-card.pdf" : "card-print.pdf"
    );
}

/* ==========================================
   IMAGE EXPORT
========================================== */

async function exportImage() {
    try {
        if (isPDF) {
            throw new Error("PDF के लिए Process PDF बटन इस्तेमाल करें।");
        }

        if (isCard || isPVC) {
            await exportCardPDF();
            return;
        }

        if (isSheet && !files.images.length) {
            throw new Error("Photos Upload करें।");
        }

        if (!isSheet && !files.front) {
            throw new Error("पहले Image Upload करें।");
        }

        const blob = await canvasBlob(frontCanvas);

        let filename = "photo-print.png";

        if (isSheet) filename = "4x6-photo-sheet.png";
        if (isPassport) filename = "passport-photo.png";
        if (isPVC) filename = "pvc-card.png";

        await billSuccessfulExport(blob, filename);

    } catch (error) {
        message(error.message);
        alert(error.message);
    }
}

/* ==========================================
   PDF MERGE
========================================== */

async function mergePDF() {
    const PDF = PDFLib();

    if (files.pdfFiles.length < 2) {
        throw new Error("कम से कम 2 PDF Upload करें।");
    }

    const merged = await PDF.PDFDocument.create();

    for (const file of files.pdfFiles) {
        const doc = await PDF.PDFDocument.load(
            await file.arrayBuffer()
        );

        const pages = await merged.copyPages(
            doc,
            doc.getPageIndices()
        );

        pages.forEach(page => merged.addPage(page));
    }

    return merged.save();
}

/* ==========================================
   PDF SPLIT
========================================== */

async function splitPDF(pdf) {
    const PDF = PDFLib();

    const start = Number($("startPage").value);
    const end = Number($("endPage").value);
    const count = pdf.getPageCount();

    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start ||
        end > count
    ) {
        throw new Error("Page Range सही भरें।");
    }

    const result = await PDF.PDFDocument.create();

    const indexes = Array.from(
        { length: end - start + 1 },
        (_, i) => start - 1 + i
    );

    const pages = await result.copyPages(pdf, indexes);
    pages.forEach(page => result.addPage(page));

    return result.save();
}

/* ==========================================
   PDF ROTATE
========================================== */

async function rotatePDF(pdf) {
    const PDF = PDFLib();

    const pageNo = Number($("pdfPage").value);

    if (
        !Number.isInteger(pageNo) ||
        pageNo < 1 ||
        pageNo > pdf.getPageCount()
    ) {
        throw new Error("Page Number सही भरें।");
    }

    const page = pdf.getPages()[pageNo - 1];

    page.setRotation(
        PDF.degrees((page.getRotation().angle + 90) % 360)
    );

    return pdf.save();
}

/* ==========================================
   PDF COMPRESS
========================================== */

async function compressPDF(pdf) {
    return pdf.save({
        useObjectStreams: true
    });
}

/* ==========================================
   PDF PROCESS
========================================== */

async function processPDF() {
    if (!files.pdf) {
        alert("पहले PDF Upload करें।");
        return;
    }

    try {
        message("PDF Processing हो रही है...");

        const PDF = PDFLib();

        const pdf = await PDF.PDFDocument.load(files.pdf);

        let output;
        let filename;

        switch (service) {
            case "pdf-merge":
                output = await mergePDF();
                filename = "merged-document.pdf";
                break;

            case "pdf-split":
                output = await splitPDF(pdf);
                filename = "split-document.pdf";
                break;

            case "pdf-rotate":
                output = await rotatePDF(pdf);
                filename = "rotated-document.pdf";
                break;

            case "pdf-compress":
                output = await compressPDF(pdf);
                filename = "compressed-document.pdf";
                break;

            case "pdf-print":
                openPDFPrint(files.pdf);
                return;

            default:
                throw new Error("PDF Service उपलब्ध नहीं है।");
        }

        const blob = new Blob([output], {
            type: "application/pdf"
        });

        await billSuccessfulExport(blob, filename);

    } catch (error) {
        message(error.message);
        alert(error.message);
    }
}

/* ==========================================
   PDF PRINT
========================================== */

function openPDFPrint(bytes) {
    const blob = new Blob([bytes], {
        type: "application/pdf"
    });

    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");

    if (!win) {
        URL.revokeObjectURL(url);
        throw new Error("Browser में Pop-up Allow करें।");
    }

    message("PDF Print Preview खुल गई है।");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ==========================================
   PRINT
========================================== */

function printEditor() {
    if (isPDF) {
        if (!files.pdf) {
            alert("पहले PDF Upload करें।");
            return;
        }

        openPDFPrint(files.pdf);
        return;
    }

    if (isCard || isPVC) {
        if (!files.front && !files.back) {
            alert("Card Image Upload करें।");
            return;
        }
    } else if (isSheet ? !files.images.length : !files.front) {
        alert("पहले Image Upload करें।");
        return;
    }

    window.print();
}

/* ==========================================
   PREVIEW DOWNLOAD DISABLED
   All downloads must use paid export.
========================================== */

function downloadPreview() {
    alert("Free Preview उपलब्ध है। File Download के लिए Export इस्तेमाल करें।");
}

/* ==========================================
   GLOBAL BUTTON FUNCTIONS
========================================== */

window.resetEditor = resetEditor;
window.rotateLeft = rotateLeft;
window.rotateRight = rotateRight;
window.exportImage = exportImage;
window.processPDF = processPDF;
window.printEditor = printEditor;
window.downloadPreview = downloadPreview;

/* ==========================================
   START
========================================== */

drawAll();
message("Shree Karni Auto Print Editor Ready");

console.log("Editor Loaded:", service);
