"""
Committing an assembled release tree in the checkout of its build repository and pushing it to GitHub:
python tools/commit_release.py <repo_dir>

The version is that of version.txt: the commit is "v<version>", tagged "v<version>"; the branch and the tag are
pushed together (atomic), authenticated through the GitHub CLI (gh auth login first). Refuses a version that is
already tagged and a tree without changes.
"""
import os
import re
import subprocess
import sys

REPOSITORY_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# git credentials from gh, whatever helper git is configured with
GH_CREDENTIALS = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]


def read_version():
    with open(os.path.join(REPOSITORY_DIR, "version.txt"), encoding="utf-8") as file:
        version = file.read().strip()

    if not re.fullmatch(r"\d+(\.\d+)*", version):
        sys.exit(f"version.txt: not a version: {version!r}")

    return version


def git(repo_dir, *args, capture=False, credentials=False):
    command = ["git", "-C", repo_dir, *(GH_CREDENTIALS if credentials else []), *args]
    result = subprocess.run(command, capture_output=capture, text=True)

    if result.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed" + (f":\n{result.stderr.strip()}" if capture else ""))

    return result.stdout if capture else None


def commit_release(repo_dir):
    version = read_version()
    tag = f"v{version}"

    if not os.path.isdir(os.path.join(repo_dir, ".git")):
        sys.exit(f"{repo_dir} is not a git checkout")

    if git(repo_dir, "tag", "--list", tag, capture=True).strip() \
            or git(repo_dir, "ls-remote", "--tags", "origin", f"refs/tags/{tag}", capture=True, credentials=True).strip():
        sys.exit(f"{tag} is already tagged: bump version.txt first")

    git(repo_dir, "add", "--all")

    if not git(repo_dir, "status", "--porcelain", capture=True).strip():
        sys.exit(f"Nothing to commit in {repo_dir}")

    git(repo_dir, "commit", "-m", tag)
    git(repo_dir, "tag", "-a", tag, "-m", tag)
    git(repo_dir, "push", "--atomic", "origin", "HEAD", f"refs/tags/{tag}", credentials=True)

    print(f"Committed and pushed {tag} of {repo_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python tools/commit_release.py <repo_dir>")

    commit_release(os.path.abspath(sys.argv[1]))
