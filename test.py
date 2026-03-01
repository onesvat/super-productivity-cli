import os
import subprocess
import shutil
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "sync-data.extracted.json")
BACKUP_FILE = os.path.join(DATA_DIR, "sync-data.extracted.json.bak")
DEMO_FILE = os.path.join(BASE_DIR, "demo.json")
SP_SCRIPT = os.path.join(BASE_DIR, "sp.py")

def run_sp(*args):
    print(f"\n▶ Running: sp.py {' '.join(args)}")
    env = os.environ.copy()
    env["SP_CLI_DEV_MODE"] = "1"
    result = subprocess.run([sys.executable, SP_SCRIPT, *args], capture_output=True, text=True, input="y\n", env=env)
    if result.returncode != 0:
        print(f"❌ Command failed with return code {result.returncode}")
        print("STDOUT:\n", result.stdout)
        print("STDERR:\n", result.stderr)
        sys.exit(1)
    else:
        print("✓ Success")
        # print(result.stdout.strip())
    return result.stdout

def setup():
    print("Setting up test environment...")
    if os.path.exists(DATA_FILE):
        shutil.copy2(DATA_FILE, BACKUP_FILE)
    if os.path.exists(DEMO_FILE):
        shutil.copy2(DEMO_FILE, DATA_FILE)
    else:
        print("❌ demo.json not found! Please create it first.")
        sys.exit(1)

def teardown():
    print("\nCleaning up test environment...")
    if os.path.exists(BACKUP_FILE):
        shutil.copy2(BACKUP_FILE, DATA_FILE)
        os.remove(BACKUP_FILE)
        print("Restored original data file.")

def main():
    try:
        setup()

        # Test Project
        run_sp("project", "list")
        
        # Test Task
        run_sp("task", "add", "Test Task 1", "--estimate", "1h")
        run_sp("task", "add", "Test Task 2", "--project", "Inbox")
        run_sp("task", "list")
        run_sp("task", "list", "--today")
        run_sp("task", "edit", "Task 1", "--title", "Updated Task 1")
        run_sp("task", "plan", "Updated Task", "2026-03-05", "14:30", "-e", "2h")
        run_sp("task", "log", "Updated Task", "30m")
        run_sp("task", "today", "Updated Task")
        run_sp("task", "done", "Updated Task")
        run_sp("task", "delete", "Test Task 2")
        
        # Test Counter
        run_sp("counter", "add", "Test Click", "--type", "ClickCounter")
        run_sp("counter", "add", "Test Watch", "--type", "StopWatch", "--countdown", "30m")
        run_sp("counter", "add", "Test Streak", "--type", "ClickCounter", "--track-streaks", "--streak-mode", "weekly-frequency", "--streak-freq", "3")
        run_sp("counter", "list")
        run_sp("counter", "toggle", "Test Click")
        run_sp("counter", "log", "Test Click", "5")
        run_sp("counter", "delete", "Test Click")
        run_sp("counter", "delete", "Test Watch")
        run_sp("counter", "delete", "Test Streak")
        
        # Test Status
        run_sp("status")
        
        print("\n✅ All tests passed successfully!")

    finally:
        teardown()

if __name__ == "__main__":
    main()
