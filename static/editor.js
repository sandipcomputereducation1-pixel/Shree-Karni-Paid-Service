
"use strict";

/* ==========================================
   SHREE KARNI AUTO PRINT
   COMPLETE PHOTO + CARD + PDF EDITOR
========================================== */

const service = window.SK_SERVICE || "";

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
    throw new Error("Editor Canvas HTML में नहीं मिला।");
}

const frontCtx = frontCanvas.getContext("2d");
const backCtx = backCanvas.getContext("2d");

let angle = 0;
let zoom = 1;
let fit = "contain";
let activeSide = "front";

const isCard = service === "card-print";
const isPDF = service.startsWith("pdf-");
const isSheet = service === "photo-sheet";
const isPVC = service === "pvc";
const isPassport = service === "passport";

const PDF_SIZE = {
    A4_WIDTH: 595.28,
    A4_HEIGHT: 841.89,
    CARD_WIDTH: 425.2,
    CARD_HEIGHT: 283.46
};

/* ==========================================
   INITIAL SETUP
========================================== */

function setHidden(id, value) {
    const el = $(id);
    if (el) el.hidden = value;
}

function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value;
}

function message(text) {
    const el = $("editorMessage");
    if (el) el.textContent = text;
}

function requirePDFLib() {
    if (!window.PDFLib) {
        throw new Error("PDF Library Load नहीं हुई। Internet चेक करें।");
    }
    return window.PDFLib;
}

if (!isCard) {
    setHidden("cardUploads", true);
    setHidden("backBox", true);
}

if (isPDF) {
    setHidden("photoControls", true);
    setHidden("pdfControls", false);
    setHidden("pdfAction", false);
    setHidden("exportButton", true);

    if ($("printButton")) {
        $("printButton").textContent = "Print PDF";
    }

    if ($("fileInput")) {
        $("fileInput").accept = ".pdf,application/pdf";
        $("fileInput").multiple = service === "pdf-merge";
    }
}

/* Canvas Dimensions */

if (isPVC) {
    frontCanvas.width = 1160;
    frontCanvas.height = 638;
}

if (isPassport) {
    frontCanvas.width = 413;
    frontCanvas.height = 531;
}

if (isSheet) {
    // 4 x 6 inch at 300 DPI
    frontCanvas.width = 1800;
    frontCanvas.height = 1200;
}

if (isCard) {
    frontCanvas.width = 1200;
    frontCanvas.height = 800;

    backCanvas.width = 1200;
    backCanvas.height = 800;

    setHidden("backBox", false);

    frontCanvas.style.width = "100%";
    backCanvas.style.width = "100%";
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

function validImage(file) {
    return file && file.type.startsWith("image/");
}

/* ==========================================
   IMAGE DRAWING
========================================== */

function drawSingle(canvas, ctx, img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!img) return;

    ctx.save();

    ctx.translate(
        canvas.width / 2,
        canvas.height / 2
    );

    ctx.rotate(angle * Math.PI / 180);

    const rad = angle * Math.PI / 180;

    const rw =
        Math.abs(Math.cos(rad)) * img.width +
        Math.abs(Math.sin(rad)) * img.height;

    const rh =
        Math.abs(Math.sin(rad)) * img.width +
        Math.abs(Math.cos(rad)) * img.height;

    let scale;

    if (fit === "cover") {
        scale = Math.max(
            canvas.width / rw,
            canvas.height / rh
        );
    } else {
        scale = Math.min(
            canvas.width / rw,
            canvas.height / rh
        );
    }

    scale *= zoom;

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
   PASSPORT PHOTO SHEET
   4 x 6 INCH / 8 PHOTOS
========================================== */

function drawCover(ctx, img, x, y, width, height) {
    const scale = Math.max(
        width / img.width,
        height / img.height
    );

    const sw = width / scale;
    const sh = height / scale;

    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;

    ctx.drawImage(
        img,
        sx, sy, sw, sh,
        x, y, width, height
    );
}

function drawSheet() {
    frontCtx.fillStyle = "#ffffff";

    frontCtx.fillRect(
        0, 0,
        frontCanvas.width,
        frontCanvas.height
    );

    if (!files.images.length) return;

    // 35 x 45 mm photo at 300 DPI
    const photoW = 413;
    const photoH = 531;

    // 4 columns x 2 rows
    const columns = 4;
    const rows = 2;

    const gapX = 18;
    const gapY = 25;

    const totalW = columns * photoW +
        (columns - 1) * gapX;

    const totalH = rows * photoH +
        (rows - 1) * gapY;

    const startX = (frontCanvas.width - totalW) / 2;
    const startY = (frontCanvas.height - totalH) / 2;

    files.images.slice(0, 8).forEach((img, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);

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
            x, y,
            photoW,
            photoH
        );
    });
}

/* ==========================================
   REDRAW
========================================== */

function drawAll() {
    if (isSheet) {
        drawSheet();
        return;
    }

    drawSingle(
        frontCanvas,
        frontCtx,
        files.front
    );

    drawSingle(
        backCanvas,
        backCtx,
        files.back
    );

    if ($("frontEmpty")) {
        $("frontEmpty").hidden = !!files.front;
    }

    if ($("backEmpty")) {
        $("backEmpty").hidden = !!files.back;
    }
}

/* ==========================================
   FRONT / BACK IMAGE UPLOAD
========================================== */

async function load(side, file) {
    if (!file) return;

    if (!validImage(file)) {
        alert("कृपया Image File चुनें।");
        return;
    }

    try {
        const img = await loadImage(file);

        files[side] = img;

        drawAll();

        setHidden(side + "Empty", true);

        message(
            side.toUpperCase() +
            " Image सफलतापूर्वक Upload हुई।"
        );

    } catch (error) {
        alert("Image Load नहीं हुई।");
    }
}

if ($("frontFile")) {
    $("frontFile").addEventListener("change", e => {
        load("front", e.target.files[0]);
    });
}

if ($("backFile")) {
    $("backFile").addEventListener("change", e => {
        load("back", e.target.files[0]);
    });
}

/* ==========================================
   MAIN FILE UPLOAD
========================================== */

if ($("fileInput")) {
    $("fileInput").addEventListener("change", async e => {
        const selected = Array.from(
            e.target.files || []
        );

        if (!selected.length) return;

        try {
            if (isPDF) {
                const PDFLib = requirePDFLib();

                const pdfFiles = selected.filter(file =>
                    file.type === "application/pdf" ||
                    file.name.toLowerCase().endsWith(".pdf")
                );

                if (!pdfFiles.length) {
                    throw new Error("PDF File चुनें।");
                }

                if (service === "pdf-merge" &&
                    pdfFiles.length < 2) {
                    throw new Error(
                        "Merge के लिए कम से कम 2 PDF Upload करें।"
                    );
                }

                files.pdfFiles = pdfFiles;

                files.pdf = await pdfFiles[0].arrayBuffer();

                const pdf = await PDFLib.PDFDocument.load(
                    files.pdf
                );

                if ($("pdfInfo")) {
                    $("pdfInfo").textContent =
                        "PDF Pages: " + pdf.getPageCount() +
                        " | Files: " + pdfFiles.length;
                }

                setValue("startPage", 1);
                setValue("endPage", pdf.getPageCount());
                setValue("pdfPage", 1);

                if ($("endPage")) {
                    $("endPage").max = pdf.getPageCount();
                }

                if ($("pdfPage")) {
                    $("pdfPage").max = pdf.getPageCount();
                }

                message("PDF सफलतापूर्वक Load हो गई।");
                return;
            }

            const imageFiles = selected.filter(validImage);

            if (!imageFiles.length) {
                throw new Error("Image File चुनें।");
            }

            files.images = await Promise.all(
                imageFiles.map(loadImage)
            );

            if (isSheet) {
                files.images = files.images.slice(0, 8);

                drawSheet();

                setHidden("frontEmpty", true);

                message(
                    files.images.length +
                    " Photos Loaded"
                );

            } else {
                files.front = files.images[0];

                drawAll();

                setHidden("frontEmpty", true);

                message("Image Successfully Loaded");
            }

        } catch (error) {
            alert(error.message || "File Load नहीं हुई।");
            message(error.message);
        }
    });
}

/* ==========================================
   ROTATE / ZOOM / FIT
========================================== */

if ($("rotate")) {
    $("rotate").addEventListener("input", e => {
        angle = Number(e.target.value);

        if ($("angleText")) {
            $("angleText").textContent =
                angle + "°";
        }

        drawAll();
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
   EDITOR RESET
========================================== */

function resetEditor() {
    angle = 0;
    zoom = 1;
    fit = "contain";

    setValue("rotate", 0);
    setValue("zoom", 100);
    setValue("fitMode", "contain");

    if ($("angleText")) {
        $("angleText").textContent = "0°";
    }

    drawAll();

    message("Editor Reset हो गया।");
}

/* ==========================================
   ROTATE QUICK BUTTONS
========================================== */

function rotateLeft() {
    angle -= 90;
    updateRotate();
}

function rotateRight() {
    angle += 90;
    updateRotate();
}

function updateRotate() {
    angle = ((angle % 360) + 360) % 360;

    setValue("rotate", angle);

    if ($("angleText")) {
        $("angleText").textContent =
            angle + "°";
    }

    drawAll();
}

/* ==========================================
   CANVAS EXPORT
========================================== */

function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("Image Export Failed"));
            }
        }, "image/png");
    });
}

async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();
    a.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 10000);
}

/* ==========================================
   SERVER BILLING
========================================== */

async function apiJSON(url, data) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Server Response सही नहीं है।");
    }

    if (!response.ok || !result.ok) {
        throw new Error(
            result.message || "Server Error"
        );
    }

    return result;
}

async function billSuccessfulExport(blob, filename) {
    if (!service) {
        throw new Error("Service ID नहीं मिला।");
    }

    message("Billing Process शुरू हो रही है...");

    let job = null;

    try {
        job = await apiJSON(
            "/api/start-job",
            { service }
        );

        const result = await apiJSON(
            "/api/complete-job",
            {
                job_token: job.job_token
            }
        );

        await downloadBlob(blob, filename);

        message(
            "Export तैयार हुआ। ₹" +
            Number(result.charged).toFixed(2) +
            " Charge हुआ। Wallet: ₹" +
            Number(result.balance).toFixed(2)
        );

        return result;

    } catch (error) {
        if (job && job.job_token) {
            try {
                await fetch("/api/cancel-job", {
                    method: "POST",
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
   CARD FRONT + BACK PDF EXPORT
========================================== */

async function exportCard() {
    const PDFLib = requirePDFLib();

    if (!files.front && !files.back) {
        throw new Error(
            "पहले Front या Back Image Upload करें।"
        );
    }

    const pdf = await PDFLib.PDFDocument.create();

    const page = pdf.addPage([
        PDF_SIZE.A4_WIDTH,
        PDF_SIZE.A4_HEIGHT
    ]);

    const cardW = PDF_SIZE.CARD_WIDTH;
    const cardH = PDF_SIZE.CARD_HEIGHT;

    if (files.front) {
        const blob = await canvasBlob(frontCanvas);

        const image = await pdf.embedPng(
            await blob.arrayBuffer()
        );

        page.drawImage(image, {
            x: 85,
            y: PDF_SIZE.A4_HEIGHT - 100 - cardH,
            width: cardW,
            height: cardH
        });
    }

    if (files.back) {
        const blob = await canvasBlob(backCanvas);

        const image = await pdf.embedPng(
            await blob.arrayBuffer()
        );

        page.drawImage(image, {
            x: 85,
            y: PDF_SIZE.A4_HEIGHT - 430 - cardH,
            width: cardW,
            height: cardH
        });
    }

    const output = await pdf.save();

    const blob = new Blob(
        [output],
        { type: "application/pdf" }
    );

    await billSuccessfulExport(
        blob,
        "card-print.pdf"
    );
}

/* ==========================================
   IMAGE EXPORT
========================================== */

async function exportImage() {
    try {
        if (isPDF) {
            throw new Error(
                "PDF Service के लिए PDF Process बटन इस्तेमाल करें।"
            );
        }

        if (isCard) {
            await exportCard();
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

        if (isSheet) {
            filename = "4x6-eight-photos.png";
        } else if (isPassport) {
            filename = "passport-photo.png";
        } else if (isPVC) {
            filename = "pvc-card.png";
        }

        await billSuccessfulExport(
            blob,
            filename
        );

    } catch (error) {
        message(error.message);
        alert(error.message);
    }
}

/* ==========================================
   PDF MERGE
========================================== */

async function mergePDF() {
    const PDFLib = requirePDFLib();

    if (files.pdfFiles.length < 2) {
        throw new Error(
            "कम से कम 2 PDF Upload करें।"
        );
    }

    const merged = await PDFLib.PDFDocument.create();

    for (const file of files.pdfFiles) {
        const bytes = await file.arrayBuffer();

        const doc = await PDFLib.PDFDocument.load(bytes);

        const pages = await merged.copyPages(
            doc,
            doc.getPageIndices()
        );

        pages.forEach(page => {
            merged.addPage(page);
        });
    }

    return await merged.save();
}

/* ==========================================
   PDF SPLIT
========================================== */

async function splitPDF(pdf) {
    const PDFLib = requirePDFLib();

    const count = pdf.getPageCount();

    const start = Number($("startPage").value);
    const end = Number($("endPage").value);

    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start ||
        end > count
    ) {
        throw new Error("Page Range सही भरें।");
    }

    const split = await PDFLib.PDFDocument.create();

    const indexes = Array.from(
        { length: end - start + 1 },
        (_, i) => start - 1 + i
    );

    const pages = await split.copyPages(
        pdf,
        indexes
    );

    pages.forEach(page => split.addPage(page));

    return await split.save();
}

/* ==========================================
   PDF ROTATE
========================================== */

async function rotatePDF(pdf) {
    const PDFLib = requirePDFLib();

    const count = pdf.getPageCount();

    const pageNo = Number($("pdfPage").value);

    if (
        !Number.isInteger(pageNo) ||
        pageNo < 1 ||
        pageNo > count
    ) {
        throw new Error("Page Number सही भरें।");
    }

    const page = pdf.getPages()[pageNo - 1];

    page.setRotation(
        PDFLib.degrees(
            (page.getRotation().angle + 90) % 360
        )
    );

    return await pdf.save();
}

/* ==========================================
   PDF COMPRESS
========================================== */

async function compressPDF(pdf) {
    return await pdf.save({
        useObjectStreams: true
    });
}

/* ==========================================
   PDF PRINT
========================================== */

function openPDFPrint(bytes) {
    const blob = new Blob(
        [bytes],
        { type: "application/pdf" }
    );

    const url = URL.createObjectURL(blob);

    const win = window.open(url, "_blank");

    if (!win) {
        URL.revokeObjectURL(url);

        throw new Error(
            "Browser में Pop-up Allow करें।"
        );
    }

    message("PDF Print Preview खुल गई है।");

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 60000);
}

/* ==========================================
   MAIN PDF PROCESS
========================================== */

async function processPDF() {
    if (!files.pdf) {
        alert("पहले PDF Upload करें।");
        return;
    }

    try {
        const PDFLib = requirePDFLib();

        message("PDF Processing हो रही है...");

        const pdf = await PDFLib.PDFDocument.load(
            files.pdf
        );

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
                throw new Error(
                    "यह PDF Tool उपलब्ध नहीं है।"
                );
        }

        const blob = new Blob(
            [output],
            { type: "application/pdf" }
        );

        await billSuccessfulExport(
            blob,
            filename
        );

    } catch (error) {
        alert(error.message || "PDF Process Failed");

        message(error.message);
    }
}

/* ==========================================
   DIRECT PRINT
========================================== */

function printEditor() {
    if (isPDF) {
        if (!files.pdf) {
            alert("पहले PDF Upload करें।");
            return;
        }

        try {
            openPDFPrint(files.pdf);
        } catch (error) {
            alert(error.message);
        }

        return;
    }

    if (isCard) {
        if (!files.front && !files.back) {
            alert("Card Image Upload करें।");
            return;
        }
    } else if (
        isSheet
            ? !files.images.length
            : !files.front
    ) {
        alert("पहले Image Upload करें।");
        return;
    }

    window.print();
}

/* ==========================================
   DOWNLOAD WITHOUT BILLING
========================================== */

async function downloadPreview() {
    try {
        if (isPDF) {
            if (!files.pdf) {
                throw new Error("PDF Upload करें।");
            }

            await downloadBlob(
                new Blob([files.pdf], {
                    type: "application/pdf"
                }),
                "document.pdf"
            );

            return;
        }

        if (isCard) {
            const PDFLib = requirePDFLib();

            const pdf = await PDFLib.PDFDocument.create();

            const page = pdf.addPage([
                PDF_SIZE.A4_WIDTH,
                PDF_SIZE.A4_HEIGHT
            ]);

            if (files.front) {
                const blob = await canvasBlob(frontCanvas);

                const image = await pdf.embedPng(
                    await blob.arrayBuffer()
                );

                page.drawImage(image, {
                    x: 85,
                    y: 458,
                    width: PDF_SIZE.CARD_WIDTH,
                    height: PDF_SIZE.CARD_HEIGHT
                });
            }

            if (files.back) {
                const blob = await canvasBlob(backCanvas);

                const image = await pdf.embedPng(
                    await blob.arrayBuffer()
                );

                page.drawImage(image, {
                    x: 85,
                    y: 128,
                    width: PDF_SIZE.CARD_WIDTH,
                    height: PDF_SIZE.CARD_HEIGHT
                });
            }

            const bytes = await pdf.save();

            await downloadBlob(
                new Blob([bytes], {
                    type: "application/pdf"
                }),
                "card-preview.pdf"
            );

            return;
        }

        if (isSheet && !files.images.length) {
            throw new Error("Photos Upload करें।");
        }

        if (!isSheet && !files.front) {
            throw new Error("Image Upload करें।");
        }

        const blob = await canvasBlob(frontCanvas);

        await downloadBlob(
            blob,
            isSheet ? "photo-sheet.png" : "photo-preview.png"
        );

    } catch (error) {
        alert(error.message);
    }
}

/* ==========================================
   OPTIONAL GLOBAL BUTTON FUNCTIONS
========================================== */

window.resetEditor = resetEditor;
window.rotateLeft = rotateLeft;
window.rotateRight = rotateRight;
window.exportImage = exportImage;
window.processPDF = processPDF;
window.printEditor = printEditor;
window.downloadPreview = downloadPreview;

/* ==========================================
   START EDITOR
========================================== */

drawAll();

message(
    "Shree Karni Auto Print Editor Ready"
);

console.log(
    "Shree Karni Auto Print Loaded:",
    service
);
