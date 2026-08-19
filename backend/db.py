"""
Database access layer — Azure SQL Database via pyodbc.

Connection string comes from the SQL_CONNECTION_STRING environment
variable — set as a Function App "Application setting" in Azure once
deployed, or in backend/local.settings.json for local testing. Never put
real credentials directly in code: this repo is public.
"""

import os

import pyodbc


def get_connection_string() -> str:
    conn_str = os.environ.get("SQL_CONNECTION_STRING")
    if not conn_str:
        raise RuntimeError(
            "SQL_CONNECTION_STRING environment variable is not set. See backend/README.md."
        )
    return conn_str


def get_db():
    return pyodbc.connect(get_connection_string())


def rows_to_dicts(cursor) -> list[dict]:
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='results' AND xtype='U')
        CREATE TABLE results (
            id INT IDENTITY(1,1) PRIMARY KEY,
            student_id NVARCHAR(200) NOT NULL,
            school_year NVARCHAR(200),
            campus NVARCHAR(200),
            class_name NVARCHAR(200),
            pairs INT NOT NULL,
            round INT NOT NULL,
            moves INT,
            mistakes INT,
            seconds INT NOT NULL,
            score INT NOT NULL,
            played_at NVARCHAR(50) NOT NULL
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='id_claims' AND xtype='U')
        CREATE TABLE id_claims (
            class_name NVARCHAR(200) NOT NULL,
            student_id NVARCHAR(200) NOT NULL,
            device_token NVARCHAR(200) NOT NULL,
            created_at NVARCHAR(50) NOT NULL,
            PRIMARY KEY (class_name, student_id)
        )
        """
    )
    conn.commit()
    conn.close()
