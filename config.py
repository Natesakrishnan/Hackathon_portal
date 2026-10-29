import os
import logging
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class Config:
    """Base application configuration with safe MySQL URI construction and configurable fallback."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "synex-default-secret-key-change-me")

    # Session Configuration
    PERMANENT_SESSION_LIFETIME = timedelta(
        hours=int(os.environ.get("ADMIN_SESSION_LIFETIME_HOURS", 12))
    )
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("FLASK_ENV") == "production"

    # Database Configuration from Environment Variables
    DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
    DB_PORT = int(os.environ.get("DB_PORT", 3306))
    DB_NAME = os.environ.get("DB_NAME", "synex_hackathon")
    DB_USER = os.environ.get("DB_USER", "synex_app")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

    # Explicit switch to allow or forbid SQLite fallback
    # If false, application will raise a clear exception if MySQL is unavailable
    USE_SQLITE_FALLBACK = os.environ.get("USE_SQLITE_FALLBACK", "false").strip().lower() in ("true", "1", "yes")

    # Optional direct DATABASE_URL override
    DATABASE_URL = os.environ.get("DATABASE_URL")

    # SQLAlchemy Engine Configuration
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": int(os.environ.get("DB_POOL_SIZE", 10)),
        "max_overflow": int(os.environ.get("DB_MAX_OVERFLOW", 20)),
        "pool_recycle": int(os.environ.get("DB_POOL_RECYCLE", 280)),
        "pool_pre_ping": True,
    }

    # Razorpay Payment Gateway
    RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_SYNEX_DEMO_KEY")
    RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "synex_razorpay_secret_test_2026")
    RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "synex_webhook_secret_test_2026")

    # Hackathon Business Rules
    EVENT_NAME = os.environ.get("EVENT_NAME", "SYNEX 2026")
    EVENT_INDIVIDUAL_FEE = int(os.environ.get("EVENT_INDIVIDUAL_FEE", 299))
    EVENT_TEAM_FEE = int(os.environ.get("EVENT_TEAM_FEE", 999))
    EVENT_CURRENCY = os.environ.get("EVENT_CURRENCY", "INR")
    MIN_TEAM_MEMBERS = 2
    MAX_TEAM_MEMBERS = 4

    # Email & Discord Notifications
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "True").lower() in ("true", "1")
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER", "SYNEX Hackathon Team <noreply@synex.org>")
    DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL")

    # CSRF
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None

    @classmethod
    def build_mysql_uri(cls) -> str:
        """
        Builds a safe MySQL SQLAlchemy connection URI using URL.create
        which properly escapes special characters in passwords.
        """
        from sqlalchemy.engine import URL
        url_obj = URL.create(
            drivername="mysql+pymysql",
            username=cls.DB_USER,
            password=cls.DB_PASSWORD,
            host=cls.DB_HOST,
            port=cls.DB_PORT,
            database=cls.DB_NAME,
            query={"charset": "utf8mb4"},
        )
        return url_obj.render_as_string(hide_password=False)

    @classmethod
    def get_database_uri(cls) -> str:
        """
        Determines the database URI.
        1. If DATABASE_URL is set and non-empty, uses it.
        2. Otherwise, constructs the PyMySQL URI using build_mysql_uri().
        3. Tests connectivity to MySQL.
        4. If MySQL is unreachable:
           - If USE_SQLITE_FALLBACK is True: falls back to SQLite with a log warning.
           - If USE_SQLITE_FALLBACK is False: raises a clear non-sensitive RuntimeError.
        """
        if cls.DATABASE_URL and cls.DATABASE_URL.strip():
            target_uri = cls.DATABASE_URL.strip()
        else:
            target_uri = cls.build_mysql_uri()

        if target_uri.startswith("mysql"):
            try:
                import pymysql
                if cls.DATABASE_URL and cls.DATABASE_URL.strip():
                    from urllib.parse import urlparse
                    parsed = urlparse(target_uri)
                    host = parsed.hostname or cls.DB_HOST
                    port = parsed.port or cls.DB_PORT
                    user = parsed.username or cls.DB_USER
                    password = parsed.password or cls.DB_PASSWORD
                    dbname = parsed.path.lstrip("/").split("?")[0] or cls.DB_NAME
                else:
                    host = cls.DB_HOST
                    port = cls.DB_PORT
                    user = cls.DB_USER
                    password = cls.DB_PASSWORD
                    dbname = cls.DB_NAME

                # Test actual connection
                conn = pymysql.connect(
                    host=host,
                    port=port,
                    user=user,
                    password=password,
                    database=dbname,
                    connect_timeout=2,
                )
                conn.close()
                return target_uri
            except Exception as e:
                err_msg = str(e)
                if cls.USE_SQLITE_FALLBACK:
                    logger.warning(
                        f"MySQL connection check failed ({err_msg}). "
                        f"USE_SQLITE_FALLBACK=true: Falling back to SQLite database (synex_hackathon.db) for local environment."
                    )
                    return "sqlite:///synex_hackathon.db"
                else:
                    logger.error(
                        f"Database Connection Error: Could not connect to MySQL database '{cls.DB_NAME}' at {cls.DB_HOST}:{cls.DB_PORT} as user '{cls.DB_USER}'. "
                        f"USE_SQLITE_FALLBACK=false: Refusing to silently fall back to SQLite."
                    )
                    raise RuntimeError(
                        f"Database Connection Error: Unable to connect to MySQL database '{cls.DB_NAME}' at {cls.DB_HOST}:{cls.DB_PORT} as user '{cls.DB_USER}'. "
                        f"Please ensure the MySQL service is running, the database '{cls.DB_NAME}' exists, and credentials in .env are correct. (Details: {err_msg})"
                    )

        return target_uri

    @classmethod
    def get_safe_db_info(cls, current_uri: str = None) -> str:
        """Returns safe descriptive information about the configured database without revealing credentials."""
        if not current_uri:
            try:
                current_uri = cls.get_database_uri()
            except Exception:
                current_uri = "mysql"
        if "mysql" in current_uri:
            return f"MySQL (Host: {cls.DB_HOST}:{cls.DB_PORT}, DB: {cls.DB_NAME})"
        elif "sqlite" in current_uri:
            return "SQLite (synex_hackathon.db)"
        return "Custom Database"


class DevelopmentConfig(Config):
    """Development environment configuration."""
    DEBUG = True


class TestingConfig(Config):
    """Testing environment configuration using isolated in-memory SQLite."""
    TESTING = True
    DEBUG = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }
    RAZORPAY_KEY_ID = "rzp_test_MOCK_KEY_ID"
    RAZORPAY_KEY_SECRET = "mock_secret_test_key"


class ProductionConfig(Config):
    """Production environment configuration."""
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
