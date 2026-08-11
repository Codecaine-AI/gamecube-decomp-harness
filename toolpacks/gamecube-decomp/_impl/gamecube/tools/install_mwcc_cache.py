#!/usr/bin/env python3
"""Install or uninstall the MWCC object-cache shim in a Melee worktree."""

import argparse
import os
import sys
from pathlib import Path


INSTALL_MARKER = b"# Installed by install_mwcc_cache.py (MWCC object cache).\n"


class InstallError(Exception):
    """An expected, user-correctable installation error."""


def _worktree_path(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"worktree is not a directory: {path}")
    return path


def _split_shebang(data: bytes, path: Path) -> tuple[bytes, bytes]:
    first_line, separator, remainder = data.partition(b"\n")
    if not separator or not first_line.startswith(b"#!"):
        raise InstallError(f"shim has no valid shebang: {path}")
    return first_line, remainder


def _installed_payload(shim: Path) -> bytes:
    try:
        source = shim.read_bytes()
    except OSError as error:
        raise InstallError(f"cannot read shim {shim}: {error}") from error

    _split_shebang(source, shim)
    interpreter = os.fsencode(sys.executable)
    if not os.path.isabs(sys.executable):
        raise InstallError(f"Python interpreter path is not absolute: {sys.executable}")
    if b"\n" in interpreter or b"\r" in interpreter or b" " in interpreter:
        raise InstallError(
            "Python interpreter path cannot be represented safely in a POSIX "
            f"shebang: {sys.executable}"
        )

    _source_shebang, source_body = _split_shebang(source, shim)
    return b"#!" + interpreter + b"\n" + INSTALL_MARKER + source_body


def _looks_like_installed_shim(path: Path, shim: Path) -> bool:
    if path.is_symlink():
        try:
            return path.resolve() == shim.resolve()
        except OSError:
            return False
    if not path.is_file():
        return False
    try:
        with path.open("rb") as stream:
            first_line = stream.readline()
            second_line = stream.readline()
    except OSError:
        return False
    return first_line.startswith(b"#!") and second_line == INSTALL_MARKER


def _write_atomic_executable(path: Path, payload: bytes, source_mode: int) -> None:
    temporary = path.with_name(f".{path.name}.mwcc-cache-{os.getpid()}.tmp")
    descriptor = -1
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = -1
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, (source_mode & 0o777) | 0o111)
        os.replace(temporary, path)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def install(worktree: Path) -> None:
    tools_dir = worktree / "build" / "tools"
    wibo = tools_dir / "wibo"
    real_wibo = tools_dir / "wibo-real"
    shim = Path(__file__).resolve().with_name("mwcc_objcache.py")

    if not tools_dir.is_dir():
        raise InstallError(f"worktree has no build/tools directory: {tools_dir}")
    if real_wibo.exists() or real_wibo.is_symlink():
        raise InstallError(
            f"refusing to install twice: backup already exists at {real_wibo}"
        )
    if not wibo.exists() and not wibo.is_symlink():
        raise InstallError(f"real wibo was not found at {wibo}")
    if not wibo.is_file():
        raise InstallError(f"wibo is not a file: {wibo}")
    if _looks_like_installed_shim(wibo, shim):
        raise InstallError(
            f"refusing to install twice: {wibo} is already the cache shim"
        )
    if not shim.is_file():
        raise InstallError(f"cache shim was not found at {shim}")

    payload = _installed_payload(shim)
    source_mode = shim.stat().st_mode
    wibo.rename(real_wibo)
    print(f"Renamed real wibo: {wibo} -> {real_wibo}")
    try:
        _write_atomic_executable(wibo, payload, source_mode)
    except BaseException:
        try:
            if not wibo.exists() and not wibo.is_symlink():
                real_wibo.rename(wibo)
                print(f"Rolled back real wibo: {real_wibo} -> {wibo}", file=sys.stderr)
        except OSError as rollback_error:
            print(
                f"Rollback failed; restore {real_wibo} to {wibo}: {rollback_error}",
                file=sys.stderr,
            )
        raise

    print(f"Installed MWCC object-cache shim: {shim} -> {wibo} (copy)")
    print(f"Pinned shim interpreter: {sys.executable}")


def uninstall(worktree: Path) -> None:
    tools_dir = worktree / "build" / "tools"
    wibo = tools_dir / "wibo"
    real_wibo = tools_dir / "wibo-real"
    shim = Path(__file__).resolve().with_name("mwcc_objcache.py")

    if not tools_dir.is_dir():
        raise InstallError(f"worktree has no build/tools directory: {tools_dir}")
    if not real_wibo.exists() and not real_wibo.is_symlink():
        raise InstallError(f"cache is not installed: backup not found at {real_wibo}")
    if not real_wibo.is_file():
        raise InstallError(f"wibo backup is not a file: {real_wibo}")
    if wibo.exists() or wibo.is_symlink():
        if not _looks_like_installed_shim(wibo, shim):
            raise InstallError(
                f"refusing to overwrite unexpected file at {wibo}; "
                f"the real binary remains at {real_wibo}"
            )

    os.replace(real_wibo, wibo)
    print(f"Uninstalled MWCC object-cache shim and restored: {real_wibo} -> {wibo}")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Wire the MWCC object cache into a Melee production worktree.\n"
            "\n"
            "Installation renames build/tools/wibo to build/tools/wibo-real, "
            "then installs\n"
            "the cache shim at build/tools/wibo. Existing Ninja commands keep "
            "calling wibo;\n"
            "the shim serves cache hits and invokes the sibling wibo-real on "
            "misses."
        ),
        epilog=(
            "MWCC cache environment variables:\n"
            "  MWCC_CACHE_DEPMODE     Dependency-file mode: synthesize "
            "(default), or strict\n"
            "                         to restore the v1 raw-.d cache rules.\n"
            "  MWCC_CACHE_DIR         Cache directory (default: "
            "/tmp/mwcc-objcache).\n"
            "  MWCC_CACHE_DISABLE     Set to 1 to bypass the cache and invoke "
            "real wibo.\n"
            "  MWCC_CACHE_REAL_WIBO   Real wibo path (default: wibo-real next "
            "to the shim).\n"
            "  MWCC_CACHE_STATS       Set to 1 to print aggregate hit/miss "
            "counts.\n"
            "  MWCC_CACHE_VERIFY      Set to 1 to compile on hits, verify the "
            "cached .o,\n"
            "                         and poison mismatching entries.\n"
            "\n"
            "Boolean variables are enabled only by the exact value 1."
        ),
    )
    parser.add_argument(
        "--uninstall",
        action="store_true",
        help="remove the shim and restore build/tools/wibo-real",
    )
    parser.add_argument("worktree", type=_worktree_path, help="path to a Melee worktree")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.uninstall:
            uninstall(args.worktree)
        else:
            install(args.worktree)
    except InstallError as error:
        print(f"install_mwcc_cache.py: {error}", file=sys.stderr)
        return 1
    except OSError as error:
        print(f"install_mwcc_cache.py: filesystem error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
