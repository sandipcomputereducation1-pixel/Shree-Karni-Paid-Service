import os, sqlite3, secrets
from functools import wraps
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, abort
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-before-deploy")
DB_PATH = os.environ.get("DB_PATH", "shree_karni.db")
SERVICE_PRICE = 1.00
UPI_ID = os.environ.get("UPI_ID", "").strip()
UPI_NAME = os.environ.get("UPI_NAME", "Shree Karni Computer").strip()

# Paid service catalog. Each successful launch/print action costs ₹1.
SERVICE_CATALOG = [
    ("Photo & Print", ["Photo Print", "Card Print", "Passport Photo", "4x6 Photo Sheet", "PVC Card Print"]),
    ("PDF Tools", ["PDF Print", "PDF Merge", "PDF Split", "PDF Rotate", "PDF Compress"]),
    ("Computer", ["RS-CIT", "Tally Prime", "PGDCA", "Basic Computer"]),
    ("E-Mitra", ["E-Mitra Service", "Mitra Service"]),
    ("College", ["College Admission", "College Fees", "Exam Form", "Revaluation", "Migration Apply"]),
    ("IGNOU & VMOU", ["IGNOU DECE", "B.LIB", "D.LIB", "Yoga"]),
    ("Government Services", ["PAN Service", "Aadhaar Print", "Voter ID Print", "Driving Licence Print", "RC Card Print", "E-Shram Service", "ABHA Card Download"]),
]
ALLOWED_SERVICES = {item for _, items in SERVICE_CATALOG for item in items}

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
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
        """)
        admin_user = os.environ.get("ADMIN_USERNAME", "admin")
        admin_pass = os.environ.get("ADMIN_PASSWORD", "ChangeMe123!")
        row = con.execute("SELECT id FROM users WHERE username=?", (admin_user,)).fetchone()
        if not row:
            con.execute("INSERT INTO users(username,password_hash,role,name,wallet) VALUES(?,?,?,?,?)",
                        (admin_user, generate_password_hash(admin_pass), "admin", "Shree Karni Admin", 0))

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
    if session.get("user_id"):
        with db() as con:
            u = con.execute("SELECT wallet FROM users WHERE id=?", (session["user_id"],)).fetchone()
        return {"wallet_balance": float(u["wallet"]) if u else 0}
    return {"wallet_balance": 0}

@app.route("/")
def home():
    if session.get("user_id"):
        return redirect(url_for("admin" if session.get("role")=="admin" else "partner"))
    return redirect(url_for("login"))

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username","").strip()
        password = request.form.get("password","")
        with db() as con:
            u = con.execute("SELECT * FROM users WHERE username=? AND active=1", (username,)).fetchone()
        if u and check_password_hash(u["password_hash"], password):
            session.clear()
            session.update(user_id=u["id"], username=u["username"], role=u["role"], name=u["name"])
            return redirect(url_for("admin" if u["role"]=="admin" else "partner"))
        flash("गलत Login ID या Password", "error")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/upi-qr")
@login_required("partner")
def upi_qr():
    # Generate a payment QR only when the merchant UPI ID is configured.
    amount = request.args.get("amount", "0")
    try:
        amount_value = round(float(amount), 2)
    except ValueError:
        abort(400)
    if amount_value < 10 or not UPI_ID:
        abort(400)
    import io
    import qrcode
    from flask import send_file
    from urllib.parse import quote
    uri = f"upi://pay?pa={quote(UPI_ID)}&pn={quote(UPI_NAME)}&am={amount_value:.2f}&cu=INR&tn={quote('Wallet Recharge')}"
    img = qrcode.make(uri)
    out = io.BytesIO()
    img.save(out, format="PNG")
    out.seek(0)
    return send_file(out, mimetype="image/png", download_name="wallet-recharge-qr.png")

@app.route("/partner")
@login_required("partner")
def partner():
    with db() as con:
        tx = con.execute("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 20",(session["user_id"],)).fetchall()
        requests = con.execute("SELECT * FROM recharge_requests WHERE user_id=? ORDER BY id DESC LIMIT 10",(session["user_id"],)).fetchall()
    return render_template("partner.html", transactions=tx, requests=requests, service_price=SERVICE_PRICE, service_catalog=SERVICE_CATALOG, upi_configured=bool(UPI_ID), upi_id=UPI_ID)

@app.route("/service/card-print")
@login_required("partner")
def card_print():
    return render_template("editor.html", service_price=SERVICE_PRICE)

@app.route("/api/use-service", methods=["POST"])
@login_required("partner")
def use_service():
    data = request.get_json(silent=True) or {}
    service = (data.get("service") or "").strip()[:80]
    if service not in ALLOWED_SERVICES:
        return jsonify(ok=False, message="यह Service उपलब्ध नहीं है।"), 400
    con = db()
    try:
        con.execute("BEGIN IMMEDIATE")
        user = con.execute("SELECT wallet FROM users WHERE id=? AND active=1", (session["user_id"],)).fetchone()
        if not user:
            con.rollback()
            return jsonify(ok=False, message="Account उपलब्ध नहीं है"), 403
        if float(user["wallet"]) < SERVICE_PRICE:
            con.rollback()
            return jsonify(ok=False, message="Wallet में कम से कम ₹1 होना जरूरी है। Recharge करें।"), 402
        con.execute("UPDATE users SET wallet=wallet-? WHERE id=?", (SERVICE_PRICE, session["user_id"]))
        con.execute("INSERT INTO transactions(user_id,kind,amount,note,created_at) VALUES(?,?,?,?,?)",
                    (session["user_id"], "debit", SERVICE_PRICE, service, datetime.now().isoformat(timespec="seconds")))
        con.commit()
        balance = con.execute("SELECT wallet FROM users WHERE id=?", (session["user_id"],)).fetchone()["wallet"]
        return jsonify(ok=True, balance=balance, charged=SERVICE_PRICE)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

@app.route("/wallet/recharge", methods=["POST"])
@login_required("partner")
def recharge():
    try:
        amount = round(float(request.form.get("amount","0")),2)
    except ValueError:
        amount = 0
    reference = request.form.get("reference","").strip()[:100]
    if amount < 10 or not reference:
        flash("कम से कम ₹10 और UPI Transaction Reference भरें।", "error")
    else:
        with db() as con:
            con.execute("INSERT INTO recharge_requests(user_id,amount,reference,created_at) VALUES(?,?,?,?)",
                        (session["user_id"], amount, reference, datetime.now().isoformat(timespec="seconds")))
        flash("Recharge request Admin को भेज दी गई है। Approval के बाद Wallet अपडेट होगा।", "success")
    return redirect(url_for("partner"))

@app.route("/admin")
@login_required("admin")
def admin():
    with db() as con:
        partners = con.execute("SELECT * FROM users WHERE role='partner' ORDER BY id DESC").fetchall()
        pending = con.execute("""SELECT r.*,u.username,u.name FROM recharge_requests r
                               JOIN users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.id""").fetchall()
        tx = con.execute("""SELECT t.*,u.username FROM transactions t JOIN users u ON u.id=t.user_id
                            ORDER BY t.id DESC LIMIT 50""").fetchall()
        totals = con.execute("SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE kind='debit'").fetchone()["total"]
    return render_template("admin.html", partners=partners, pending=pending, transactions=tx, total_earned=totals)

@app.route("/admin/partner/create", methods=["POST"])
@login_required("admin")
def create_partner():
    username=request.form.get("username","").strip()
    password=request.form.get("password","")
    name=request.form.get("name","").strip()
    if not username or len(password)<8 or not name:
        flash("नाम, Login ID और कम से कम 8 अक्षर का Password जरूरी है।","error")
    else:
        try:
            with db() as con:
                con.execute("INSERT INTO users(username,password_hash,role,name,wallet) VALUES(?,?,?,?,0)",
                            (username,generate_password_hash(password),"partner",name))
            flash("Partner account बन गया।","success")
        except sqlite3.IntegrityError:
            flash("यह Login ID पहले से मौजूद है।","error")
    return redirect(url_for("admin"))

@app.route("/admin/recharge/<int:req_id>/<action>", methods=["POST"])
@login_required("admin")
def decide_recharge(req_id, action):
    if action not in ("approve","reject"): abort(400)
    con=db()
    try:
        con.execute("BEGIN IMMEDIATE")
        r=con.execute("SELECT * FROM recharge_requests WHERE id=? AND status='pending'",(req_id,)).fetchone()
        if not r:
            con.rollback()
            flash("Request पहले ही process हो चुकी है।","error")
        elif action=="approve":
            con.execute("UPDATE users SET wallet=wallet+? WHERE id=?",(r["amount"],r["user_id"]))
            con.execute("UPDATE recharge_requests SET status='approved' WHERE id=?",(req_id,))
            con.execute("INSERT INTO transactions(user_id,kind,amount,note,created_at) VALUES(?,?,?,?,?)",
                        (r["user_id"],"credit",r["amount"],"Admin approved recharge: "+r["reference"],datetime.now().isoformat(timespec="seconds")))
            con.commit()
            flash("Wallet Recharge approve हो गया।","success")
        else:
            con.execute("UPDATE recharge_requests SET status='rejected' WHERE id=?",(req_id,))
            con.commit()
            flash("Recharge request reject कर दी गई।","success")
    finally:
        con.close()
    return redirect(url_for("admin"))

@app.route("/admin/wallet/<int:user_id>", methods=["POST"])
@login_required("admin")
def adjust_wallet(user_id):
    try: amount=round(float(request.form.get("amount","0")),2)
    except ValueError: amount=0
    note=request.form.get("note","Admin wallet adjustment").strip()[:120]
    if amount <= 0:
        flash("राशि ₹0 से अधिक होनी चाहिए।","error")
    else:
        with db() as con:
            cur=con.execute("UPDATE users SET wallet=wallet+? WHERE id=? AND role='partner'",(amount,user_id))
            if cur.rowcount:
                con.execute("INSERT INTO transactions(user_id,kind,amount,note,created_at) VALUES(?,?,?,?,?)",
                            (user_id,"credit",amount,note,datetime.now().isoformat(timespec="seconds")))
                flash("Wallet में पैसे जोड़ दिए गए।","success")
            else: flash("Partner नहीं मिला।","error")
    return redirect(url_for("admin"))

@app.route("/admin/partner/<int:user_id>/toggle", methods=["POST"])
@login_required("admin")
def toggle_partner(user_id):
    with db() as con:
        con.execute("UPDATE users SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=? AND role='partner'",(user_id,))
    return redirect(url_for("admin"))

@app.route("/health")
def health():
    return {"status":"ok"}

init_db()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT",5000)), debug=False)
