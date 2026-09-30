#!/usr/bin/env python3
"""Competitor video discovery through a separate (throwaway) Instagram account.

Used only when the official Graph API business_discovery endpoint is not
available to the Meta app. Reads a JSON list of usernames on stdin and prints
a JSON list of videos on stdout:
  [{"source_url", "media_url", "account", "caption", "engagement", "timestamp"}]

Env:
  IG_SCRAPER_USERNAME / IG_SCRAPER_PASSWORD  the separate account (never the salon's)
  IG_SCRAPER_SESSION                          session file (default /var/lib/kali-ai/state/ig-scraper-session.json)
  IG_SCRAPER_MEDIA_PER_ACCOUNT                how many recent posts to look at (default 30)

Exit codes: 0 ok, 2 config, 3 login/challenge, 4 other failure. Errors are
printed as {"error": "...", "code": "..."} on stdout, never the password.
"""
import json
import os
import random
import sys
import time


def fail(code, message, exit_code):
    print(json.dumps({"error": str(message)[:300], "code": code}))
    sys.exit(exit_code)


def main():
    user = os.environ.get("IG_SCRAPER_USERNAME", "").strip()
    password = os.environ.get("IG_SCRAPER_PASSWORD", "")
    if not user or not password:
        fail("CONFIG", "IG_SCRAPER_USERNAME / IG_SCRAPER_PASSWORD not set", 2)
    try:
        from instagrapi import Client
        from instagrapi.exceptions import (ChallengeRequired, LoginRequired,
                                           BadPassword, PleaseWaitFewMinutes,
                                           UserNotFound)
    except ImportError:
        fail("CONFIG", "instagrapi is not installed (pip3 install instagrapi)", 2)

    usernames = [u.strip().lstrip("@") for u in json.load(sys.stdin) if str(u).strip()]
    per_account = int(os.environ.get("IG_SCRAPER_MEDIA_PER_ACCOUNT", "30"))
    session = os.environ.get("IG_SCRAPER_SESSION", "/var/lib/kali-ai/state/ig-scraper-session.json")

    cl = Client()
    cl.delay_range = [2, 5]
    try:
        if os.path.exists(session):
            cl.load_settings(session)
        cl.login(user, password)
        cl.dump_settings(session)
        os.chmod(session, 0o600)
    except (ChallengeRequired, BadPassword, LoginRequired) as e:
        fail("LOGIN", "login/challenge: %s" % type(e).__name__, 3)
    except PleaseWaitFewMinutes:
        fail("RATE_LIMIT", "instagram asked to wait", 3)
    except Exception as e:  # noqa: BLE001
        fail("LOGIN", "login failed: %s" % type(e).__name__, 3)

    out = []
    for i, name in enumerate(usernames):
        if i:
            time.sleep(random.uniform(8, 20))  # stay slow and human-like
        try:
            uid = cl.user_id_from_username(name)
            medias = cl.user_medias(uid, amount=per_account)
        except UserNotFound:
            continue
        except (ChallengeRequired, LoginRequired) as e:
            fail("LOGIN", "session lost: %s" % type(e).__name__, 3)
        except PleaseWaitFewMinutes:
            fail("RATE_LIMIT", "instagram asked to wait", 3)
        except Exception:  # noqa: BLE001 - one bad account must not stop the others
            continue
        for m in medias:
            if m.media_type != 2 or not m.video_url:
                continue
            likes = m.like_count or 0
            comments = m.comment_count or 0
            out.append({
                "source_url": "https://www.instagram.com/%s/%s/" % ("reel" if m.product_type == "clips" else "p", m.code),
                "media_url": str(m.video_url),
                "account": name,
                "caption": (m.caption_text or "")[:1000],
                "engagement": likes + 2 * comments,
                "timestamp": m.taken_at.isoformat() if m.taken_at else None,
            })
    try:
        cl.dump_settings(session)
    except Exception:  # noqa: BLE001
        pass
    out.sort(key=lambda v: v["engagement"], reverse=True)
    print(json.dumps(out))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        fail("ERROR", type(e).__name__, 4)
