
import os
import sqlite3
import secrets
from functools import wraps
from datetime import datetime, timedelta
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, jsonify, abort
)
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-before-deploy")

DB_PATH = os.environ.get("DB_PATH", "shree_karni.db")
SERVICE_PRICE = 1.00
UPI_ID = os.environ.get("UPI_ID", "").strip()
UPI_NAME = os.environ.get("UPI_NAME", "Shree Karni Computer").strip()

# All available services and their tools
SERVICE_CATALOG = [
    ("Photo & Print", [
        ("Photo Print", "photo"),
        ("Card Print", "card-print"),
        ("Passport Photo", "passport"),
        ("4x6 Photo Sheet (8 Photos)", "photo-sheet"),
        ("PVC Card Print", "pvc"),
    ]),
    ("PDF Tools", [
        ("PDF Print", "pdf-print"),
        ("PDF Merge", "pdf-merge"),
        ("PDF Split", "pdf-split"),
        ("PDF Rotate", "pdf-rotate"),
        ("PDF Compress", "pdf-compress"),
    ]),
    ("Computer", [
        ("RS-CIT", "rscit"),
        ("Tally Prime", "tally"),
        ("PGDCA", "pgdca"),
        ("Basic Computer", "basic-computer"),
    ]),
    ("E-Mitra", [
        ("E-Mitra Service", "emitra"),
        ("Mitra Service", "mitra"),
    ]),
    ("College", [
        ("College Admission", "college-admission"),
        ("College Fees", "college-fees"),
        ("Exam Form", "exam-form"),
        ("Revaluation", "revaluation"),
        ("Migration Apply", "migration"),
    ]),
    ("IGNOU & VMOU", [
        ("IGNOU DECE", "ignou-dece"),
        ("B.LIB", "blib"),
        ("D.LIB", "dlib"),
        ("Yoga", "yoga"),
    ]),
    ("Government Services", [
        ("PAN Service", "pan"),
        ("Aadhaar Print", "aadhaar"),
        ("Voter ID Print", "voter"),
        ("Driving Licence Print", "dl"),
        ("RC Card Print", "rc"),
        ("E-Shram Service", "eshram"),
        ("ABHA Card Download", "abha"),
    ]),
]

SERVICE_MAP = {
    slug: {"name": name, "slug": slug}
    for group, items in SERVICE_CATALOG
    for name, slug in items
}

# Only these tools currently support the automated editor workflow.
EDITOR_TOOLS = {
    "photo", "card-print", "passport", "photo-sheet", "pvc",
    "pdf-print", "pdf-merge", "pdf-split",
    "pdf-rotate", "pdf-compress"
}


def db():
    con = sqlite3.connect(DB_PATH, timeout=20)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','partner')),
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            wallet REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS recharge_requests(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            reference TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS service_jobs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            job_token TEXT UNIQUE NOT NULL,
            service TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            amount REAL NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_user
        ON service_jobs(user_id);

        CREATE INDEX IF NOT EXISTS idx_transactions_user
        ON transactions(user_id);
        """)

        admin_user = os.environ.get("ADMIN_USERNAME", "admin")
        admin_pass = os.environ.get("ADMIN_PASSWORD", "ChangeMe123!")

        row = con.execute(
            "SELECT id FROM users WHERE username=?", (admin_user,)
        ).fetchone()

        if not row:
            con.execute("""
                INSERT INTO users(username,password_hash,role,name,wallet)
                VALUES(?,?,?,?,?)
            """, (
                admin_user,
                generate_password_hash(admin_pass),
                "admin",
                "Shree Karni Admin",
                0
            ))


def login_required(role=None):
    def deco(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not session.get("user_id"):
                return redirect(url_for("login"))

            if role and session.get("role") != role:
                abort(403)

            return fn(*args, **kwargs)
        return wrapped
    return deco


@app.context_processor
def inject_user():
    balance = 0
    if session.get("user_id"):
        with db() as con:
            user = con.execute(
                "SELECT wallet FROM users WHERE id=?",
                (session["user_id"],)
            ).fetchone()
            if user:
                balance = float(user["wallet"])

    return {"wallet_balance": balance}


@app.route("/")
def home():
    if session.get("user_id"):
        if session.get("role") == "admin":
            return redirect(url_for("admin"))
        return redirect(url_for("partner"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        with db() as con:
            user = con.execute(
                "SELECT * FROM users WHERE username=? AND active=1",
                (username,)
            ).fetchone()

        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session.update(
                user_id=user["id"],
                username=user["username"],
                role=user["role"],
                name=user["name"]
            )
            return redirect(url_for(
                "admin" if user["role"] == "admin" else "partner"
            ))

        flash("गलत Login ID या Password", "error")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# --------------------------------------------------
# PARTNER DASHBOARD
# --------------------------------------------------

@app.route("/partner")
@login_required("partner")
def partner():
    with db() as con:
        transactions = con.execute("""
            SELECT * FROM transactions
            WHERE user_id=?
            ORDER BY id DESC LIMIT 30
        """, (session["user_id"],)).fetchall()

        requests = con.execute("""
            SELECT * FROM recharge_requests
            WHERE user_id=?
            ORDER BY id DESC LIMIT 10
        """, (session["user_id"],)).fetchall()

    return render_template(
        "partner.html",
        transactions=transactions,
        requests=requests,
        service_price=SERVICE_PRICE,
        service_catalog=SERVICE_CATALOG,
        upi_configured=bool(UPI_ID),
        upi_id=UPI_ID
    )


# --------------------------------------------------
# SERVICE ROUTES
# --------------------------------------------------

@app.route("/service/<slug>")
@login_required("partner")
def open_service(slug):
    service = SERVICE_MAP.get(slug)

    if not service:
        abort(404)

    # Editor services
    if slug in EDITOR_TOOLS:
        return render_template(
            "editor.html",
            service=service,
            service_price=SERVICE_PRICE
        )

    # Other services: manual service information page
    return render_template(
        "service_info.html",
        service=service,
        service_price=SERVICE_PRICE
    )


@app.route("/service/card-print")
@login_required("partner")
def card_print():
    return redirect(url_for("open_service", slug="card-print"))


# --------------------------------------------------
# BILLING: CREATE JOB
# Opening a tool never deducts money.
# --------------------------------------------------

@app.route("/api/start-job", methods=["POST"])
@login_required("partner")
def start_job():
    data = request.get_json(silent=True) or {}
    slug = (data.get("service") or "").strip()

    if slug not in EDITOR_TOOLS:
        return jsonify(
            ok=False,
            message="यह Tool उपलब्ध नहीं है।"
        ), 400

    with db() as con:
        user = con.execute(
            "SELECT wallet FROM users WHERE id=? AND active=1",
            (session["user_id"],)
        ).fetchone()

        if not user:
            return jsonify(ok=False, message="Account उपलब्ध नहीं है।"), 403

        if float(user["wallet"]) < SERVICE_PRICE:
            return jsonify(
                ok=False,
                message="Wallet में ₹1 से कम Balance है। Recharge करें।"
            ), 402

        token = secrets.token_urlsafe(32)

        con.execute("""
            INSERT INTO service_jobs
            (user_id,job_token,service,status,amount,created_at)
            VALUES(?,?,?,?,?,?)
        """, (
            session["user_id"],
            token,
            slug,
            "pending",
            SERVICE_PRICE,
            datetime.now().isoformat(timespec="seconds")
        ))

    return jsonify(
        ok=True,
        job_token=token,
        balance=float(user["wallet"]),
        message="Tool तैयार है। अभी कोई पैसा नहीं कटा।"
    )


# --------------------------------------------------
# BILLING: COMPLETE JOB
# Charge once after client reports successful export.
# --------------------------------------------------

@app.route("/api/complete-job", methods=["POST"])
@login_required("partner")
def complete_job():
    data = request.get_json(silent=True) or {}
    token = (data.get("job_token") or "").strip()

    if not token or len(token) > 100:
        return jsonify(ok=False, message="Invalid Job ID"), 400

    con = db()

    try:
        con.execute("BEGIN IMMEDIATE")

        job = con.execute("""
            SELECT * FROM service_jobs
            WHERE job_token=? AND user_id=?
        """, (token, session["user_id"])).fetchone()

        if not job:
            con.rollback()
            return jsonify(ok=False, message="Job नहीं मिला।"), 404

        if job["status"] == "completed":
            balance = con.execute(
                "SELECT wallet FROM users WHERE id=?",
                (session["user_id"],)
            ).fetchone()["wallet"]

            con.rollback()
            return jsonify(
                ok=True,
                already_charged=True,
                balance=float(balance),
                charged=0
            )

        if job["status"] != "pending":
            con.rollback()
            return jsonify(ok=False, message="Job पहले ही बंद हो चुका है।"), 409

        created = datetime.fromisoformat(job["created_at"])
        if datetime.now() - created > timedelta(hours=2):
            con.execute(
                "UPDATE service_jobs SET status='expired' WHERE id=?",
                (job["id"],)
            )
            con.commit()
            return jsonify(ok=False, message="Job Expire हो गया।"), 410

        user = con.execute(
            "SELECT wallet FROM users WHERE id=? AND active=1",
            (session["user_id"],)
        ).fetchone()

        if not user or float(user["wallet"]) < float(job["amount"]):
            con.rollback()
            return jsonify(
                ok=False,
                message="Wallet Balance पर्याप्त नहीं है।"
            ), 402

        con.execute(
            "UPDATE users SET wallet=wallet-? WHERE id=?",
            (job["amount"], session["user_id"])
        )

        con.execute("""
            INSERT INTO transactions
            (user_id,kind,amount,note,created_at)
            VALUES(?,?,?,?,?)
        """, (
            session["user_id"],
            "debit",
            job["amount"],
            "Successful export: " + SERVICE_MAP[job["service"]]["name"],
            datetime.now().isoformat(timespec="seconds")
        ))

        con.execute("""
            UPDATE service_jobs
            SET status='completed',completed_at=?
            WHERE id=?
        """, (
            datetime.now().isoformat(timespec="seconds"),
            job["id"]
        ))

        balance = con.execute(
            "SELECT wallet FROM users WHERE id=?",
            (session["user_id"],)
        ).fetchone()["wallet"]

        con.commit()

        return jsonify(
            ok=True,
            charged=float(job["amount"]),
            balance=float(balance),
            message="काम पूरा हुआ। Billing सफल।"
        )

    except Exception:
        con.rollback()
        app.logger.exception("Job billing failed")
        return jsonify(ok=False, message="Billing में समस्या आई।"), 500

    finally:
        con.close()


# --------------------------------------------------
# CANCEL JOB - NO CHARGE
# --------------------------------------------------

@app.route("/api/cancel-job", methods=["POST"])
@login_required("partner")
def cancel_job():
    data = request.get_json(silent=True) or {}
    token = (data.get("job_token") or "").strip()

    if not token:
        return jsonify(ok=False, message="Job ID जरूरी है।"), 400

    with db() as con:
        cur = con.execute("""
            UPDATE service_jobs
            SET status='cancelled'
            WHERE job_token=? AND user_id=? AND status='pending'
        """, (token, session["user_id"]))

    return jsonify(ok=True, cancelled=cur.rowcount == 1, charged=0)


# --------------------------------------------------
# UPI QR
# --------------------------------------------------

@app.route("/upi-qr")
@login_required("partner")
def upi_qr():
    try:
        amount = round(float(request.args.get("amount", "0")), 2)
    except (ValueError, TypeError):
        abort(400)

    if amount < 10 or amount > 100000 or not UPI_ID:
        abort(400)

    import io
    import qrcode
    from flask import send_file
    from urllib.parse import quote

    uri = (
        f"upi://pay?pa={quote(UPI_ID)}"
        f"&pn={quote(UPI_NAME)}"
        f"&am={amount:.2f}&cu=INR"
        f"&tn={quote('Wallet Recharge')}"
    )

    image = qrcode.make(uri)
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)

    return send_file(
        output,
        mimetype="image/png",
        download_name="wallet-recharge-qr.png"
    )


# --------------------------------------------------
# WALLET RECHARGE
# --------------------------------------------------

@app.route("/wallet/recharge", methods=["POST"])
@login_required("partner")
def recharge():
    try:
        amount = round(float(request.form.get("amount", "0")), 2)
    except (ValueError, TypeError):
        amount = 0

    reference = request.form.get("reference", "").strip()[:100]

    if amount < 10 or amount > 100000 or not reference:
        flash("कम से कम ₹10 और सही Transaction Reference भरें।", "error")
    else:
        with db() as con:
            con.execute("""
                INSERT INTO recharge_requests
                (user_id,amount,reference,created_at)
                VALUES(?,?,?,?)
            """, (
                session["user_id"],
                amount,
                reference,
                datetime.now().isoformat(timespec="seconds")
            ))

        flash("Recharge Request Admin को भेज दी गई है।", "success")

    return redirect(url_for("partner"))


# --------------------------------------------------
# ADMIN DASHBOARD
# --------------------------------------------------

@app.route("/admin")
@login_required("admin")
def admin():
    with db() as con:
        partners = con.execute("""
            SELECT * FROM users
            WHERE role='partner'
            ORDER BY id DESC
        """).fetchall()

        pending = con.execute("""
            SELECT r.*,u.username,u.name
            FROM recharge_requests r
            JOIN users u ON u.id=r.user_id
            WHERE r.status='pending'
            ORDER BY r.id
        """).fetchall()

        transactions = con.execute("""
            SELECT t.*,u.username
            FROM transactions t
            JOIN users u ON u.id=t.user_id
            ORDER BY t.id DESC LIMIT 100
        """).fetchall()

        total = con.execute("""
            SELECT COALESCE(SUM(amount),0) AS total
            FROM transactions WHERE kind='debit'
        """).fetchone()["total"]

    return render_template(
        "admin.html",
        partners=partners,
        pending=pending,
        transactions=transactions,
        total_earned=total
    )


@app.route("/admin/partner/create", methods=["POST"])
@login_required("admin")
def create_partner():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    name = request.form.get("name", "").strip()

    if not username or len(password) < 8 or not name:
        flash("नाम, Login ID और कम से कम 8 अक्षर का Password जरूरी है।", "error")
    else:
        try:
            with db() as con:
                con.execute("""
                    INSERT INTO users(username,password_hash,role,name,wallet)
                    VALUES(?,?,?,?,0)
                """, (
                    username,
                    generate_password_hash(password),
                    "partner",
                    name
                ))
            flash("Partner Account बन गया।", "success")
        except sqlite3.IntegrityError:
            flash("यह Login ID पहले से मौजूद है।", "error")

    return redirect(url_for("admin"))


@app.route("/admin/recharge/<int:req_id>/<action>", methods=["POST"])
@login_required("admin")
def decide_recharge(req_id, action):
    if action not in ("approve", "reject"):
        abort(400)

    con = db()

    try:
        con.execute("BEGIN IMMEDIATE")

        row = con.execute("""
            SELECT * FROM recharge_requests
            WHERE id=? AND status='pending'
        """, (req_id,)).fetchone()

        if not row:
            con.rollback()
            flash("Request पहले ही Process हो चुकी है।", "error")

        elif action == "approve":
            con.execute(
                "UPDATE users SET wallet=wallet+? WHERE id=?",
                (row["amount"], row["user_id"])
            )

            con.execute(
                "UPDATE recharge_requests SET status='approved' WHERE id=?",
                (req_id,)
            )

            con.execute("""
                INSERT INTO transactions
                (user_id,kind,amount,note,created_at)
                VALUES(?,?,?,?,?)
            """, (
                row["user_id"],
                "credit",
                row["amount"],
                "Admin approved recharge: " + row["reference"],
                datetime.now().isoformat(timespec="seconds")
            ))

            con.commit()
            flash("Wallet Recharge Approve हो गया।", "success")

        else:
            con.execute(
                "UPDATE recharge_requests SET status='rejected' WHERE id=?",
                (req_id,)
            )
            con.commit()
            flash("Recharge Request Reject कर दी गई।", "success")

    finally:
        con.close()

    return redirect(url_for("admin"))


@app.route("/admin/wallet/<int:user_id>", methods=["POST"])
@login_required("admin")
def adjust_wallet(user_id):
    try:
        amount = round(float(request.form.get("amount", "0")), 2)
    except (ValueError, TypeError):
        amount = 0

    note = request.form.get(
        "note", "Admin wallet adjustment"
    ).strip()[:120]

    if amount <= 0 or amount > 100000:
        flash("सही राशि भरें।", "error")
    else:
        with db() as con:
            cur = con.execute("""
                UPDATE users SET wallet=wallet+?
                WHERE id=? AND role='partner'
            """, (amount, user_id))

            if cur.rowcount:
                con.execute("""
                    INSERT INTO transactions
                    (user_id,kind,amount,note,created_at)
                    VALUES(?,?,?,?,?)
                """, (
                    user_id,
                    "credit",
                    amount,
                    note,
                    datetime.now().isoformat(timespec="seconds")
                ))
                flash("Wallet Recharge सफल।", "success")
            else:
                flash("Partner नहीं मिला।", "error")

    return redirect(url_for("admin"))


@app.route("/admin/partner/<int:user_id>/toggle", methods=["POST"])
@login_required("admin")
def toggle_partner(user_id):
    with db() as con:
        con.execute("""
            UPDATE users
            SET active=CASE active WHEN 1 THEN 0 ELSE 1 END
            WHERE id=? AND role='partner'
        """, (user_id,))

    return redirect(url_for("admin"))


@app.route("/health")
def health():
    return jsonify(status="ok")


init_db()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
