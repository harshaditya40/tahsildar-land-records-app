#!/usr/bin/env python3
"""
Vercel Serverless Function Entrypoint
Routes all API requests and serverless routes to TahsildarHandler
"""

import os
import sys

# Ensure root directory is on Python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Import Tahsildar DPI Handler from server.py
from server import TahsildarHandler

# Export handler for Vercel @vercel/python runtime
class handler(TahsildarHandler):
    pass
