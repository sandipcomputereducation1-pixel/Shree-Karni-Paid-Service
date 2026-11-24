# Shree Karni Paid Service Website

## Features
- Partner/Admin login with password hashing
- Partner wallet and ₹1 debit for each successful Card Print service
- Recharge request workflow (manual UPI reference + admin approval)
- Admin partner creation, account enable/disable, wallet credit, transaction history
- Browser image editor: auto-fit, auto-crop, rotation 0–360°, zoom, A4 print

## Local run (Windows)
1. Install Python 3.10+
2. Open terminal in project folder:
   `py -m venv venv`
   `venv\Scripts\activate`
   `pip install -r requirements.txt`
3. Set a secure admin password:
   `set ADMIN_PASSWORD=YourStrongPassword`
   `set SECRET_KEY=some-long-random-secret`
4. Run:
   `python app.py`
5. Open `http://127.0.0.1:5000`

Default local admin username is `admin`. Set `ADMIN_PASSWORD` before first run.
If the database already exists, changing the environment password does not reset the existing admin password.

## Render deployment
- Push all project files to GitHub.
- Create a Render Web Service from the repository.
- Set `ADMIN_PASSWORD` to a strong unique password in Render Environment.
- Keep the persistent disk mounted at `/var/data`; SQLite data is stored there.
- Set a long random `SECRET_KEY`.
- Never publish your admin password in GitHub.

## Important payment note
Recharge is currently a manual UPI-reference request workflow. Admin must verify payment in their UPI/bank app before approving. It does not automatically verify UPI payments. For automatic online payments, integrate a payment gateway (such as Razorpay) with server-side signature/webhook verification and merchant credentials.

## Important billing note
The ₹1 debit happens when the partner clicks the paid print action and the server confirms wallet balance. A browser print dialog can still be cancelled by the user; production billing should ideally be tied to a confirmed print-job completion from the trusted print agent.
