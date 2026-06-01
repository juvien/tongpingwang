#!/usr/bin/env python3
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("TONGPIN_DATA_DIR", BASE_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "app.db"
UTC = timezone.utc
SESSION_DAYS = 30
DEFAULT_SUPPORT_WECHAT = os.environ.get("TONGPIN_SUPPORT_WECHAT", "TongPinClub")
DEFAULT_SUPPORT_HOURS = os.environ.get("TONGPIN_SUPPORT_HOURS", "每日 12:00 - 22:00")
DEFAULT_SUPPORT_MESSAGE = os.environ.get(
    "TONGPIN_SUPPORT_MESSAGE",
    "添加客服后备注“同频局”，我们会把你拉入对应城市的兴趣社群。",
)
ADMIN_EMAIL = os.environ.get("TONGPIN_ADMIN_EMAIL", "admin@tongpin.local").strip().lower()
ADMIN_PASSWORD = os.environ.get("TONGPIN_ADMIN_PASSWORD", "Admin123!")
COOKIE_SECURE = os.environ.get("TONGPIN_COOKIE_SECURE", "0").lower() in {"1", "true", "yes"}


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def now_iso():
    return datetime.now(UTC).isoformat()


def parse_iso_datetime(value):
    if hasattr(datetime, "fromisoformat"):
        return datetime.fromisoformat(value)
    normalized = value.replace("Z", "+00:00")
    if normalized.endswith("+00:00"):
        normalized = normalized[:-6]
        return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S.%f").replace(tzinfo=UTC)
    return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S.%f").replace(tzinfo=UTC)


def db_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def json_loads(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"{salt}${digest.hex()}"


def verify_password(password, stored):
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()
    return hmac.compare_digest(check, digest)


def summarize_result(answers, interests):
    pace = answers.get("pace", "steady")
    scene = answers.get("scene", "cafe")
    expression = answers.get("expression", "gentle")
    planning = answers.get("planning", "balanced")
    energy = answers.get("energy", "warm")

    if scene in {"exhibition", "bookstore"} and pace in {"slow", "steady"}:
        archetype = "Harbor"
        title = "安静靠岸型"
        summary = "你更适合从轻松陪伴开始，先建立安全感，再慢慢进入更深的连接。"
        best_match = "适合和会认真回复、愿意约白天局的人建立关系。"
    elif expression in {"playful", "direct"} and energy in {"high", "spark"}:
        archetype = "Meteor"
        title = "热烈流星型"
        summary = "你自带情绪点火能力，适合通过有趣话题、临时小局和快速破冰推进关系。"
        best_match = "适合配对愿意即时互动、同城响应快的人。"
    elif planning in {"careful", "intentional"}:
        archetype = "Lantern"
        title = "稳定提灯型"
        summary = "你更看重关系方向和聊天质量，愿意为靠谱的人投入时间。"
        best_match = "适合配对认真恋爱、资料完整、表达清晰的人。"
    else:
        archetype = "Vinyl"
        title = "氛围唱片型"
        summary = "你在场景感和情绪共振里最容易心动，线下活动和圈层共同体验会更有效。"
        best_match = "适合配对愿意一起逛展、看演出、参加主题局的人。"

    picks = interests[:3] if interests else ["同城活动", "轻松聊天", "共同兴趣"]
    suggestions = [
        f"优先尝试 {picks[0]} 相关活动，最容易遇到同频对象。",
        "破冰时先聊最近一次线下体验，比直接问感情问题更自然。",
        "首次见面尽量选择公开场合，白天或傍晚的轻活动更适合你。"
    ]
    return {
        "archetype": archetype,
        "title": title,
        "summary": summary,
        "best_match": best_match,
        "suggestions": suggestions,
    }


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = db_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            city TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS profiles (
            user_id INTEGER PRIMARY KEY,
            nickname TEXT DEFAULT '',
            birth_year INTEGER,
            city TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            goals_json TEXT DEFAULT '[]',
            interests_json TEXT DEFAULT '[]',
            primary_tags TEXT DEFAULT '',
            communication_style TEXT DEFAULT '',
            favorite_scene TEXT DEFAULT '',
            availability TEXT DEFAULT '',
            budget_preference TEXT DEFAULT '',
            test_answers_json TEXT DEFAULT '{}',
            test_result_json TEXT DEFAULT '{}',
            match_intent_json TEXT DEFAULT '{}',
            review_status TEXT DEFAULT 'pending',
            match_status TEXT DEFAULT 'new',
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            contact TEXT NOT NULL,
            interest_note TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            city TEXT NOT NULL,
            theme TEXT NOT NULL,
            date_label TEXT NOT NULL,
            location TEXT NOT NULL,
            price INTEGER NOT NULL,
            capacity INTEGER NOT NULL,
            description TEXT NOT NULL,
            hero_color TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_signups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            activity_id INTEGER NOT NULL,
            note TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            UNIQUE(user_id, activity_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(activity_id) REFERENCES activities(id)
        );

        CREATE TABLE IF NOT EXISTS presale_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            note TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'intent_confirmed',
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL,
            addressee_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            message TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(requester_id, addressee_id),
            FOREIGN KEY(requester_id) REFERENCES users(id),
            FOREIGN KEY(addressee_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            read_at TEXT,
            FOREIGN KEY(sender_id) REFERENCES users(id),
            FOREIGN KEY(receiver_id) REFERENCES users(id)
        );
        """
    )

    admin = conn.execute("SELECT id FROM users WHERE email = ?", (ADMIN_EMAIL,)).fetchone()
    if not admin:
        created = now_iso()
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, city, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("管理员", ADMIN_EMAIL, hash_password(ADMIN_PASSWORD), "上海", "admin", created),
        )
        conn.execute(
            """INSERT INTO profiles (
                user_id, nickname, city, goals_json, interests_json, primary_tags, updated_at, review_status, match_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                cursor.lastrowid,
                "后台管理员",
                "上海",
                json.dumps(["管理站点"], ensure_ascii=False),
                json.dumps(["运营", "审核"], ensure_ascii=False),
                "运营,审核",
                created,
                "approved",
                "active",
            ),
        )

    count = conn.execute("SELECT COUNT(*) AS total FROM activities").fetchone()["total"]
    if count == 0:
        seed_activities = [
            (
                "海盐胶片散步局",
                "上海",
                "摄影漫步",
                "周六 14:00",
                "武康路口袋花园",
                59,
                18,
                "适合喜欢胶片、咖啡和慢节奏散步的同城认识活动，现场会有破冰卡和双人拍照任务。",
                "#ff7d66",
            ),
            (
                "夜光市集轻约会",
                "杭州",
                "市集社交",
                "周五 19:30",
                "天目里草坪",
                49,
                24,
                "围绕手作摊位、城市音乐和同频问答展开，适合第一次认识的人自然聊天。",
                "#0f8f84",
            ),
            (
                "耳机共享 livehouse 预热局",
                "成都",
                "演出前破冰",
                "周日 18:30",
                "东郊记忆南门",
                69,
                20,
                "先在演出前组小队，交换最近在单曲循环的歌，再一起进场看演出。",
                "#3249ff",
            ),
        ]
        for activity in seed_activities:
            conn.execute(
                """INSERT INTO activities (
                    title, city, theme, date_label, location, price, capacity, description, hero_color, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (*activity, now_iso()),
            )

    conn.commit()
    conn.close()


class AppHandler(BaseHTTPRequestHandler):
    server_version = "TongPinLocal/0.1"

    def do_HEAD(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            return self.head_static("index.html")
        if path in {"/admin", "/admin/"}:
            return self.head_static("admin.html")
        if path == "/favicon.ico":
            return self.head_static("assets/favicon.svg")
        if path == "/healthz":
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "2")
            self.end_headers()
            return
        if path.startswith("/static/"):
            return self.head_static(path.replace("/static/", "", 1))
        if path in {"/styles.css", "/app.js", "/admin.js"}:
            return self.head_static(path.lstrip("/"))
        if path.startswith("/assets/"):
            return self.head_static(path.lstrip("/"))
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            return self.serve_static("index.html")
        if path in {"/admin", "/admin/"}:
            return self.serve_static("admin.html")
        if path == "/favicon.ico":
            return self.serve_static("assets/favicon.svg")
        if path == "/healthz":
            return self.send_health()
        if path.startswith("/static/"):
            return self.serve_static(path.replace("/static/", "", 1))
        if path in {"/styles.css", "/app.js", "/admin.js"}:
            return self.serve_static(path.lstrip("/"))
        if path.startswith("/assets/"):
            return self.serve_static(path.lstrip("/"))

        if path == "/api/auth/me":
            return self.handle_me()
        if path == "/api/dashboard":
            return self.handle_dashboard()
        if path == "/api/activities":
            return self.handle_activities()
        if path == "/api/support":
            return self.handle_support()
        if path == "/api/social/users":
            return self.handle_social_users(parsed.query)
        if path == "/api/social/relations":
            return self.handle_social_relations()
        if path == "/api/social/messages":
            return self.handle_social_messages(parsed.query)
        if path == "/api/health":
            return self.handle_api_health()
        if path == "/api/admin/overview":
            return self.handle_admin_overview()
        if path == "/api/admin/users":
            return self.handle_admin_users(parsed.query)
        if path == "/api/admin/leads":
            return self.handle_admin_leads(parsed.query)
        if path == "/api/admin/presales":
            return self.handle_admin_presales()
        if path == "/api/admin/activity-signups/export.csv":
            return self.handle_admin_export()

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/auth/register":
            return self.handle_register()
        if path == "/api/auth/login":
            return self.handle_login()
        if path == "/api/auth/logout":
            return self.handle_logout()
        if path == "/api/admin/change-password":
            return self.handle_admin_change_password()
        if path == "/api/leads":
            return self.handle_lead_submit()
        if path == "/api/profile":
            return self.handle_profile_update()
        if path == "/api/test":
            return self.handle_test_submit()
        if path == "/api/match-intent":
            return self.handle_match_intent()
        if path == "/api/presales":
            return self.handle_presale_submit()
        if path == "/api/social/friends/request":
            return self.handle_friend_request()
        if path == "/api/social/friends/respond":
            return self.handle_friend_respond()
        if path == "/api/social/messages":
            return self.handle_message_submit()
        if path.startswith("/api/activities/") and path.endswith("/signup"):
            activity_id = path.split("/")[3]
            return self.handle_activity_signup(activity_id)
        if path.startswith("/api/admin/users/") and path.endswith("/review"):
            user_id = path.split("/")[4]
            return self.handle_admin_review(user_id)
        if path.startswith("/api/admin/users/") and path.endswith("/match-status"):
            user_id = path.split("/")[4]
            return self.handle_admin_match_status(user_id)

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def parse_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"})
            return None

    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_health(self):
        body = b"ok"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, relative_path):
        safe_path = self.safe_static_path(relative_path)
        if safe_path is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Static asset not found")
            return
        if not safe_path.exists() or safe_path.is_dir():
            self.send_error(HTTPStatus.NOT_FOUND, "Static asset not found")
            return

        content_type = self.guess_type(safe_path)
        body = safe_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def head_static(self, relative_path):
        safe_path = self.safe_static_path(relative_path)
        if safe_path is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Static asset not found")
            return
        if not safe_path.exists() or safe_path.is_dir():
            self.send_error(HTTPStatus.NOT_FOUND, "Static asset not found")
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", self.guess_type(safe_path))
        self.send_header("Content-Length", str(safe_path.stat().st_size))
        self.send_security_headers()
        self.end_headers()

    def safe_static_path(self, relative_path):
        requested = (STATIC_DIR / unquote(relative_path)).resolve()
        try:
            requested.relative_to(STATIC_DIR.resolve())
        except ValueError:
            return None
        return requested

    def send_security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "geolocation=(), camera=(), microphone=()")

    def guess_type(self, path):
        types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
        }
        return types.get(path.suffix.lower(), "application/octet-stream")

    def get_session_user(self, conn):
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        cookies = SimpleCookie()
        cookies.load(cookie_header)
        session = cookies.get("session_token")
        if not session:
            return None
        row = conn.execute(
            """
            SELECT users.*, sessions.expires_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (session.value,),
        ).fetchone()
        if not row:
            return None
        if parse_iso_datetime(row["expires_at"]) < datetime.now(UTC):
            conn.execute("DELETE FROM sessions WHERE token = ?", (session.value,))
            conn.commit()
            return None
        return row

    def require_auth(self, conn, admin=False):
        user = self.get_session_user(conn)
        if not user:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "auth_required"})
            return None
        if admin and user["role"] != "admin":
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "admin_required"})
            return None
        return user

    def session_headers(self, token=None, clear=False):
        if clear:
            return {"Set-Cookie": self.make_cookie("", max_age=0)}
        max_age = SESSION_DAYS * 24 * 60 * 60
        return {"Set-Cookie": self.make_cookie(token, max_age=max_age)}

    def make_cookie(self, token, max_age):
        parts = [f"session_token={token}", "Path=/", f"Max-Age={max_age}", "HttpOnly", "SameSite=Lax"]
        if COOKIE_SECURE:
            parts.append("Secure")
        return "; ".join(parts)

    def handle_register(self):
        payload = self.parse_body()
        if payload is None:
            return
        name = payload.get("name", "").strip()
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "")
        city = payload.get("city", "").strip()
        if not all([name, email, password, city]):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "missing_fields"})
        if len(password) < 6:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "weak_password"})

        conn = db_conn()
        try:
            cursor = conn.execute(
                "INSERT INTO users (name, email, password_hash, city, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)",
                (name, email, hash_password(password), city, now_iso()),
            )
        except sqlite3.IntegrityError:
            conn.close()
            return self.send_json(HTTPStatus.CONFLICT, {"error": "email_exists"})

        conn.execute(
            """INSERT INTO profiles (
                user_id, nickname, city, goals_json, interests_json, primary_tags, updated_at, review_status, match_status
            ) VALUES (?, ?, ?, '[]', '[]', '', ?, 'pending', 'new')""",
            (cursor.lastrowid, name, city, now_iso()),
        )
        token = secrets.token_urlsafe(24)
        expires_at = (datetime.now(UTC) + timedelta(days=SESSION_DAYS)).isoformat()
        conn.execute(
            "INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (cursor.lastrowid, token, expires_at, now_iso()),
        )
        conn.commit()
        user = conn.execute("SELECT id, name, email, city, role, created_at FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.close()
        return self.send_json(
            HTTPStatus.CREATED,
            {"user": dict(user)},
            extra_headers=self.session_headers(token=token),
        )

    def handle_login(self):
        payload = self.parse_body()
        if payload is None:
            return
        email = payload.get("email", "").strip().lower()
        password = payload.get("password", "")
        conn = db_conn()
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            conn.close()
            return self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "invalid_credentials"})
        token = secrets.token_urlsafe(24)
        expires_at = (datetime.now(UTC) + timedelta(days=SESSION_DAYS)).isoformat()
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        conn.execute(
            "INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (user["id"], token, expires_at, now_iso()),
        )
        conn.commit()
        payload = {
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "city": user["city"],
                "role": user["role"],
            }
        }
        conn.close()
        return self.send_json(HTTPStatus.OK, payload, extra_headers=self.session_headers(token=token))

    def handle_logout(self):
        conn = db_conn()
        user = self.get_session_user(conn)
        if user:
            cookie = SimpleCookie()
            cookie.load(self.headers.get("Cookie"))
            token = cookie.get("session_token")
            if token:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token.value,))
                conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"ok": True}, extra_headers=self.session_headers(clear=True))

    def handle_me(self):
        conn = db_conn()
        user = self.get_session_user(conn)
        if not user:
            conn.close()
            return self.send_json(HTTPStatus.OK, {"user": None})
        payload = {
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "city": user["city"],
                "role": user["role"],
            }
        }
        conn.close()
        return self.send_json(HTTPStatus.OK, payload)

    def handle_dashboard(self):
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        profile = conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user["id"],)).fetchone()
        signups = conn.execute(
            """
            SELECT activity_signups.id, activity_signups.status, activity_signups.created_at,
                   activities.title, activities.city, activities.date_label, activities.price
            FROM activity_signups
            JOIN activities ON activities.id = activity_signups.activity_id
            WHERE activity_signups.user_id = ?
            ORDER BY activity_signups.created_at DESC
            """,
            (user["id"],),
        ).fetchall()
        presales = conn.execute(
            "SELECT id, plan_name, amount, status, created_at FROM presale_orders WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
        conn.close()
        return self.send_json(
            HTTPStatus.OK,
            {
                "user": {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                    "city": user["city"],
                    "role": user["role"],
                },
                "profile": self.serialize_profile(profile),
                "activity_signups": [dict(row) for row in signups],
                "presales": [dict(row) for row in presales],
            },
        )

    def handle_profile_update(self):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        nickname = payload.get("nickname", "").strip() or user["name"]
        birth_year = payload.get("birth_year")
        city = payload.get("city", "").strip() or user["city"]
        bio = payload.get("bio", "").strip()
        goals = payload.get("goals", [])
        interests = payload.get("interests", [])
        communication_style = payload.get("communication_style", "").strip()
        favorite_scene = payload.get("favorite_scene", "").strip()
        availability = payload.get("availability", "").strip()
        budget_preference = payload.get("budget_preference", "").strip()
        tags = ",".join(interests[:6])
        conn.execute(
            """
            UPDATE profiles
            SET nickname = ?, birth_year = ?, city = ?, bio = ?, goals_json = ?, interests_json = ?,
                primary_tags = ?, communication_style = ?, favorite_scene = ?, availability = ?,
                budget_preference = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (
                nickname,
                birth_year,
                city,
                bio,
                json.dumps(goals, ensure_ascii=False),
                json.dumps(interests, ensure_ascii=False),
                tags,
                communication_style,
                favorite_scene,
                availability,
                budget_preference,
                now_iso(),
                user["id"],
            ),
        )
        conn.execute("UPDATE users SET city = ?, name = ? WHERE id = ?", (city, nickname, user["id"]))
        conn.commit()
        profile = conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user["id"],)).fetchone()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"profile": self.serialize_profile(profile)})

    def handle_test_submit(self):
        payload = self.parse_body()
        if payload is None:
            return
        answers = payload.get("answers", {})
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        profile = conn.execute("SELECT interests_json FROM profiles WHERE user_id = ?", (user["id"],)).fetchone()
        interests = json_loads(profile["interests_json"], [])
        result = summarize_result(answers, interests)
        conn.execute(
            "UPDATE profiles SET test_answers_json = ?, test_result_json = ?, updated_at = ? WHERE user_id = ?",
            (
                json.dumps(answers, ensure_ascii=False),
                json.dumps(result, ensure_ascii=False),
                now_iso(),
                user["id"],
            ),
        )
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"result": result})

    def handle_match_intent(self):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        intent = {
            "looking_for": payload.get("looking_for", "").strip(),
            "preferred_scene": payload.get("preferred_scene", "").strip(),
            "schedule": payload.get("schedule", "").strip(),
            "distance": payload.get("distance", "").strip(),
            "notes": payload.get("notes", "").strip(),
        }
        conn.execute(
            "UPDATE profiles SET match_intent_json = ?, updated_at = ? WHERE user_id = ?",
            (json.dumps(intent, ensure_ascii=False), now_iso(), user["id"]),
        )
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"match_intent": intent})

    def handle_activities(self):
        conn = db_conn()
        rows = conn.execute(
            """
            SELECT a.*,
                   (
                     SELECT COUNT(*) FROM activity_signups s
                     WHERE s.activity_id = a.id
                   ) AS signup_count
            FROM activities a
            ORDER BY a.id ASC
            """
        ).fetchall()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"activities": [dict(row) for row in rows]})

    def handle_activity_signup(self, activity_id):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        note = payload.get("note", "").strip()
        try:
            conn.execute(
                "INSERT INTO activity_signups (user_id, activity_id, note, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
                (user["id"], int(activity_id), note, now_iso()),
            )
        except sqlite3.IntegrityError:
            conn.close()
            return self.send_json(HTTPStatus.CONFLICT, {"error": "already_signed"})
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.CREATED, {"ok": True})

    def handle_presale_submit(self):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        plan_name = payload.get("plan_name", "").strip()
        amount = int(payload.get("amount", 0))
        note = payload.get("note", "").strip()
        if not plan_name or amount <= 0:
            conn.close()
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_presale"})
        conn.execute(
            "INSERT INTO presale_orders (user_id, plan_name, amount, note, status, created_at) VALUES (?, ?, ?, ?, 'intent_confirmed', ?)",
            (user["id"], plan_name, amount, note, now_iso()),
        )
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.CREATED, {"ok": True})

    def handle_social_users(self, query_string):
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        query = parse_qs(query_string)
        search = query.get("search", [""])[0].strip()
        city = query.get("city", [""])[0].strip()
        tag = query.get("tag", [""])[0].strip()
        sql = """
            SELECT users.id, users.name, users.city, users.created_at,
                   profiles.nickname, profiles.bio, profiles.goals_json, profiles.interests_json,
                   profiles.primary_tags, profiles.communication_style, profiles.favorite_scene,
                   profiles.availability, profiles.test_result_json, profiles.review_status
            FROM users
            JOIN profiles ON profiles.user_id = users.id
            WHERE users.role = 'user' AND users.id != ? AND profiles.review_status != 'flagged'
        """
        params = [user["id"]]
        if search:
            wildcard = f"%{search}%"
            sql += " AND (users.name LIKE ? OR users.city LIKE ? OR profiles.bio LIKE ? OR profiles.primary_tags LIKE ?)"
            params.extend([wildcard, wildcard, wildcard, wildcard])
        if city:
            sql += " AND users.city LIKE ?"
            params.append(f"%{city}%")
        if tag:
            sql += " AND profiles.primary_tags LIKE ?"
            params.append(f"%{tag}%")
        sql += " ORDER BY profiles.review_status = 'approved' DESC, users.created_at DESC LIMIT 80"
        rows = conn.execute(sql, params).fetchall()
        relations = self.social_relation_map(conn, user["id"])
        conn.close()
        return self.send_json(
            HTTPStatus.OK,
            {"users": [self.serialize_social_user(row, relations.get(row["id"], "none")) for row in rows]},
        )

    def handle_social_relations(self):
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        current_id = user["id"]
        incoming = conn.execute(
            """
            SELECT fr.id AS request_id, fr.message, fr.created_at,
                   users.id, users.name, users.city, profiles.nickname, profiles.bio,
                   profiles.interests_json, profiles.primary_tags, profiles.favorite_scene,
                   profiles.test_result_json, profiles.review_status
            FROM friend_requests fr
            JOIN users ON users.id = fr.requester_id
            JOIN profiles ON profiles.user_id = users.id
            WHERE fr.addressee_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            """,
            (current_id,),
        ).fetchall()
        outgoing = conn.execute(
            """
            SELECT fr.id AS request_id, fr.message, fr.created_at,
                   users.id, users.name, users.city, profiles.nickname, profiles.bio,
                   profiles.interests_json, profiles.primary_tags, profiles.favorite_scene,
                   profiles.test_result_json, profiles.review_status
            FROM friend_requests fr
            JOIN users ON users.id = fr.addressee_id
            JOIN profiles ON profiles.user_id = users.id
            WHERE fr.requester_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            """,
            (current_id,),
        ).fetchall()
        friends = conn.execute(
            """
            SELECT fr.id AS request_id, fr.updated_at,
                   users.id, users.name, users.city, profiles.nickname, profiles.bio,
                   profiles.interests_json, profiles.primary_tags, profiles.favorite_scene,
                   profiles.test_result_json, profiles.review_status
            FROM friend_requests fr
            JOIN users ON users.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END
            JOIN profiles ON profiles.user_id = users.id
            WHERE (fr.requester_id = ? OR fr.addressee_id = ?) AND fr.status = 'accepted'
            ORDER BY fr.updated_at DESC
            """,
            (current_id, current_id, current_id),
        ).fetchall()
        conn.close()
        return self.send_json(
            HTTPStatus.OK,
            {
                "incoming": [self.serialize_social_user(row, "incoming") for row in incoming],
                "outgoing": [self.serialize_social_user(row, "requested") for row in outgoing],
                "friends": [self.serialize_social_user(row, "friend") for row in friends],
            },
        )

    def handle_friend_request(self):
        payload = self.parse_body()
        if payload is None:
            return
        target_id = int(payload.get("target_user_id", 0) or 0)
        message = payload.get("message", "").strip()[:240]
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        if target_id == user["id"] or target_id <= 0:
            conn.close()
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_target"})
        target = conn.execute("SELECT id FROM users WHERE id = ? AND role = 'user'", (target_id,)).fetchone()
        if not target:
            conn.close()
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "user_not_found"})
        existing = conn.execute(
            """
            SELECT * FROM friend_requests
            WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
            """,
            (user["id"], target_id, target_id, user["id"]),
        ).fetchone()
        stamp = now_iso()
        if existing:
            if existing["status"] == "accepted":
                conn.close()
                return self.send_json(HTTPStatus.OK, {"ok": True, "status": "friend"})
            if existing["requester_id"] == target_id and existing["status"] == "pending":
                conn.execute("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?", (stamp, existing["id"]))
                conn.commit()
                conn.close()
                return self.send_json(HTTPStatus.OK, {"ok": True, "status": "friend"})
            conn.execute(
                "UPDATE friend_requests SET status = 'pending', message = ?, updated_at = ? WHERE id = ?",
                (message, stamp, existing["id"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO friend_requests (requester_id, addressee_id, status, message, created_at, updated_at)
                VALUES (?, ?, 'pending', ?, ?, ?)
                """,
                (user["id"], target_id, message, stamp, stamp),
            )
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.CREATED, {"ok": True, "status": "requested"})

    def handle_friend_respond(self):
        payload = self.parse_body()
        if payload is None:
            return
        request_id = int(payload.get("request_id", 0) or 0)
        status = payload.get("status", "").strip()
        if status not in {"accepted", "declined"}:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_friend_status"})
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        row = conn.execute(
            "SELECT id FROM friend_requests WHERE id = ? AND addressee_id = ? AND status = 'pending'",
            (request_id, user["id"]),
        ).fetchone()
        if not row:
            conn.close()
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "request_not_found"})
        conn.execute("UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?", (status, now_iso(), request_id))
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"ok": True, "status": status})

    def handle_social_messages(self, query_string):
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        query = parse_qs(query_string)
        other_id = int(query.get("user_id", ["0"])[0] or 0)
        if not self.are_friends(conn, user["id"], other_id):
            conn.close()
            return self.send_json(HTTPStatus.FORBIDDEN, {"error": "not_friends"})
        rows = conn.execute(
            """
            SELECT id, sender_id, receiver_id, body, created_at
            FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC, id ASC
            LIMIT 120
            """,
            (user["id"], other_id, other_id, user["id"]),
        ).fetchall()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"messages": [dict(row) for row in rows]})

    def handle_message_submit(self):
        payload = self.parse_body()
        if payload is None:
            return
        receiver_id = int(payload.get("receiver_id", 0) or 0)
        body = payload.get("body", "").strip()
        if not body:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "empty_message"})
        conn = db_conn()
        user = self.require_auth(conn)
        if not user:
            conn.close()
            return
        if not self.are_friends(conn, user["id"], receiver_id):
            conn.close()
            return self.send_json(HTTPStatus.FORBIDDEN, {"error": "not_friends"})
        stamp = now_iso()
        cursor = conn.execute(
            "INSERT INTO messages (sender_id, receiver_id, body, created_at) VALUES (?, ?, ?, ?)",
            (user["id"], receiver_id, body[:1000], stamp),
        )
        conn.commit()
        conn.close()
        return self.send_json(
            HTTPStatus.CREATED,
            {"message": {"id": cursor.lastrowid, "sender_id": user["id"], "receiver_id": receiver_id, "body": body[:1000], "created_at": stamp}},
        )

    def handle_support(self):
        return self.send_json(
            HTTPStatus.OK,
            {
                "support": {
                    "wechat": DEFAULT_SUPPORT_WECHAT,
                    "hours": DEFAULT_SUPPORT_HOURS,
                    "message": DEFAULT_SUPPORT_MESSAGE,
                }
            },
        )

    def handle_api_health(self):
        conn = db_conn()
        try:
            user_count = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        finally:
            conn.close()
        return self.send_json(
            HTTPStatus.OK,
            {
                "status": "ok",
                "database": "ok",
                "users": user_count,
                "timestamp": now_iso(),
            },
        )

    def handle_lead_submit(self):
        payload = self.parse_body()
        if payload is None:
            return
        name = payload.get("name", "").strip()
        city = payload.get("city", "").strip()
        contact = payload.get("contact", "").strip()
        note = payload.get("interest_note", "").strip()
        if not all([name, city, contact]):
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "missing_fields"})
        conn = db_conn()
        conn.execute(
            "INSERT INTO leads (name, city, contact, interest_note, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, city, contact, note, now_iso()),
        )
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.CREATED, {"ok": True})

    def handle_admin_overview(self):
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        overview = {
            "users": conn.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'user'").fetchone()["count"],
            "pending_reviews": conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM profiles
                JOIN users ON users.id = profiles.user_id
                WHERE users.role = 'user' AND profiles.review_status = 'pending'
                """
            ).fetchone()["count"],
            "matched_users": conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM profiles
                JOIN users ON users.id = profiles.user_id
                WHERE users.role = 'user' AND profiles.match_status IN ('shortlisted', 'invited', 'active')
                """
            ).fetchone()["count"],
            "activity_signups": conn.execute("SELECT COUNT(*) AS count FROM activity_signups").fetchone()["count"],
            "presales": conn.execute("SELECT COUNT(*) AS count FROM presale_orders").fetchone()["count"],
            "leads": conn.execute("SELECT COUNT(*) AS count FROM leads").fetchone()["count"],
            "friend_requests": conn.execute("SELECT COUNT(*) AS count FROM friend_requests").fetchone()["count"],
            "messages": conn.execute("SELECT COUNT(*) AS count FROM messages").fetchone()["count"],
        }
        conn.close()
        return self.send_json(HTTPStatus.OK, {"overview": overview})

    def handle_admin_users(self, query_string):
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        query = parse_qs(query_string)
        search = query.get("search", [""])[0].strip()
        tag = query.get("tag", [""])[0].strip()
        sql = """
            SELECT users.id, users.name, users.email, users.city, users.created_at,
                   profiles.nickname, profiles.primary_tags, profiles.review_status, profiles.match_status,
                   profiles.communication_style, profiles.favorite_scene
            FROM users
            JOIN profiles ON profiles.user_id = users.id
            WHERE users.role = 'user'
        """
        params = []
        if search:
            sql += " AND (users.name LIKE ? OR users.email LIKE ? OR users.city LIKE ?)"
            wildcard = f"%{search}%"
            params.extend([wildcard, wildcard, wildcard])
        if tag:
            sql += " AND profiles.primary_tags LIKE ?"
            params.append(f"%{tag}%")
        sql += " ORDER BY users.created_at DESC"
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"users": [dict(row) for row in rows]})

    def handle_admin_leads(self, query_string):
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        query = parse_qs(query_string)
        search = query.get("search", [""])[0].strip()
        sql = """
            SELECT id, name, city, contact, interest_note, created_at
            FROM leads
            WHERE 1 = 1
        """
        params = []
        if search:
            wildcard = f"%{search}%"
            sql += " AND (name LIKE ? OR city LIKE ? OR contact LIKE ? OR interest_note LIKE ?)"
            params.extend([wildcard, wildcard, wildcard, wildcard])
        sql += " ORDER BY created_at DESC LIMIT 120"
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"leads": [dict(row) for row in rows]})

    def handle_admin_review(self, user_id):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        status = payload.get("review_status", "").strip()
        if status not in {"pending", "approved", "flagged"}:
            conn.close()
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_review_status"})
        conn.execute("UPDATE profiles SET review_status = ?, updated_at = ? WHERE user_id = ?", (status, now_iso(), int(user_id)))
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"ok": True})

    def handle_admin_match_status(self, user_id):
        payload = self.parse_body()
        if payload is None:
            return
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        status = payload.get("match_status", "").strip()
        if status not in {"new", "shortlisted", "invited", "active", "hold"}:
            conn.close()
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_match_status"})
        conn.execute("UPDATE profiles SET match_status = ?, updated_at = ? WHERE user_id = ?", (status, now_iso(), int(user_id)))
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"ok": True})

    def handle_admin_change_password(self):
        payload = self.parse_body()
        if payload is None:
            return
        current_password = payload.get("current_password", "")
        new_password = payload.get("new_password", "")
        if len(new_password) < 8:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "new_password_too_short"})

        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return

        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row or not verify_password(current_password, row["password_hash"]):
            conn.close()
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "current_password_invalid"})

        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), user["id"]))
        conn.commit()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"ok": True})

    def handle_admin_presales(self):
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        rows = conn.execute(
            """
            SELECT presale_orders.id, users.name, users.email, users.city,
                   presale_orders.plan_name, presale_orders.amount, presale_orders.status, presale_orders.created_at
            FROM presale_orders
            JOIN users ON users.id = presale_orders.user_id
            ORDER BY presale_orders.created_at DESC
            """
        ).fetchall()
        conn.close()
        return self.send_json(HTTPStatus.OK, {"presales": [dict(row) for row in rows]})

    def handle_admin_export(self):
        conn = db_conn()
        user = self.require_auth(conn, admin=True)
        if not user:
            conn.close()
            return
        rows = conn.execute(
            """
            SELECT activity_signups.id, users.name, users.email, users.city,
                   activities.title, activities.date_label, activities.location,
                   activity_signups.status, activity_signups.note, activity_signups.created_at
            FROM activity_signups
            JOIN users ON users.id = activity_signups.user_id
            JOIN activities ON activities.id = activity_signups.activity_id
            ORDER BY activity_signups.created_at DESC
            """
        ).fetchall()
        conn.close()

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["id", "name", "email", "city", "activity", "date", "location", "status", "note", "created_at"])
        for row in rows:
            writer.writerow([row["id"], row["name"], row["email"], row["city"], row["title"], row["date_label"], row["location"], row["status"], row["note"], row["created_at"]])
        body = buffer.getvalue().encode("utf-8-sig")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="activity-signups.csv"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serialize_profile(self, profile):
        if not profile:
            return None
        return {
            "nickname": profile["nickname"],
            "birth_year": profile["birth_year"],
            "city": profile["city"],
            "bio": profile["bio"],
            "goals": json_loads(profile["goals_json"], []),
            "interests": json_loads(profile["interests_json"], []),
            "primary_tags": profile["primary_tags"],
            "communication_style": profile["communication_style"],
            "favorite_scene": profile["favorite_scene"],
            "availability": profile["availability"],
            "budget_preference": profile["budget_preference"],
            "test_answers": json_loads(profile["test_answers_json"], {}),
            "test_result": json_loads(profile["test_result_json"], {}),
            "match_intent": json_loads(profile["match_intent_json"], {}),
            "review_status": profile["review_status"],
            "match_status": profile["match_status"],
        }

    def serialize_social_user(self, row, relation_status="none"):
        interests = json_loads(row["interests_json"], [])
        result = json_loads(row["test_result_json"], {})
        display_name = row["nickname"] or row["name"]
        return {
            "id": row["id"],
            "request_id": row["request_id"] if "request_id" in row.keys() else None,
            "name": display_name,
            "city": row["city"],
            "bio": row["bio"] or "这个用户还没有写自我介绍，可以先从兴趣标签开始破冰。",
            "interests": interests,
            "primary_tags": row["primary_tags"] or "未填写",
            "favorite_scene": row["favorite_scene"] or "城市现场",
            "test_title": result.get("title", "同频画像待生成"),
            "review_status": row["review_status"],
            "relation_status": relation_status,
        }

    def social_relation_map(self, conn, user_id):
        rows = conn.execute(
            """
            SELECT requester_id, addressee_id, status
            FROM friend_requests
            WHERE requester_id = ? OR addressee_id = ?
            """,
            (user_id, user_id),
        ).fetchall()
        relations = {}
        for row in rows:
            other_id = row["addressee_id"] if row["requester_id"] == user_id else row["requester_id"]
            if row["status"] == "accepted":
                relations[other_id] = "friend"
            elif row["status"] == "pending" and row["requester_id"] == user_id:
                relations[other_id] = "requested"
            elif row["status"] == "pending" and row["addressee_id"] == user_id:
                relations[other_id] = "incoming"
            elif other_id not in relations:
                relations[other_id] = row["status"]
        return relations

    def are_friends(self, conn, user_id, other_id):
        if not other_id or user_id == other_id:
            return False
        row = conn.execute(
            """
            SELECT id FROM friend_requests
            WHERE status = 'accepted'
              AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
            """,
            (user_id, other_id, other_id, user_id),
        ).fetchone()
        return row is not None


def run():
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"TongPin Local is running at http://{host}:{port}")
    if os.environ.get("TONGPIN_SHOW_ADMIN_PASSWORD", "0").lower() in {"1", "true", "yes"}:
        print(f"Admin login: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    else:
        print(f"Admin email: {ADMIN_EMAIL}")
    server.serve_forever()


if __name__ == "__main__":
    run()
