#!/Users/Ford/anaconda3/bin/python3
"""Content-addressed object cache for deterministic MWCC compilations."""

import hashlib
import json
import os
import sys


FORMAT_VERSION = 1
SYNTHESIS_VERSION = 1
_temporary_counter = 0


def _enabled(name):
    return os.environ.get(name) == "1"


def _write_all(descriptor, data):
    view = memoryview(data)
    while view:
        written = os.write(descriptor, view)
        view = view[written:]


def _read_file(path):
    with open(path, "rb") as stream:
        return stream.read()


def _sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        while True:
            chunk = stream.read(131072)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _mkdir(path):
    try:
        os.makedirs(path)
    except FileExistsError:
        pass


def _temporary_path(directory, stem):
    global _temporary_counter
    _mkdir(directory)
    while True:
        _temporary_counter += 1
        path = os.path.join(
            directory,
            ".%s.%d.%d.tmp" % (stem, os.getpid(), _temporary_counter),
        )
        if not os.path.lexists(path):
            return path


def _atomic_write(path, data, mode=0o666):
    directory = os.path.dirname(path) or "."
    temporary = _temporary_path(directory, os.path.basename(path))
    descriptor = -1
    try:
        descriptor = os.open(
            temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode
        )
        _write_all(descriptor, data)
        os.close(descriptor)
        descriptor = -1
        os.replace(temporary, path)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _json_bytes(value):
    return (
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("ascii")


def _load_json(path):
    try:
        return json.loads(_read_file(path))
    except (OSError, ValueError, TypeError):
        return None


def _append_log(path, data):
    _mkdir(os.path.dirname(path))
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o666)
    try:
        _write_all(descriptor, data)
    finally:
        os.close(descriptor)


def _real_wibo():
    configured = os.environ.get("MWCC_CACHE_REAL_WIBO")
    if configured:
        path = os.path.abspath(configured)
    else:
        path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "wibo-real")
    return path


def _exec_real(real_wibo, arguments):
    try:
        os.execv(real_wibo, [real_wibo] + arguments)
    except OSError as error:
        message = "mwcc_objcache: cannot execute %s: %s\n" % (real_wibo, error)
        _write_all(2, os.fsencode(message))
        os._exit(127)


def _basename(argument):
    return argument.replace("\\", "/").rsplit("/", 1)[-1].lower()


def _compile_shape(arguments):
    compiler_indexes = [
        index
        for index, argument in enumerate(arguments)
        if _basename(argument).startswith("mwcc")
        and _basename(argument).endswith(".exe")
    ]
    compile_indexes = [index for index, argument in enumerate(arguments) if argument == "-c"]
    output_indexes = [index for index, argument in enumerate(arguments) if argument == "-o"]
    if (
        len(compiler_indexes) != 1
        or len(compile_indexes) != 1
        or len(output_indexes) != 1
        or "-nosyspath" not in arguments
    ):
        return None
    compile_index = compile_indexes[0]
    output_index = output_indexes[0]
    if compile_index + 1 >= len(arguments) or output_index + 1 >= len(arguments):
        return None
    source_argument = arguments[compile_index + 1]
    output_argument = arguments[output_index + 1]
    source_path = os.path.abspath(source_argument)
    output_directory = os.path.abspath(output_argument)
    if not os.path.isfile(source_path) or not os.path.isdir(output_directory):
        return None

    source_name = source_argument.replace("\\", "/").rsplit("/", 1)[-1]
    source_stem, source_extension = os.path.splitext(source_name)
    if not source_stem or not source_extension:
        return None

    wrapper_indexes = [
        index
        for index, argument in enumerate(arguments)
        if _basename(argument) == "sjiswrap.exe"
    ]
    if len(wrapper_indexes) > 1:
        return None

    normalized_arguments = []
    index = 0
    while index < len(arguments):
        normalized_arguments.append(arguments[index])
        if index == output_index:
            index += 2
        else:
            index += 1

    return {
        "compiler": os.path.abspath(arguments[compiler_indexes[0]]),
        "wrapper": (
            os.path.abspath(arguments[wrapper_indexes[0]]) if wrapper_indexes else None
        ),
        "source": source_path,
        "source_argument": source_argument,
        "output_argument": output_argument,
        "object": os.path.join(output_directory, source_stem + ".o"),
        "depfile": os.path.join(output_directory, source_stem + ".d"),
        "normalized_arguments": normalized_arguments,
    }


def _tool_digest(path, digest_cache):
    canonical_path = os.path.realpath(path)
    stat_result = os.stat(canonical_path)
    cache_key = canonical_path
    cached = digest_cache.get(cache_key)
    if (
        isinstance(cached, dict)
        and cached.get("size") == stat_result.st_size
        and cached.get("mtime_ns") == stat_result.st_mtime_ns
        and cached.get("ctime_ns") == stat_result.st_ctime_ns
        and cached.get("device") == stat_result.st_dev
        and cached.get("inode") == stat_result.st_ino
        and isinstance(cached.get("sha256"), str)
        and len(cached["sha256"]) == 64
    ):
        return cached["sha256"], False

    digest = _sha256_file(canonical_path)
    final_stat = os.stat(canonical_path)
    if (
        final_stat.st_size != stat_result.st_size
        or final_stat.st_mtime_ns != stat_result.st_mtime_ns
    ):
        digest = _sha256_file(canonical_path)
        final_stat = os.stat(canonical_path)
    digest_cache[cache_key] = {
        "size": final_stat.st_size,
        "mtime_ns": final_stat.st_mtime_ns,
        "ctime_ns": final_stat.st_ctime_ns,
        "device": final_stat.st_dev,
        "inode": final_stat.st_ino,
        "sha256": digest,
    }
    return digest, True


def _hash_field(digest, label, data):
    label_bytes = label.encode("ascii")
    digest.update(len(label_bytes).to_bytes(4, "big"))
    digest.update(label_bytes)
    digest.update(len(data).to_bytes(8, "big"))
    digest.update(data)


def _base_key(
    real_digest,
    wrapper_digest,
    compiler_digest,
    arguments,
    source_bytes,
    dependency_mode="strict",
):
    digest = hashlib.sha256()
    _hash_field(digest, "format", str(FORMAT_VERSION).encode("ascii"))
    # Strict mode intentionally omits this field so its keys remain byte-for-byte
    # compatible with the v1 cache format.
    if dependency_mode != "strict":
        _hash_field(digest, "dependency-mode", dependency_mode.encode("ascii"))
    _hash_field(digest, "wibo", real_digest.encode("ascii"))
    _hash_field(
        digest,
        "sjiswrap",
        wrapper_digest.encode("ascii") if wrapper_digest else b"",
    )
    _hash_field(digest, "compiler", compiler_digest.encode("ascii"))
    for argument in arguments:
        _hash_field(digest, "argv", os.fsencode(argument))
    _hash_field(digest, "source", source_bytes)
    return digest.hexdigest()


def _full_key(base_key, dependencies, include_layout, synthesis_manifest=None):
    digest = hashlib.sha256()
    _hash_field(digest, "format", str(FORMAT_VERSION).encode("ascii"))
    _hash_field(digest, "base", base_key.encode("ascii"))
    for dependency in dependencies:
        _hash_field(digest, "dependency-path", os.fsencode(dependency["path"]))
        _hash_field(
            digest, "dependency-content", dependency["sha256"].encode("ascii")
        )
    for directory in include_layout:
        _hash_field(digest, "include-directory", os.fsencode(directory["path"]))
        listing_digest = directory["sha256"]
        _hash_field(
            digest,
            "include-directory-listing",
            listing_digest.encode("ascii") if listing_digest else b"missing",
        )
    if synthesis_manifest is not None:
        # Includes emission kinds and the cwd identity for worktree-only entries.
        # Portable manifests are identical across equivalent checkout roots.
        _hash_field(
            digest, "synthesis-manifest", _json_bytes(synthesis_manifest)
        )
    return digest.hexdigest()


def _directory_listing_digest(path):
    try:
        with os.scandir(path) as iterator:
            entries = sorted(iterator, key=lambda entry: entry.name)
    except FileNotFoundError:
        return None
    digest = hashlib.sha256()
    for entry in entries:
        _hash_field(digest, "name", os.fsencode(entry.name))
        if entry.is_symlink():
            _hash_field(digest, "kind", b"symlink")
            _hash_field(digest, "target", os.fsencode(os.readlink(entry.path)))
        elif entry.is_dir(follow_symlinks=False):
            _hash_field(digest, "kind", b"directory")
        else:
            _hash_field(digest, "kind", b"file")
    return digest.hexdigest()


def _capture_include_layout(arguments, source_path, dependencies, cwd):
    roots = [os.path.dirname(source_path)]
    for index, argument in enumerate(arguments[:-1]):
        if argument.lower() == "-i":
            roots.append(os.path.abspath(arguments[index + 1]))
    for dependency in dependencies:
        roots.append(
            os.path.dirname(
                os.path.abspath(
                    os.path.join(cwd, dependency["path"].replace("\\", os.sep))
                )
            )
        )

    directories = []
    seen = set()
    for root in roots:
        relative_root = os.path.relpath(root, cwd)
        if relative_root in seen:
            continue
        if not os.path.isdir(root):
            seen.add(relative_root)
            directories.append({"path": relative_root, "sha256": None})
            continue
        walk_error = []

        def record_error(error):
            walk_error.append(error)

        for directory, child_directories, _files in os.walk(
            root, topdown=True, followlinks=False, onerror=record_error
        ):
            if walk_error:
                raise walk_error[0]
            child_directories.sort()
            relative = os.path.relpath(directory, cwd)
            if relative in seen:
                child_directories[:] = []
                continue
            seen.add(relative)
            directories.append(
                {"path": relative, "sha256": _directory_listing_digest(directory)}
            )
        if walk_error:
            raise walk_error[0]
    directories.sort(key=lambda directory: directory["path"])
    return directories


def _validate_include_layout(include_layout, cwd):
    if not isinstance(include_layout, list) or not include_layout:
        return "missing or invalid include-directory layout"
    for directory in include_layout:
        if not isinstance(directory, dict):
            return "invalid include-directory record"
        path = directory.get("path")
        expected_digest = directory.get("sha256")
        if not isinstance(path, str) or (
            expected_digest is not None and not isinstance(expected_digest, str)
        ):
            return "invalid include-directory record"
        if _is_absolute_dependency(os.fsencode(path)):
            return "absolute include-directory path in manifest: %s" % path
        try:
            actual_digest = _directory_listing_digest(os.path.join(cwd, path))
        except OSError:
            return "cannot inspect include directory: %s" % path
        if actual_digest != expected_digest:
            return "include-directory contents changed: %s" % path
    return None


def _make_tokens(data):
    tokens = []
    token = bytearray()
    index = 0
    while index < len(data):
        byte = data[index]
        if byte == 92 and index + 1 < len(data):
            following = data[index + 1]
            if following == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 2
                continue
            if following == 13 and index + 2 < len(data) and data[index + 2] == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 3
                continue
            if following in (9, 32, 35):
                token.append(following)
                index += 2
                continue
            token.append(byte)
            index += 1
            continue
        if byte in (9, 10, 13, 32):
            if token:
                tokens.append(bytes(token))
                token.clear()
            index += 1
            continue
        token.append(byte)
        index += 1
    if token:
        tokens.append(bytes(token))
    return tokens


def _make_synthesis_tokens(data):
    """Tokenize MWCC make syntax without mistaking ``\\#`` for an escape."""
    tokens = []
    token = bytearray()
    index = 0
    while index < len(data):
        byte = data[index]
        if byte == 92 and index + 1 < len(data):
            following = data[index + 1]
            if following == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 2
                continue
            if following == 13 and index + 2 < len(data) and data[index + 2] == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 3
                continue
            # MWCC escapes spaces in paths. A backslash before '#', '$', or '%'
            # is an ordinary Windows path separator, not a Make escape.
            if following in (9, 32):
                token.append(following)
                index += 2
                continue
            token.append(byte)
            index += 1
            continue
        if byte in (9, 10, 13, 32):
            if token:
                tokens.append(bytes(token))
                token.clear()
            index += 1
            continue
        token.append(byte)
        index += 1
    if token:
        tokens.append(bytes(token))
    return tokens


def _split_depfile(data):
    """Return Makefile target and dependency tokens with Windows slashes intact."""
    separator = -1
    for index in range(len(data) - 1):
        if data[index] == 58 and data[index + 1] in (9, 32):
            separator = index
            break
    if separator < 0:
        return None
    return _make_tokens(data[:separator]), _make_tokens(data[separator + 1 :])


def _split_synthesis_depfile(data):
    """Return raw MWCC target/dependency tokens, preserving Windows slashes."""
    separator = -1
    for index in range(len(data) - 1):
        if data[index] == 58 and data[index + 1] in (9, 32):
            separator = index
            break
    if separator < 0:
        return None
    return (
        _make_synthesis_tokens(data[:separator]),
        _make_synthesis_tokens(data[separator + 1 :]),
    )


def _is_absolute_dependency(path_bytes):
    if path_bytes.startswith((b"/", b"\\")):
        return True
    return (
        len(path_bytes) >= 3
        and path_bytes[0:1].lower() >= b"a"
        and path_bytes[0:1].lower() <= b"z"
        and path_bytes[1:2] == b":"
        and path_bytes[2:3] in (b"/", b"\\")
    )


def _path_is_within(path, directory):
    try:
        return os.path.commonpath((os.path.abspath(path), os.path.abspath(directory))) == (
            os.path.abspath(directory)
        )
    except ValueError:
        return False


def _mwcc_token_path(token, cwd):
    """Map one unescaped raw MWCC path to a host path and emission kind."""
    if (
        len(token) >= 3
        and token[0:1].lower() == b"z"
        and token[1:2] == b":"
        and token[2:3] in (b"/", b"\\")
    ):
        suffix = os.fsdecode(token[3:]).replace("\\", os.sep).replace("/", os.sep)
        return os.path.normpath(os.sep + suffix), "absolute", None
    if (
        len(token) >= 3
        and b"a" <= token[0:1].lower() <= b"z"
        and token[1:2] == b":"
        and token[2:3] in (b"/", b"\\")
    ):
        return None, None, "unsupported MWCC drive path: %s" % os.fsdecode(token)
    if token.startswith(b"/"):
        return os.path.normpath(os.fsdecode(token)), "absolute", None
    if token.startswith(b"\\"):
        return None, None, "unsupported root-relative MWCC path: %s" % os.fsdecode(
            token
        )
    relative = os.fsdecode(token).replace("\\", os.sep).replace("/", os.sep)
    return os.path.abspath(os.path.join(cwd, relative)), "relative", None


def _dependency_manifest(depfile_bytes, cwd, expected_target):
    split = _split_depfile(depfile_bytes)
    if not split:
        return None, "dependency file has no dependencies"
    targets, tokens = split
    if not targets or not tokens:
        return None, "dependency file has no target or dependencies"
    for target in targets:
        if _is_absolute_dependency(target):
            return None, "absolute dependency target: %s" % os.fsdecode(target)
        target_text = os.fsdecode(target)
        if (
            "/" in target_text
            or "\\" in target_text
            or target_text != expected_target
        ):
            return None, "output-specific dependency target: %s" % target_text
    dependencies = []
    for token in tokens:
        if _is_absolute_dependency(token):
            return None, "absolute dependency path: %s" % os.fsdecode(token)
        dependency_path = os.fsdecode(token)
        filesystem_path = dependency_path.replace("\\", os.sep)
        resolved = os.path.abspath(os.path.join(cwd, filesystem_path))
        try:
            content_digest = _sha256_file(resolved)
        except OSError as error:
            return None, "cannot hash dependency %s: %s" % (dependency_path, error)
        dependencies.append({"path": dependency_path, "sha256": content_digest})
    return dependencies, None


def _synthesis_dependency_manifest(depfile_bytes, cwd, expected_object):
    split = _split_synthesis_depfile(depfile_bytes)
    if not split:
        return None, None, "dependency file has no dependencies"
    targets, tokens = split
    if len(targets) != 1 or not tokens:
        return None, None, "dependency file has no single target or dependencies"
    target_path, _target_kind, target_error = _mwcc_token_path(targets[0], cwd)
    if target_error:
        return None, None, target_error
    if os.path.normcase(target_path) != os.path.normcase(
        os.path.normpath(expected_object)
    ):
        return (
            None,
            None,
            "dependency target does not match output: %s" % os.fsdecode(targets[0]),
        )

    dependencies = []
    worktree_only = False
    for token in tokens:
        resolved, path_kind, path_error = _mwcc_token_path(token, cwd)
        if path_error:
            return None, None, path_error
        cwd_relative = _path_is_within(resolved, cwd)
        stored_path = os.path.relpath(resolved, cwd) if cwd_relative else resolved
        if not cwd_relative:
            worktree_only = True
        try:
            content_digest = _sha256_file(resolved)
        except OSError as error:
            return (
                None,
                None,
                "cannot hash dependency %s: %s" % (stored_path, error),
            )
        dependencies.append(
            {
                "path": stored_path,
                "sha256": content_digest,
                "mwcc_path_kind": path_kind,
            }
        )
    return dependencies, worktree_only, None


def _validate_manifest(manifest, cwd):
    if not isinstance(manifest, dict) or manifest.get("version") != FORMAT_VERSION:
        return None, "missing or invalid manifest"
    stored_dependencies = manifest.get("dependencies")
    if not isinstance(stored_dependencies, list) or not stored_dependencies:
        return None, "missing or invalid dependency list"
    dependencies = []
    for stored in stored_dependencies:
        if not isinstance(stored, dict):
            return None, "invalid dependency record"
        path = stored.get("path")
        expected_digest = stored.get("sha256")
        if not isinstance(path, str) or not isinstance(expected_digest, str):
            return None, "invalid dependency record"
        path_bytes = os.fsencode(path)
        if _is_absolute_dependency(path_bytes):
            return None, "absolute dependency path in manifest: %s" % path
        resolved = os.path.abspath(
            os.path.join(cwd, path.replace("\\", os.sep))
        )
        try:
            actual_digest = _sha256_file(resolved)
        except OSError:
            return None, "dependency disappeared: %s" % path
        if actual_digest != expected_digest:
            return None, "dependency changed: %s" % path
        dependencies.append({"path": path, "sha256": actual_digest})
    layout_error = _validate_include_layout(manifest.get("include_layout"), cwd)
    if layout_error:
        return None, layout_error
    return dependencies, None


def _validate_synthesis_manifest(manifest, cwd):
    if (
        not isinstance(manifest, dict)
        or manifest.get("version") != FORMAT_VERSION
        or manifest.get("dependency_mode") != "synthesize"
        or manifest.get("synthesis_version") != SYNTHESIS_VERSION
    ):
        return None, "missing or invalid synthesis manifest"
    worktree_only = manifest.get("worktree_only")
    if not isinstance(worktree_only, bool):
        return None, "missing or invalid worktree-only tag"
    if worktree_only:
        manifest_cwd = manifest.get("worktree_cwd")
        if not isinstance(manifest_cwd, str):
            return None, "missing worktree cwd"
        if os.path.normcase(os.path.normpath(manifest_cwd)) != os.path.normcase(
            os.path.normpath(cwd)
        ):
            return None, "entry is restricted to worktree: %s" % manifest_cwd

    stored_dependencies = manifest.get("dependencies")
    if not isinstance(stored_dependencies, list) or not stored_dependencies:
        return None, "missing or invalid dependency list"
    dependencies = []
    found_absolute = False
    for stored in stored_dependencies:
        if not isinstance(stored, dict):
            return None, "invalid dependency record"
        path = stored.get("path")
        expected_digest = stored.get("sha256")
        path_kind = stored.get("mwcc_path_kind")
        if (
            not isinstance(path, str)
            or not isinstance(expected_digest, str)
            or path_kind not in ("absolute", "relative")
        ):
            return None, "invalid dependency record"
        if os.path.isabs(path):
            found_absolute = True
            resolved = os.path.normpath(path)
        else:
            resolved = os.path.abspath(os.path.join(cwd, path))
            if not _path_is_within(resolved, cwd):
                return None, "relative dependency escapes cwd: %s" % path
        try:
            actual_digest = _sha256_file(resolved)
        except OSError:
            return None, "dependency disappeared: %s" % path
        if actual_digest != expected_digest:
            return None, "dependency changed: %s" % path
        dependencies.append(
            {
                "path": path,
                "sha256": actual_digest,
                "mwcc_path_kind": path_kind,
            }
        )
    if found_absolute and not worktree_only:
        return None, "absolute dependency is not tagged worktree-only"
    if worktree_only and not found_absolute:
        return None, "worktree-only manifest has no outside-cwd dependency"
    layout_error = _validate_include_layout(manifest.get("include_layout"), cwd)
    if layout_error:
        return None, layout_error
    return dependencies, None


def _mwcc_path_bytes(path, absolute):
    normalized = os.path.normpath(path)
    encoded = os.fsencode(normalized).replace(b"/", b"\\")
    if absolute:
        if not os.path.isabs(normalized):
            raise ValueError("expected an absolute host path: %s" % normalized)
        encoded = b"Z:" + encoded
    return encoded.replace(b" ", b"\\ ")


def _synthesize_depfile(manifest, cwd, shape):
    object_name = os.path.basename(shape["object"])
    target_path = os.path.normpath(
        os.path.join(shape["output_argument"], object_name)
    )
    target = _mwcc_path_bytes(target_path, os.path.isabs(target_path))

    rendered_dependencies = []
    for dependency in manifest["dependencies"]:
        stored_path = dependency["path"]
        if dependency["mwcc_path_kind"] == "absolute":
            resolved = (
                os.path.normpath(stored_path)
                if os.path.isabs(stored_path)
                else os.path.abspath(os.path.join(cwd, stored_path))
            )
            rendered_dependencies.append(_mwcc_path_bytes(resolved, True))
        else:
            relative = (
                os.path.relpath(stored_path, cwd)
                if os.path.isabs(stored_path)
                else stored_path
            )
            rendered_dependencies.append(_mwcc_path_bytes(relative, False))

    data = target + b": " + rendered_dependencies[0]
    for dependency in rendered_dependencies[1:]:
        data += b" \\\r\n\t" + dependency
    return data + b" \r\n"


def _run_real(real_wibo, arguments, temporary_directory):
    stdout_path = _temporary_path(temporary_directory, "stdout")
    stderr_path = _temporary_path(temporary_directory, "stderr")
    stdout_descriptor = -1
    stderr_descriptor = -1
    try:
        stdout_descriptor = os.open(
            stdout_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        stderr_descriptor = os.open(
            stderr_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
        )
        try:
            sys.stdout.flush()
            sys.stderr.flush()
        except (AttributeError, OSError):
            pass
        child = os.fork()
        if child == 0:
            os.dup2(stdout_descriptor, 1)
            os.dup2(stderr_descriptor, 2)
            os.close(stdout_descriptor)
            os.close(stderr_descriptor)
            _exec_real(real_wibo, arguments)
        os.close(stdout_descriptor)
        stdout_descriptor = -1
        os.close(stderr_descriptor)
        stderr_descriptor = -1
        while True:
            try:
                _pid, status = os.waitpid(child, 0)
                break
            except InterruptedError:
                continue
        try:
            stdout_data = _read_file(stdout_path)
        except OSError:
            stdout_data = b""
        try:
            stderr_data = _read_file(stderr_path)
        except OSError:
            stderr_data = b""
        exit_code = os.waitstatus_to_exitcode(status)
        if exit_code < 0:
            exit_code = 128 - exit_code
        return exit_code, stdout_data, stderr_data
    finally:
        if stdout_descriptor >= 0:
            os.close(stdout_descriptor)
        if stderr_descriptor >= 0:
            os.close(stderr_descriptor)
        for path in (stdout_path, stderr_path):
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass


def _captured_compile(real_wibo, arguments, temporary_directory):
    try:
        return _run_real(real_wibo, arguments, temporary_directory)
    except OSError as error:
        _write_all(
            2,
            os.fsencode(
                "mwcc_objcache: cannot capture compiler output, passing through: %s\n"
                % error
            ),
        )
        _exec_real(real_wibo, arguments)


def _replay(stdout_data, stderr_data):
    if stdout_data:
        _write_all(1, stdout_data)
    if stderr_data:
        _write_all(2, stderr_data)


def _entry_directory(cache_directory, full_key):
    return os.path.join(cache_directory, "objects", full_key[:2], full_key)


def _poison_path(cache_directory, full_key):
    return os.path.join(cache_directory, "poison", full_key[:2], full_key)


def _entry_data(entry_directory, full_key, manifest_bytes, dependency_mode="strict"):
    payload_names = ["object", "stdout", "stderr"]
    if dependency_mode == "strict":
        payload_names.append("depfile")
    names = tuple(payload_names) + ("manifest.json", "meta.json")
    try:
        values = {name: _read_file(os.path.join(entry_directory, name)) for name in names}
    except OSError:
        return None
    if values["manifest.json"] != manifest_bytes:
        return None
    metadata = None
    try:
        metadata = json.loads(values["meta.json"])
    except (ValueError, TypeError):
        return None
    if (
        not isinstance(metadata, dict)
        or metadata.get("version") != FORMAT_VERSION
        or metadata.get("full_key") != full_key
    ):
        return None
    if dependency_mode == "synthesize" and metadata.get(
        "dependency_mode"
    ) != "synthesize":
        return None
    for name in tuple(payload_names) + ("manifest.json",):
        if metadata.get(name + "_sha256") != _sha256_bytes(values[name]):
            return None
    return values


def _store_entry(
    cache_directory,
    full_key,
    manifest_bytes,
    values,
    dependency_mode="strict",
):
    if os.path.exists(_poison_path(cache_directory, full_key)):
        return
    parent = os.path.join(cache_directory, "objects", full_key[:2])
    _mkdir(parent)
    final_directory = os.path.join(parent, full_key)
    temporary_directory = _temporary_path(parent, full_key)
    os.mkdir(temporary_directory, 0o777)
    try:
        metadata = {"version": FORMAT_VERSION, "full_key": full_key}
        if dependency_mode == "synthesize":
            metadata["dependency_mode"] = "synthesize"
        for name, data in values.items():
            _atomic_write(os.path.join(temporary_directory, name), data)
            metadata[name + "_sha256"] = _sha256_bytes(data)
        _atomic_write(os.path.join(temporary_directory, "manifest.json"), manifest_bytes)
        metadata["manifest.json_sha256"] = _sha256_bytes(manifest_bytes)
        _atomic_write(os.path.join(temporary_directory, "meta.json"), _json_bytes(metadata))
        try:
            os.rename(temporary_directory, final_directory)
            temporary_directory = None
        except OSError:
            if (
                _entry_data(
                    final_directory, full_key, manifest_bytes, dependency_mode
                )
                is not None
            ):
                return
            quarantine_parent = os.path.join(cache_directory, "corrupt")
            _mkdir(quarantine_parent)
            quarantine = _temporary_path(quarantine_parent, full_key)
            try:
                os.rename(final_directory, quarantine)
            except OSError:
                pass
            try:
                os.rename(temporary_directory, final_directory)
                temporary_directory = None
            except OSError:
                if (
                    _entry_data(
                        final_directory, full_key, manifest_bytes, dependency_mode
                    )
                    is None
                ):
                    raise
    finally:
        if temporary_directory:
            for name in os.listdir(temporary_directory):
                try:
                    os.unlink(os.path.join(temporary_directory, name))
                except FileNotFoundError:
                    pass
            try:
                os.rmdir(temporary_directory)
            except FileNotFoundError:
                pass


def _stats(cache_directory, outcome):
    stats_path = os.path.join(cache_directory, "stats")
    try:
        _append_log(stats_path, (outcome + "\n").encode("ascii"))
    except OSError as error:
        _write_all(
            2,
            os.fsencode("mwcc_objcache: cannot update stats: %s\n" % error),
        )
        return
    if not _enabled("MWCC_CACHE_STATS"):
        return
    try:
        events = _read_file(stats_path).splitlines()
    except OSError:
        events = []
    hits = sum(1 for event in events if event == b"hit")
    misses = sum(1 for event in events if event == b"miss")
    _write_all(
        2,
        ("mwcc_objcache: hits=%d misses=%d\n" % (hits, misses)).encode("ascii"),
    )


def _uncacheable(cache_directory, reason, depfile_path):
    message = "mwcc_objcache: uncacheable %s: %s\n" % (depfile_path, reason)
    encoded = os.fsencode(message)
    _write_all(2, encoded)
    try:
        _append_log(os.path.join(cache_directory, "uncacheable.log"), encoded)
    except OSError:
        pass


def _poison_entry(cache_directory, full_key, cached, compiled, details):
    poison_path = _poison_path(cache_directory, full_key)
    poison_recorded = False
    errors = []
    try:
        _atomic_write(poison_path, _json_bytes(details))
        poison_recorded = True
    except OSError as error:
        errors.append("tombstone: %s" % error)
    entry_directory = _entry_directory(cache_directory, full_key)
    poisoned_parent = os.path.join(cache_directory, "poisoned")
    try:
        _mkdir(poisoned_parent)
        poisoned_entry = _temporary_path(poisoned_parent, full_key)
        os.rename(entry_directory, poisoned_entry)
        poison_recorded = True
    except OSError as error:
        errors.append("quarantine: %s" % error)

    failures_parent = os.path.join(cache_directory, "verify-failures")
    failure_directory = "<diagnostic write failed>"
    payloads = {
        "cached.o": cached.get("object", b""),
        "cached.d": cached.get("depfile", b""),
        "compiled.o": compiled.get("object", b""),
        "compiled.d": compiled.get("depfile", b""),
        "compiled.stdout": compiled.get("stdout", b""),
        "compiled.stderr": compiled.get("stderr", b""),
        "details.json": _json_bytes(details),
    }
    try:
        _mkdir(failures_parent)
        failure_directory = _temporary_path(failures_parent, full_key)
        os.mkdir(failure_directory, 0o777)
        for name, data in payloads.items():
            _atomic_write(os.path.join(failure_directory, name), data)
    except OSError as error:
        errors.append("diagnostics: %s" % error)
    _write_all(
        2,
        (
            "mwcc_objcache: verification failed; %s %s; details in %s%s\n"
            % (
                "poisoned" if poison_recorded else "COULD NOT POISON",
                full_key,
                failure_directory,
                "; " + "; ".join(errors) if errors else "",
            )
        ).encode("utf-8", "backslashreplace"),
    )


def _main():
    arguments = sys.argv[1:]
    real_wibo = _real_wibo()
    shape = _compile_shape(arguments)
    if _enabled("MWCC_CACHE_DISABLE") or shape is None:
        _exec_real(real_wibo, arguments)
    dependency_mode = os.environ.get("MWCC_CACHE_DEPMODE", "synthesize")
    if dependency_mode not in ("strict", "synthesize"):
        _write_all(
            2,
            os.fsencode(
                "mwcc_objcache: invalid MWCC_CACHE_DEPMODE=%s; passing through\n"
                % dependency_mode
            ),
        )
        _exec_real(real_wibo, arguments)
    cwd = os.getcwd()

    cache_directory = os.path.abspath(
        os.environ.get("MWCC_CACHE_DIR", "/tmp/mwcc-objcache")
    )
    try:
        _mkdir(cache_directory)
        temporary_directory = os.path.join(cache_directory, "tmp")
        _mkdir(temporary_directory)
        source_bytes = _read_file(shape["source"])
        digest_cache_path = os.path.join(cache_directory, "tool-digests.json")
        digest_cache = _load_json(digest_cache_path)
        if not isinstance(digest_cache, dict):
            digest_cache = {}
        real_digest, real_changed = _tool_digest(real_wibo, digest_cache)
        compiler_digest, compiler_changed = _tool_digest(shape["compiler"], digest_cache)
        wrapper_digest = None
        wrapper_changed = False
        if shape["wrapper"]:
            wrapper_digest, wrapper_changed = _tool_digest(shape["wrapper"], digest_cache)
        if real_changed or compiler_changed or wrapper_changed:
            _atomic_write(digest_cache_path, _json_bytes(digest_cache))
    except OSError as error:
        _write_all(
            2,
            os.fsencode("mwcc_objcache: cache setup failed, passing through: %s\n" % error),
        )
        _exec_real(real_wibo, arguments)

    base_key = _base_key(
        real_digest,
        wrapper_digest,
        compiler_digest,
        shape["normalized_arguments"],
        source_bytes,
        dependency_mode,
    )
    manifest_directory = os.path.join(cache_directory, "manifests", base_key[:2])
    portable_manifest_path = os.path.join(manifest_directory, base_key + ".json")
    worktree_manifest_path = os.path.join(
        manifest_directory,
        base_key + "." + _sha256_bytes(os.fsencode(cwd)) + ".json",
    )
    manifest_path = portable_manifest_path
    if dependency_mode == "synthesize" and os.path.isfile(worktree_manifest_path):
        manifest_path = worktree_manifest_path
    manifest = _load_json(manifest_path)
    if dependency_mode == "strict":
        dependencies, miss_reason = _validate_manifest(manifest, cwd)
    else:
        dependencies, miss_reason = _validate_synthesis_manifest(manifest, cwd)
    cache_values = None
    cache_depfile = None
    full_key = None
    manifest_bytes = None
    if dependencies is not None:
        full_key = _full_key(
            base_key,
            dependencies,
            manifest["include_layout"],
            manifest if dependency_mode == "synthesize" else None,
        )
        manifest_bytes = _json_bytes(manifest)
        if os.path.exists(_poison_path(cache_directory, full_key)):
            miss_reason = "cache entry is poisoned"
        else:
            cache_values = _entry_data(
                _entry_directory(cache_directory, full_key),
                full_key,
                manifest_bytes,
                dependency_mode,
            )
            if cache_values is None:
                miss_reason = "cache entry missing or corrupt"
            elif dependency_mode == "strict":
                cache_depfile = cache_values["depfile"]
            else:
                try:
                    cache_depfile = _synthesize_depfile(manifest, cwd, shape)
                except (OSError, TypeError, ValueError) as error:
                    cache_values = None
                    miss_reason = "cannot synthesize dependency file: %s" % error

    if cache_values is not None:
        if _enabled("MWCC_CACHE_VERIFY"):
            for output_path in (shape["object"], shape["depfile"]):
                try:
                    os.unlink(output_path)
                except FileNotFoundError:
                    pass
            exit_code, stdout_data, stderr_data = _captured_compile(
                real_wibo, arguments, temporary_directory
            )
            try:
                compiled_object = _read_file(shape["object"])
            except OSError:
                compiled_object = b""
            try:
                compiled_depfile = _read_file(shape["depfile"])
            except OSError:
                compiled_depfile = b""
            if exit_code != 0 or compiled_object != cache_values["object"]:
                details = {
                    "version": FORMAT_VERSION,
                    "cwd": cwd,
                    "argv": arguments,
                    "base_key": base_key,
                    "full_key": full_key,
                    "real_exit_code": exit_code,
                    "cached_object_sha256": _sha256_bytes(cache_values["object"]),
                    "compiled_object_sha256": _sha256_bytes(compiled_object),
                    "object_path": shape["object"],
                    "depfile_path": shape["depfile"],
                }
                cached_diagnostics = dict(cache_values)
                cached_diagnostics["depfile"] = cache_depfile
                _poison_entry(
                    cache_directory,
                    full_key,
                    cached_diagnostics,
                    {
                        "object": compiled_object,
                        "depfile": compiled_depfile,
                        "stdout": stdout_data,
                        "stderr": stderr_data,
                    },
                    details,
                )
                _replay(stdout_data, stderr_data)
                _stats(cache_directory, "miss")
                return exit_code
            try:
                _atomic_write(shape["object"], cache_values["object"])
                _atomic_write(shape["depfile"], cache_depfile)
            except OSError as error:
                _write_all(
                    2,
                    os.fsencode(
                        "mwcc_objcache: cannot restore verified cache output: %s\n"
                        % error
                    ),
                )
                _replay(stdout_data, stderr_data)
                _stats(cache_directory, "miss")
                return 0
        else:
            try:
                _atomic_write(shape["object"], cache_values["object"])
                _atomic_write(shape["depfile"], cache_depfile)
            except OSError as error:
                _write_all(
                    2,
                    os.fsencode(
                        "mwcc_objcache: cache hit could not write outputs; "
                        "running compiler: %s\n" % error
                    ),
                )
                exit_code, stdout_data, stderr_data = _captured_compile(
                    real_wibo, arguments, temporary_directory
                )
                _replay(stdout_data, stderr_data)
                _stats(cache_directory, "miss")
                return exit_code
        _replay(cache_values["stdout"], cache_values["stderr"])
        _stats(cache_directory, "hit")
        return 0

    exit_code, stdout_data, stderr_data = _captured_compile(
        real_wibo, arguments, temporary_directory
    )
    _replay(stdout_data, stderr_data)
    _stats(cache_directory, "miss")
    if exit_code != 0:
        return exit_code

    try:
        object_bytes = _read_file(shape["object"])
        depfile_bytes = _read_file(shape["depfile"])
    except OSError as error:
        _uncacheable(
            cache_directory,
            "successful compile did not produce both .o and .d: %s" % error,
            shape["depfile"],
        )
        return 0
    try:
        source_changed = _read_file(shape["source"]) != source_bytes
    except OSError:
        source_changed = True
    if source_changed:
        _uncacheable(
            cache_directory,
            "source changed while the compiler was running",
            shape["depfile"],
        )
        return 0

    worktree_only = False
    if dependency_mode == "strict":
        dependencies, reason = _dependency_manifest(
            depfile_bytes, cwd, os.path.basename(shape["object"])
        )
    else:
        dependencies, worktree_only, reason = _synthesis_dependency_manifest(
            depfile_bytes, cwd, shape["object"]
        )
    if dependencies is None:
        _uncacheable(cache_directory, reason, shape["depfile"])
        return 0
    try:
        include_layout = _capture_include_layout(
            arguments, shape["source"], dependencies, cwd
        )
    except OSError as error:
        _uncacheable(
            cache_directory,
            "cannot capture include-directory layout: %s" % error,
            shape["depfile"],
        )
        return 0
    if dependency_mode == "strict":
        manifest = {
            "version": FORMAT_VERSION,
            "dependencies": dependencies,
            "include_layout": include_layout,
        }
    else:
        manifest = {
            "version": FORMAT_VERSION,
            "dependency_mode": "synthesize",
            "synthesis_version": SYNTHESIS_VERSION,
            "dependencies": dependencies,
            "include_layout": include_layout,
            "worktree_only": worktree_only,
        }
        if worktree_only:
            manifest["worktree_cwd"] = cwd
    manifest_bytes = _json_bytes(manifest)
    full_key = _full_key(
        base_key,
        dependencies,
        include_layout,
        manifest if dependency_mode == "synthesize" else None,
    )
    values = {
        "object": object_bytes,
        "stdout": stdout_data,
        "stderr": stderr_data,
    }
    if dependency_mode == "strict":
        values["depfile"] = depfile_bytes
    try:
        _store_entry(
            cache_directory,
            full_key,
            manifest_bytes,
            values,
            dependency_mode,
        )
        if dependency_mode == "synthesize" and worktree_only:
            manifest_path = worktree_manifest_path
        else:
            manifest_path = portable_manifest_path
        _atomic_write(manifest_path, manifest_bytes)
    except OSError as error:
        _uncacheable(
            cache_directory,
            "cannot store cache entry: %s" % error,
            shape["depfile"],
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(_main())
    except KeyboardInterrupt:
        sys.exit(130)
