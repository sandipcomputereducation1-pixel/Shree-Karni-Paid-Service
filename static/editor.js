
const service = window.SK_SERVICE;

const files = {
    front: null,
    back: null,
    images: [],
    pdf: null
};

const frontCanvas = document.getElementById("frontCanvas");
const backCanvas = document.getElementById("backCanvas");

const frontCtx = frontCanvas.getContext("2d");
const backCtx = backCanvas.getContext("2d");

let angle = 0;
let zoom = 1;
let fit = "contain";

const $ = id => document.getElementById(id);

const isCard = service === "card-print";
const isPDF = service.startsWith("pdf-");
const isSheet = service === "photo-sheet";
const isPVC = service === "pvc";
const isPassport = service === "passport";

if (!isCard) {
    $("cardUploads").hidden = true;
    $("backBox").hidden = true;
}

if (isPDF) {
    $("photoControls").hidden = true;
    $("pdfControls").hidden = false;
    $("pdfAction").hidden = false;
    $("exportButton").hidden = true;
    $("printButton").textContent = "Print PDF";
}

if (isPVC) {
    frontCanvas.width = 1160;
    frontCanvas.height = 638;
}

if (isPassport) {
    frontCanvas.width = 413;
    frontCanvas.height = 531;
}

if (isSheet) {
    frontCanvas.width = 1200;
    frontCanvas.height = 1800;
}

function message(text) {
    $("editorMessage").textContent = text;
}

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

function drawSingle(canvas, ctx, img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!img) return;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angle * Math.PI / 180);

    const rw = Math.abs(Math.cos(angle * Math.PI / 180)) * img.width +
               Math.abs(Math.sin(angle * Math.PI / 180)) * img.height;

    const rh = Math.abs(Math.sin(angle * Math.PI / 180)) * img.width +
               Math.abs(Math.cos(angle * Math.PI / 180)) * img.height;

    let scale = fit === "cover"
        ? Math.max(canvas.width / rw, canvas.height / rh)
        : Math.min(canvas.width / rw, canvas.height / rh);

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

function drawSheet() {
    frontCtx.fillStyle = "#ffffff";
    frontCtx.fillRect(0, 0, frontCanvas.width, frontCanvas.height);

    if (!files.images.length) return;

    const cellW = 600;
    const cellH = 450;

    files.images.slice(0, 8).forEach((img, index) => {
        const x = (index % 2) * cellW;
        const y = Math.floor(index / 2) * cellH;

        frontCtx.save();

        const scale = Math.min(
            cellW / img.width,
            cellH / img.height
        );

        const w = img.width * scale;
        const h = img.height * scale;

        frontCtx.drawImage(
            img,
            x + (cellW - w) / 2,
            y + (cellH - h) / 2,
            w,
            h
        );

        frontCtx.strokeStyle = "#cccccc";
        frontCtx.strokeRect(x, y, cellW, cellH);

        frontCtx.restore();
    });
}

function drawAll() {
    if (isSheet) {
        drawSheet();
        return;
    }

    drawSingle(frontCanvas, frontCtx, files.front);
    drawSingle(backCanvas, backCtx, files.back);
}

async function load(side, file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("कृपया Image File चुनें।");
        return;
    }

    try {
        const img = await loadImage(file);
        files[side] = img;
        drawAll();

        $(side + "Empty").hidden = true;
        $("frontEmpty").hidden = !files.front;
    } catch (error) {
        alert("Image Load नहीं हुई।");
    }
}

$("frontFile").addEventListener("change", e => {
    load("front", e.target.files[0]);
});

$("backFile").addEventListener("change", e => {
    load("back", e.target.files[0]);
});

$("fileInput").addEventListener("change", async e => {
    const selected = Array.from(e.target.files || []);

    if (!selected.length) return;

    try {
        if (isPDF) {
            const file = selected[0];

            if (file.type !== "application/pdf" &&
                !file.name.toLowerCase().endsWith(".pdf")) {
                throw new Error("PDF file चुनें।");
            }

            files.pdf = await file.arrayBuffer();

            const pdf = await PDFLib.PDFDocument.load(files.pdf);
            $("pdfInfo").textContent =
                "PDF Pages: " + pdf.getPageCount();

            $("endPage").value = pdf.getPageCount();
            $("pdfPage").max = pdf.getPageCount();
            $("endPage").max = pdf.getPageCount();

            message("PDF सफलतापूर्वक Load हो गई।");
            return;
        }

        const imageFiles = selected.filter(
            file => file.type.startsWith("image/")
        );

        if (!imageFiles.length) {
            throw new Error("Image File चुनें।");
        }

        files.images = await Promise.all(imageFiles.map(loadImage));

        if (isSheet) {
            files.images = files.images.slice(0, 8);
            drawSheet();
            $("frontEmpty").hidden = true;
            message(files.images.length + " Photos Loaded");
        } else {
            files.front = files.images[0];
            drawAll();
            $("frontEmpty").hidden = true;
        }

    } catch (error) {
        alert(error.message || "File Load नहीं हुई।");
    }
});

$("rotate").addEventListener("input", e => {
    angle = Number(e.target.value);
    $("angleText").textContent = angle + "°";
    drawAll();
});

$("zoom").addEventListener("input", e => {
    zoom = Number(e.target.value) / 100;
    drawAll();
});

$("fitMode").addEventListener("change", e => {
    fit = e.target.value;
    drawAll();
});

function resetEditor() {
    angle = 0;
    zoom = 1;
    fit = "contain";

    $("rotate").value = 0;
    $("zoom").value = 100;
    $("fitMode").value = "contain";
    $("angleText").textContent = "0°";

    drawAll();
}

function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error("Export Failed"));
        }, "image/png");
    });
}

async function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function billSuccessfulExport(blob, filename) {
    const start = await fetch("/api/start-job", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({service})
    });

    const job = await start.json();

    if (!start.ok || !job.ok) {
        throw new Error(job.message || "Job Start Failed");
    }

    const complete = await fetch("/api/complete-job", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({job_token: job.job_token})
    });

    const result = await complete.json();

    if (!complete.ok || !result.ok) {
        await fetch("/api/cancel-job", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({job_token: job.job_token})
        });

        throw new Error(result.message || "Billing Failed");
    }

    await downloadBlob(blob, filename);

    message(
        "Export तैयार हुआ। ₹" +
        Number(result.charged).toFixed(2) +
        " Charge हुआ। Wallet: ₹" +
        Number(result.balance).toFixed(2)
    );
}

async function exportImage() {
    try {
        if (isCard) {
            if (!files.front && !files.back) {
                throw new Error("पहले Front या Back Image Upload करें।");
            }

            const pdf = await PDFLib.PDFDocument.create();

            const page = pdf.addPage([595.28, 841.89]);

            const cardW = 425.2;
            const cardH = 283.46;

            if (files.front) {
                const blob = await canvasBlob(frontCanvas);
                const image = await pdf.embedPng(
                    await blob.arrayBuffer()
                );

                page.drawImage(image, {
                    x: 85,
                    y: 841.89 - 100 - cardH,
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
                    y: 841.89 - 430 - cardH,
                    width: cardW,
                    height: cardH
                });
            }

            const output = await pdf.save();
            const blob = new Blob([output], {
                type: "application/pdf"
            });

            await billSuccessfulExport(blob, "card-print.pdf");
            return;
        }

        if (isSheet && !files.images.length) {
            throw new Error("Photos Upload करें।");
        }

        if (!files.front && !isSheet) {
            throw new Error("पहले Image Upload करें।");
        }

        const blob = await canvasBlob(frontCanvas);

        const filename = isSheet
            ? "4x6-eight-photos.png"
            : isPassport
                ? "passport-photo.png"
                : isPVC
                    ? "pvc-card.png"
                    : "photo-print.png";

        await billSuccessfulExport(blob, filename);

    } catch (error) {
        message(error.message);
        alert(error.message);
    }
}

async function processPDF() {
    if (!files.pdf) {
        alert("पहले PDF Upload करें।");
        return;
    }

    try {
        const pdf = await PDFLib.PDFDocument.load(files.pdf);
        const count = pdf.getPageCount();

        let output;

        if (service === "pdf-merge") {
            const selected = Array.from($("fileInput").files);

            if (selected.length < 2) {
                throw new Error("Merge के लिए कम से कम 2 PDF चाहिए।");
            }

            const merged = await PDFLib.PDFDocument.create();

            for (const file of selected) {
                const doc = await PDFLib.PDFDocument.load(
                    await file.arrayBuffer()
                );

                const pages = await merged.copyPages(
                    doc,
                    doc.getPageIndices()
                );

                pages.forEach(page => merged.addPage(page));
            }

            output = await merged.save();

        } else if (service === "pdf-split") {
            const start = Number($("startPage").value);
            const end = Number($("endPage").value);

            if (start < 1 || end < start || end > count) {
                throw new Error("Page Range सही भरें।");
            }

            const split = await PDFLib.PDFDocument.create();

            const indexes = Array.from(
                {length: end - start + 1},
                (_, i) => start - 1 + i
            );

            const pages = await split.copyPages(pdf, indexes);
            pages.forEach(page => split.addPage(page));

            output = await split.save();

        } else if (service === "pdf-rotate") {
            const pageNo = Number($("pdfPage").value);

            if (pageNo < 1 || pageNo > count) {
                throw new Error("Page Number सही भरें।");
            }

            const page = pdf.getPages()[pageNo - 1];
            page.setRotation(
                PDFLib.degrees(
                    (page.getRotation().angle + 90) % 360
                )
            );

            output = await pdf.save();

        } else if (service === "pdf-compress") {
            output = await pdf.save({
                useObjectStreams: true
            });

        } else if (service === "pdf-print") {
            const blob = new Blob([files.pdf], {
                type: "application/pdf"
            });

            const url = URL.createObjectURL(blob);
            const win = window.open(url, "_blank");

            if (!win) {
                URL.revokeObjectURL(url);
                throw new Error("Pop-up Allow करें।");
            }

            message("PDF Print Preview खुल गई।");
            return;

        } else {
            throw new Error("यह PDF Tool उपलब्ध नहीं है।");
        }

        const blob = new Blob([output], {
            type: "application/pdf"
        });

        await billSuccessfulExport(
            blob,
            service + "-output.pdf"
        );

    } catch (error) {
        alert(error.message || "PDF Process Failed");
        message(error.message);
    }
}

function printEditor() {
    if (isPDF) {
        if (!files.pdf) {
            alert("पहले PDF Upload करें।");
            return;
        }

        const blob = new Blob([files.pdf], {
            type: "application/pdf"
        });

        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");

        if (!win) alert("Pop-up Allow करें।");
        return;
    }

    if (isCard) {
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

if (isCard) {
    $("frontCanvas").style.width = "100%";
    $("backBox").hidden = false;
    $("backCanvas").style.width = "100%";
}

drawAll();
