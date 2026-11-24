
"use strict";

/* =====================================================
   SHREE KARNI AUTO PRINT V3
   COMPLETE PHOTO + CARD + PDF EDITOR
===================================================== */

const $ = id => document.getElementById(id);

const SERVICE = String(window.SK_SERVICE || "");
const PRICE = 1;

const files = {
    front: null,
    back: null,
    images: [],
    pdfFiles: [],
    pdfBytes: null
};

let angle = 0;
let zoom = 1;
let fitMode = "contain";
let busy = false;

const frontCanvas = $("frontCanvas");
const backCanvas = $("backCanvas");

if (!frontCanvas || !backCanvas) {
    throw new Error("Front या Back Canvas HTML में नहीं मिला।");
}

const frontCtx = frontCanvas.getContext("2d");
const backCtx = backCanvas.getContext("2d");

const isCard = SERVICE === "card-print";
const isPVC = SERVICE === "pvc";
const isSheet = SERVICE === "photo-sheet";
const isPassport = SERVICE === "passport";
const isPDF = SERVICE.startsWith("pdf-");

/* =====================================================
   MESSAGE
===================================================== */

function message(text) {
    const el = $("editorMessage");
    if (el) el.textContent = text;
}

function showError(error) {
    const msg = error?.message || String(error);
    message("Error: " + msg);
    alert(msg);
}

function setValue(id, val) {
    const el = $(id);
    if (el) el.value = val;
}

function setHidden(id, hidden) {
    const el = $(id);
    if (el) el.hidden = hidden;
}

/* =====================================================
   CANVAS CONFIGURATION
===================================================== */

function configureCanvas() {

    if (isPVC) {
        frontCanvas.width = backCanvas.width = 1160;
        frontCanvas.height = backCanvas.height = 638;
    }

    else if (isCard) {
        frontCanvas.width = backCanvas.width = 1200;
        frontCanvas.height = backCanvas.height = 800;
    }

    else if (isPassport) {
        frontCanvas.width = 413;
        frontCanvas.height = 531;
    }

    else if (isSheet || SERVICE === "photo") {
        frontCanvas.width = 1800;
        frontCanvas.height = 1200;
    }

    else {
        frontCanvas.width = 1200;
        frontCanvas.height = 800;
    }
}

configureCanvas();

/* =====================================================
   PDF LIBRARY
===================================================== */

function getPDFLib() {

    if (!window.PDFLib) {
        throw new Error(
            "PDF Library Load नहीं हुई। Internet या PDF Script जाँचें।"
        );
    }

    return window.PDFLib;
}

/* =====================================================
   UI SETUP
===================================================== */

function createDynamicControls() {

    const panel = document.querySelector(
        ".editor-grid .panel"
    );

    if (!panel) return;

    if (isSheet) {
        const input = $("frontFile");

        if (input) {
            input.multiple = true;
            input.accept = "image/*";
        }
    }

    if (isPDF) {

        const input = $("frontFile");

        if (input) {
            input.accept = ".pdf,application/pdf";
            input.multiple = SERVICE === "pdf-merge";
        }

        const controls = document.createElement("div");

        controls.id = "pdfDynamicControls";

        controls.innerHTML = `
            <hr>

            <h3>PDF Settings</h3>

            <label>Start Page</label>
            <input id="startPage"
                   type="number"
                   min="1"
                   value="1">

            <label>End Page</label>
            <input id="endPage"
                   type="number"
                   min="1"
                   value="1">

            <label>Rotate Page Number</label>
            <input id="pdfPage"
                   type="number"
                   min="1"
                   value="1">

            <p id="pdfInfo">PDF Upload करें।</p>

            <button type="button" id="pdfProcessButton">
                Process PDF – ₹1
            </button>
        `;

        panel.appendChild(controls);

        $("pdfProcessButton").addEventListener(
            "click",
            processPDF
        );
    }

    if (!isCard && !isPVC) {
        setHidden("backFile", true);
    }
}

/* =====================================================
   FILE VALIDATION
===================================================== */

function validImage(file) {
    return !!file && file.type.startsWith("image/");
}

function validPDF(file) {

    return !!file && (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    );
}

/* =====================================================
   IMAGE LOADING
===================================================== */

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
            reject(new Error("Image Load नहीं हुई।"));
        };

        img.src = url;
    });
}

/* =====================================================
   DRAW SINGLE IMAGE
===================================================== */

function drawImage(canvas, ctx, img) {

    ctx.clearRect(
        0, 0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
        0, 0,
        canvas.width,
        canvas.height
    );

    if (!img) return;

    const rad = angle * Math.PI / 180;

    const rotatedWidth =
        Math.abs(Math.cos(rad)) * img.width +
        Math.abs(Math.sin(rad)) * img.height;

    const rotatedHeight =
        Math.abs(Math.sin(rad)) * img.width +
        Math.abs(Math.cos(rad)) * img.height;

    let scale;

    if (fitMode === "cover") {

        scale = Math.max(
            canvas.width / rotatedWidth,
            canvas.height / rotatedHeight
        );

    } else {

        scale = Math.min(
            canvas.width / rotatedWidth,
            canvas.height / rotatedHeight
        );
    }

    scale *= zoom;

    ctx.save();

    ctx.translate(
        canvas.width / 2,
        canvas.height / 2
    );

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

/* =====================================================
   PHOTO COVER / CROP
===================================================== */

function drawCover(ctx, img, x, y, width, height) {

    const scale = Math.max(
        width / img.width,
        height / img.height
    );

    const sourceWidth = width / scale;
    const sourceHeight = height / scale;

    const sx = (img.width - sourceWidth) / 2;
    const sy = (img.height - sourceHeight) / 2;

    ctx.drawImage(
        img,
        sx,
        sy,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height
    );
}

/* =====================================================
   PHOTO SHEET
   4x6 INCH / 8 PHOTOS
   1 PHOTO = 8 COPIES
===================================================== */

function drawPhotoSheet() {

    const canvasWidth = 1800;
    const canvasHeight = 1200;

    frontCtx.clearRect(
        0, 0,
        canvasWidth,
        canvasHeight
    );

    frontCtx.fillStyle = "#ffffff";

    frontCtx.fillRect(
        0, 0,
        canvasWidth,
        canvasHeight
    );

    if (!files.images.length) return;

    const photoW = 413;
    const photoH = 531;

    const gapX = 18;
    const gapY = 25;

    const startX =
        (canvasWidth - (4 * photoW + 3 * gapX)) / 2;

    const startY =
        (canvasHeight - (2 * photoH + gapY)) / 2;

    for (let i = 0; i < 8; i++) {

        const img =
            files.images[i % files.images.length];

        const col = i % 4;
        const row = Math.floor(i / 4);

        const x = startX + col * (photoW + gapX);
        const y = startY + row * (photoH + gapY);

        drawCover(
            frontCtx,
            img,
            x,
            y,
            photoW,
            photoH
        );

        frontCtx.strokeStyle = "#cccccc";
        frontCtx.lineWidth = 2;

        frontCtx.strokeRect(
            x,
            y,
            photoW,
            photoH
        );
    }
}

/* =====================================================
   LIVE PREVIEW
===================================================== */

function drawAll() {

    if (isSheet) {

        drawPhotoSheet();

    } else {

        drawImage(
            frontCanvas,
            frontCtx,
            files.front
        );

        drawImage(
            backCanvas,
            backCtx,
            files.back
        );
    }

    const frontEmpty = $("frontEmpty");
    const backEmpty = $("backEmpty");

    if (frontEmpty) {
        frontEmpty.hidden = isSheet
            ? files.images.length > 0
            : !!files.front;
    }

    if (backEmpty) {
        backEmpty.hidden =
            !!files.back || !(isCard || isPVC);
    }
}

/* =====================================================
   FRONT / BACK UPLOAD
===================================================== */

async function uploadSide(side, file) {

    if (!file) return;

    if (!validImage(file)) {
        throw new Error("JPG या PNG Image चुनें।");
    }

    files[side] = await loadImage(file);

    drawAll();

    message(
        side.toUpperCase() +
        " Image Preview तैयार है।"
    );
}

/* =====================================================
   MAIN IMAGE UPLOAD
===================================================== */

$("frontFile")?.addEventListener(
    "change",
    async event => {

        const selected = Array.from(
            event.target.files || []
        );

        if (!selected.length) return;

        try {

            if (isPDF) {

                await uploadPDF(selected);
                return;
            }

            if (isSheet) {

                if (selected.length > 8) {
                    throw new Error(
                        "अधिकतम 8 Photos Upload कर सकते हैं।"
                    );
                }

                const valid = selected.filter(validImage);

                if (!valid.length) {
                    throw new Error("Image File चुनें।");
                }

                files.images = await Promise.all(
                    valid.map(loadImage)
                );

                drawAll();

                message(
                    files.images.length +
                    " Photos का Preview तैयार है।"
                );

                return;
            }

            const file = selected[0];

            if (!validImage(file)) {
                throw new Error("सही Image चुनें।");
            }

            files.front = await loadImage(file);

            drawAll();

            message("Photo Upload सफल। Preview तैयार है।");

        } catch (error) {
            showError(error);
        }
    }
);

/* =====================================================
   BACK IMAGE UPLOAD
===================================================== */

$("backFile")?.addEventListener(
    "change",
    async event => {

        try {

            await uploadSide(
                "back",
                event.target.files[0]
            );

        } catch (error) {
            showError(error);
        }
    }
);

/* =====================================================
   PDF UPLOAD
===================================================== */

async function uploadPDF(selected) {

    const valid = selected.filter(validPDF);

    if (!valid.length) {
        throw new Error("PDF File चुनें।");
    }

    if (
        SERVICE === "pdf-merge" &&
        valid.length < 2
    ) {
        throw new Error(
            "PDF Merge के लिए कम से कम 2 PDF चाहिए।"
        );
    }

    files.pdfFiles = valid;

    files.pdfBytes =
        await valid[0].arrayBuffer();

    const PDF = getPDFLib();

    const pdf = await PDF.PDFDocument.load(
        files.pdfBytes.slice(0)
    );

    const pageCount = pdf.getPageCount();

    setValue("startPage", 1);
    setValue("endPage", pageCount);
    setValue("pdfPage", 1);

    const info = $("pdfInfo");

    if (info) {
        info.textContent =
            "Pages: " + pageCount +
            " | PDF Files: " + valid.length;
    }

    message("PDF Upload सफल।");
}

/* =====================================================
   ROTATE / ZOOM / FIT
===================================================== */

function updateRotation() {

    angle = ((angle % 360) + 360) % 360;

    setValue("rotate", angle);

    const text = $("angleText");

    if (text) {
        text.textContent = angle + "°";
    }

    drawAll();
}

function rotateLeft() {
    angle -= 90;
    updateRotation();
}

function rotateRight() {
    angle += 90;
    updateRotation();
}

$("rotate")?.addEventListener(
    "input",
    event => {
        angle = Number(event.target.value);
        updateRotation();
    }
);

$("zoom")?.addEventListener(
    "input",
    event => {
        zoom = Number(event.target.value) / 100;
        drawAll();
    }
);

$("fitMode")?.addEventListener(
    "change",
    event => {
        fitMode = event.target.value;
        drawAll();
    }
);

/* =====================================================
   RESET EDITOR
===================================================== */

function resetEditor() {

    angle = 0;
    zoom = 1;
    fitMode = "contain";

    setValue("rotate", 0);
    setValue("zoom", 100);
    setValue("fitMode", "contain");

    const text = $("angleText");

    if (text) {
        text.textContent = "0°";
    }

    drawAll();

    message("Editor Reset हो गया।");
}

/* =====================================================
   CANVAS EXPORT
===================================================== */

function canvasBlob(canvas) {

    return new Promise((resolve, reject) => {

        canvas.toBlob(
            blob => {

                if (!blob) {
                    reject(
                        new Error("Image Export Failed")
                    );
                    return;
                }

                resolve(blob);
            },
            "image/png"
        );
    });
}

/* =====================================================
   DOWNLOAD
===================================================== */

async function downloadBlob(blob, filename) {

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(
        () => URL.revokeObjectURL(url),
        30000
    );
}

/* =====================================================
   API REQUEST
===================================================== */

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
        throw new Error(
            "Server से सही Response नहीं मिला।"
        );
    }

    if (!response.ok || !result.ok) {
        throw new Error(
            result.message || "Server Error"
        );
    }

    return result;
}

/* =====================================================
   WALLET BILLING
===================================================== */

async function paidExport(blob, filename) {

    if (busy) return;

    if (!SERVICE) {
        throw new Error(
            "Service ID Missing। editor.html जाँचें।"
        );
    }

    busy = true;

    let jobToken = null;
    let charged = false;

    try {

        message("Wallet Balance जाँच रहे हैं...");

        const job = await apiJSON(
            "/api/start-job",
            {
                service: SERVICE
            }
        );

        jobToken = job.job_token;

        if (!jobToken) {
            throw new Error("Job Token नहीं मिला।");
        }

        message("₹1 Billing Process हो रही है...");

        const result = await apiJSON(
            "/api/complete-job",
            {
                job_token: jobToken
            }
        );

        charged = true;

        await downloadBlob(blob, filename);

        message(
            "Export सफल! Charge ₹" +
            Number(result.charged).toFixed(2) +
            " | Balance ₹" +
            Number(result.balance).toFixed(2)
        );

        return result;

    } catch (error) {

        if (jobToken && !charged) {

            try {

                await fetch(
                    "/api/cancel-job",
                    {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            job_token: jobToken
                        })
                    }
                );

            } catch (cancelError) {
                console.error(cancelError);
            }
        }

        throw error;

    } finally {
        busy = false;
    }
}

/* =====================================================
   CARD / PVC PDF EXPORT
===================================================== */

async function exportCardPDF() {

    const PDF = getPDFLib();

    if (!files.front && !files.back) {
        throw new Error("Card Image Upload करें।");
    }

    const pdf = await PDF.PDFDocument.create();

    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const cardWidth = isPVC ? 277.8 : 425.2;
    const cardHeight = isPVC ? 153.1 : 283.46;

    const page = pdf.addPage([
        pageWidth,
        pageHeight
    ]);

    async function addCard(canvas, y) {

        const blob = await canvasBlob(canvas);

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
        await addCard(frontCanvas, 500);
    }

    if (files.back) {
        await addCard(backCanvas, 200);
    }

    const bytes = await pdf.save();

    const blob = new Blob(
        [bytes],
        { type: "application/pdf" }
    );

    await paidExport(
        blob,
        isPVC ? "pvc-card.pdf" : "card-print.pdf"
    );
}

/* =====================================================
   IMAGE EXPORT
===================================================== */

async function exportImage() {

    try {

        if (busy) return;

        if (isPDF) {
            await processPDF();
            return;
        }

        if (isCard || isPVC) {
            await exportCardPDF();
            return;
        }

        if (
            isSheet &&
            !files.images.length
        ) {
            throw new Error("पहले Photos Upload करें।");
        }

        if (
            !isSheet &&
            !files.front
        ) {
            throw new Error("पहले Photo Upload करें।");
        }

        const blob = await canvasBlob(frontCanvas);

        let filename = "photo-print.png";

        if (isSheet) {
            filename = "4x6-photo-sheet.png";
        }

        if (isPassport) {
            filename = "passport-photo.png";
        }

        await paidExport(blob, filename);

    } catch (error) {
        showError(error);
    }
}

/* =====================================================
   PDF MERGE
===================================================== */

async function mergePDF() {

    const PDF = getPDFLib();

    const merged = await PDF.PDFDocument.create();

    for (const file of files.pdfFiles) {

        const doc = await PDF.PDFDocument.load(
            await file.arrayBuffer()
        );

        const pages = await merged.copyPages(
            doc,
            doc.getPageIndices()
        );

        pages.forEach(page => {
            merged.addPage(page);
        });
    }

    return merged.save();
}

/* =====================================================
   PDF SPLIT
===================================================== */

async function splitPDF(pdf) {

    const PDF = getPDFLib();

    const start = Number($("startPage").value);
    const end = Number($("endPage").value);

    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start ||
        end > pdf.getPageCount()
    ) {
        throw new Error("Page Range सही भरें।");
    }

    const result = await PDF.PDFDocument.create();

    const indexes = Array.from(
        { length: end - start + 1 },
        (_, i) => start - 1 + i
    );

    const pages = await result.copyPages(
        pdf,
        indexes
    );

    pages.forEach(page => {
        result.addPage(page);
    });

    return result.save();
}

/* =====================================================
   PDF ROTATE
===================================================== */

async function rotatePDF(pdf) {

    const PDF = getPDFLib();

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
        PDF.degrees(
            (page.getRotation().angle + 90) % 360
        )
    );

    return pdf.save();
}

/* =====================================================
   PDF COMPRESS
===================================================== */

async function compressPDF(pdf) {

    return pdf.save({
        useObjectStreams: true
    });
}

/* =====================================================
   PDF PRINT
===================================================== */

async function printPDFPaid() {

    const blob = new Blob(
        [files.pdfBytes],
        { type: "application/pdf" }
    );

    await paidExport(
        blob,
        "print-document.pdf"
    );
}

/* =====================================================
   PDF PROCESS
===================================================== */

async function processPDF() {

    if (busy) return;

    if (!files.pdfBytes) {
        throw new Error("पहले PDF Upload करें।");
    }

    try {

        message("PDF Processing हो रही है...");

        const PDF = getPDFLib();

        let output;
        let filename;

        if (SERVICE === "pdf-merge") {

            output = await mergePDF();

            filename = "merged-document.pdf";

        } else {

            const pdf = await PDF.PDFDocument.load(
                files.pdfBytes.slice(0)
            );

            switch (SERVICE) {

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

                    await printPDFPaid();

                    return;

                default:

                    throw new Error(
                        "PDF Service उपलब्ध नहीं है।"
                    );
            }
        }

        const blob = new Blob(
            [output],
            { type: "application/pdf" }
        );

        await paidExport(blob, filename);

    } catch (error) {
        showError(error);
    }
}

/* =====================================================
   PRINT BUTTON
===================================================== */

async function printPaid() {
    await exportImage();
}

async function printEditor() {
    await exportImage();
}

/* =====================================================
   PREVIEW DOWNLOAD
===================================================== */

function downloadPreview() {

    alert(
        "Preview मुफ्त है। Download के लिए Export इस्तेमाल करें।"
    );
}

/* =====================================================
   GLOBAL FUNCTIONS
===================================================== */

window.resetEditor = resetEditor;

window.rotateLeft = rotateLeft;

window.rotateRight = rotateRight;

window.exportImage = exportImage;

window.processPDF = processPDF;

window.printEditor = printEditor;

window.printPaid = printPaid;

window.downloadPreview = downloadPreview;

/* =====================================================
   INITIALIZE
===================================================== */

createDynamicControls();

drawAll();

message(
    "Shree Karni Auto Print Ready | Service: " +
    (SERVICE || "Not Detected")
);

console.log(
    "Shree Karni Auto Print V3 Loaded:",
    SERVICE
);
