import os
import subprocess
import json
import sys
import tkinter as tk
from tkinter import filedialog
from flask import Flask, request, jsonify, render_template
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.abspath(".")
# ---------------------------------------------------------------
#  FLASK INITIALIZATION (supports PyInstaller bundle)
# ---------------------------------------------------------------
if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(
    __name__,
    template_folder=os.path.join(base_path, "templates"),
    static_folder=os.path.join(base_path, "static")
)
else:
    app = Flask(__name__)

# ---------------------------------------------------------------
#  GLOBAL STATE
# ---------------------------------------------------------------
CURRENT_REPO = None
RECENT_REPOS = []
GEMINI_SCRIPT = r"C:\Users\mohdi\autocommit-tool\autocommit_gemini.py"

# ---------------------------------------------------------------
#  HELPERS
# ---------------------------------------------------------------
def load_recent_repos():
    return RECENT_REPOS

def save_recent_repo(path):
    global RECENT_REPOS
    if path in RECENT_REPOS:
        RECENT_REPOS.remove(path)
    RECENT_REPOS.insert(0, path)
    RECENT_REPOS = RECENT_REPOS[:10]

def run_git_cmd(command, repo_path=None):
    repo = repo_path or CURRENT_REPO
    if not repo:
        return {"error": "No repo selected"}

    full_cmd = f'cd "{repo}" && {command}'

    try:
        result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {"error": str(e)}

# ---------------------------------------------------------------
#  ROUTES
# ---------------------------------------------------------------
@app.route("/")
def home():
    return render_template("index.html")

# File chooser dialog (desktop)
@app.route("/select-repo-dialog", methods=["POST"])
def select_repo_dialog():
    global CURRENT_REPO

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder = filedialog.askdirectory()
    root.destroy()

    if folder:
        CURRENT_REPO = folder
        save_recent_repo(folder)
        return jsonify({"status": "success", "repo": folder})

    return jsonify({"status": "cancel"})

@app.route("/set-repo", methods=["POST"])
def set_repo():
    global CURRENT_REPO

    repo = request.json.get("repo")
    if repo and os.path.isdir(repo):
        CURRENT_REPO = repo
        save_recent_repo(repo)
        return jsonify({"status": "success", "repo": repo})

    return jsonify({"status": "error", "message": "Invalid repo path"})

@app.route("/get-current-repo")
def get_current_repo():
    global CURRENT_REPO
    if not CURRENT_REPO:
        repos = load_recent_repos()
        if repos:
            CURRENT_REPO = repos[0]
    return jsonify({"repo": CURRENT_REPO})

@app.route("/get-recent-repos")
def get_recent_repos():
    return jsonify(load_recent_repos())

# ----------------- Git Status (staged/unstaged) -----------------
@app.route("/get-status")
def get_status():
    if not CURRENT_REPO:
        return jsonify({"error": "No repo selected"})

    res = run_git_cmd("git status --porcelain")
    if res.get("error"):
        return jsonify(res)

    staged, unstaged = [], []
    for line in res["stdout"].splitlines():
        if len(line) < 4:
            continue
        code = line[:2]
        file = line[3:]
        if code[0] in ["M", "A", "D", "R", "C"]:
            staged.append({"status": code, "file": file})
        else:
            unstaged.append({"status": code, "file": file})

    return jsonify({"staged": staged, "unstaged": unstaged})

# ----------------- Commit History -----------------
@app.route("/get-history")
def history():
    if not CURRENT_REPO:
        return jsonify([])

    cmd = 'git log -n 50 --pretty=format:"%h|%an|%ar|%s"'
    res = run_git_cmd(cmd)
    commits = []

    for line in res["stdout"].splitlines():
        parts = line.split("|")
        if len(parts) >= 4:
            commits.append({
                "hash": parts[0],
                "author": parts[1],
                "time": parts[2],
                "message": "|".join(parts[3:])
            })

    return jsonify(commits)

# ----------------- Branches -----------------
@app.route("/get-branches")
def branches():
    res = run_git_cmd("git branch")
    branch_list = []
    current = ""

    for line in res["stdout"].splitlines():
        name = line.replace("*", "").strip()
        if line.startswith("*"):
            current = name
        branch_list.append(name)

    return jsonify({"branches": branch_list, "current": current})

@app.route("/switch-branch", methods=["POST"])
def switch_branch():
    name = request.json.get("name")
    return jsonify(run_git_cmd(f"git checkout {name}"))

@app.route("/create-branch", methods=["POST"])
def create_branch():
    name = request.json.get("name")
    return jsonify(run_git_cmd(f"git checkout -b {name}"))

# ----------------- Staging / Commit -----------------
@app.route("/git-add", methods=["POST"])
def git_add():
    file = request.json.get("file")
    return jsonify(run_git_cmd(f'git add "{file}"'))

@app.route("/git-add-all", methods=["POST"])
def git_add_all():
    return jsonify(run_git_cmd("git add ."))

@app.route("/git-reset", methods=["POST"])
def git_reset():
    file = request.json.get("file")
    return jsonify(run_git_cmd(f'git reset HEAD "{file}"'))

@app.route("/manual-commit", methods=["POST"])
def manual_commit():
    msg = request.json.get("message")
    return jsonify(run_git_cmd(f'git commit -m "{msg}"'))

@app.route("/get-remotes")
def get_remotes():
    if not CURRENT_REPO:
        return jsonify([])
    
    res = run_git_cmd("git remote")
    remotes = [r.strip() for r in res["stdout"].splitlines() if r.strip()]
    return jsonify(remotes)

@app.route("/git-pull", methods=["POST"])
def git_pull():
    remote = request.json.get("remote", "origin")
    branch = request.json.get("branch", "main")
    return jsonify(run_git_cmd(f"git pull {remote} {branch}"))

@app.route("/git-push", methods=["POST"])
def git_push():
    remote = request.json.get("remote", "origin")
    branch = request.json.get("branch")
    
    # If branch is specified, push to that specific branch on remote
    # Syntax: git push <remote> HEAD:<branch>
    cmd = f"git push {remote} HEAD"
    if branch:
        cmd = f"git push {remote} HEAD:{branch}"
        
    return jsonify(run_git_cmd(cmd))

# ----------------- Terminal Command -----------------
@app.route("/run-command", methods=["POST"])
def run_command():
    cmd = request.json.get("command")
    return jsonify(run_git_cmd(cmd))

# ----------------- AI Commit -----------------
@app.route("/ai-commit", methods=["POST"])
def ai_commit():
    if not CURRENT_REPO:
        return jsonify({"error": "No repo selected"})

    full = f'cd "{CURRENT_REPO}" && python "{GEMINI_SCRIPT}" --yes'
    result = subprocess.run(full, shell=True, capture_output=True, text=True)
    return jsonify({"stdout": result.stdout, "stderr": result.stderr})

# ---------------------------------------------------------------
#  START SERVER
# ---------------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=False, use_reloader=False)
