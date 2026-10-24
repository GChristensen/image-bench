#!/usr/bin/env python3
"""Package the diffusion-prompting Claude skill.

Usage:
    python skills/diffusion-prompting/build_skill.py [--release]

Writes dist/<skill-name>.zip next to this script, with a top-level <skill-name>/ folder, ready to upload to
claude.ai or unpack into ~/.claude/skills/. The archive holds skill/ (SKILL.md, examples/) and references/, taken
from the .md and .csv files of model-docs/docs (subfolders flattened). Only the references SKILL.md names as
`references/<file>` are packaged; docs it does not name are listed, a named one that is missing fails the build.

The skill name is read from the `name:` field of skill/SKILL.md.

With --release the archive is also uploaded to the skills release of the GitHub repository (created when missing),
replacing the previous upload, so its download URL stays the same. Needs the GitHub CLI, signed in (gh auth login).
"""
import re
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL_DIR = HERE / "skill"
DOCS_DIR = HERE.parent.parent / "model-docs" / "docs"
DIST_DIR = HERE / "dist"
REFERENCE_PATTERNS = ("*.md", "*.csv")

GITHUB_REPOSITORY = "GChristensen/image-bench"
RELEASE_TAG = "skills"
RELEASE_TITLE = "Claude skills"
RELEASE_NOTES = ("Claude skills for prompting the models described in the Image Bench Library tab. Upload a zip to "
                 "claude.ai (Settings › Capabilities › Skills) or unpack it into ~/.claude/skills/.")


def skill_name(text: str) -> str:
    match = re.search(r"^name:\s*(\S+)\s*$", text, re.MULTILINE)
    if not match:
        raise SystemExit("skill/SKILL.md has no `name:` in its frontmatter")
    return match.group(1)


def available_docs() -> dict[str, Path]:
    docs = {}
    for pattern in REFERENCE_PATTERNS:
        for path in sorted(DOCS_DIR.rglob(pattern)):
            if path.name in docs:
                raise SystemExit(f"duplicate doc name in model-docs/docs: {path.name}")
            docs[path.name] = path
    return docs


def referenced_docs(text: str) -> list[str]:
    return sorted(set(re.findall(r"references/([\w.+-]+\.(?:md|csv))", text)))


def package(name: str, references: dict[str, Path]) -> Path:
    DIST_DIR.mkdir(exist_ok=True)
    archive = DIST_DIR / f"{name}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(SKILL_DIR.rglob("*")):
            if path.is_file():
                zf.write(path, Path(name) / path.relative_to(SKILL_DIR))
        for file_name, path in references.items():
            zf.write(path, Path(name) / "references" / file_name)
            print(f"references/{file_name}")
    return archive


def gh(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["gh", *args, "--repo", GITHUB_REPOSITORY], check=check)


def upload(archive: Path) -> None:
    if gh("release", "view", RELEASE_TAG, check=False).returncode != 0:
        gh("release", "create", RELEASE_TAG, "--title", RELEASE_TITLE, "--notes", RELEASE_NOTES, "--latest=false")
    gh("release", "upload", RELEASE_TAG, str(archive), "--clobber")
    print(f"uploaded to the {RELEASE_TAG} release: "
          f"https://github.com/{GITHUB_REPOSITORY}/releases/download/{RELEASE_TAG}/{archive.name}")


def main(release: bool = False) -> int:
    text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    name = skill_name(text)
    docs = available_docs()
    wanted = referenced_docs(text)
    missing = [file_name for file_name in wanted if file_name not in docs]
    if missing:
        raise SystemExit(f"SKILL.md names references missing from model-docs/docs: {', '.join(missing)}")
    unused = sorted(set(docs) - set(wanted))
    if unused:
        print(f"not named in SKILL.md, left out: {', '.join(unused)}")
    archive = package(name, {file_name: docs[file_name] for file_name in wanted})
    print(f"built {archive.relative_to(HERE.parent.parent)}")
    if release:
        upload(archive)
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--release" in sys.argv[1:]))